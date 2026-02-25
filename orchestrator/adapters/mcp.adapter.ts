import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BrowserAdapter, Tool, AdapterResponse, PageContext } from './base';
import { logger } from '../logger';
import { config } from '../config';

const CAPABILITIES: Record<string, { context: string[], navigate: string, keyword: string }> = {
    'playwright': { context: ['browser_snapshot'], navigate: 'browser_navigate', keyword: 'browser_snapshot' },
    'vibium': { context: ['browser_get_text', 'browser_get_html', 'browser_find'], navigate: 'browser_navigate', keyword: 'browser_find' },
    'vercel': { context: ['agent_browser_get_dom'], navigate: 'agent_browser_navigate', keyword: 'agent_browser' },
    'chrome': { context: ['take_snapshot'], navigate: 'navigate_page', keyword: 'take_snapshot' },
    'selenium': { context: ['get_page_source'], navigate: 'navigate', keyword: 'selenium' }
};

export class McpAdapter implements BrowserAdapter {
    public name: string;
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private serverCommand: string;
    private serverArgs: string[];
    private tools: Tool[] = [];
    private activeCapability: { context: string[], navigate: string } | null = null;
    private toolTimeout: number = config.benchmark.defaultToolTimeoutMs;
    private cleanupHandler: (() => Promise<void>) | null = null;
    private actionHistory: Array<{ tool: string, args: any, timestamp: number }> = [];
    private hasScreenshotSupport: boolean = false;

    constructor(name: string, command: string, args: string[] = []) {
        this.name = name;
        if (process.platform === 'win32' && (command === 'npx' || command === 'npm' || command.endsWith('.cmd') || command.endsWith('.ps1'))) {
            this.serverCommand = 'cmd.exe';
            this.serverArgs = ['/c', command, ...args];
        } else {
            this.serverCommand = command;
            this.serverArgs = args;
        }

        // Register cleanup handler for process termination
        this.cleanupHandler = async () => {
            logger.debug('MCP', `Emergency cleanup triggered for ${this.name}`);
            await this.cleanup();
        };

        process.on('exit', () => { this.cleanupHandler?.(); });
        process.on('SIGINT', () => { this.cleanupHandler?.().then(() => process.exit(0)); });
        process.on('SIGTERM', () => { this.cleanupHandler?.().then(() => process.exit(0)); });
        process.on('uncaughtException', (err) => {
            logger.error('MCP', `Uncaught exception in ${this.name}`, { error: err.message });
            this.cleanupHandler?.().then(() => process.exit(1));
        });
    }

    async init(): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= config.benchmark.maxRetries; attempt++) {
            try {
                logger.info('MCP', `Initializing ${this.name} (attempt ${attempt}/${config.benchmark.maxRetries})`);
                await this.initAttempt();
                logger.info('MCP', `${this.name} initialized successfully with ${this.tools.length} tools`);
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.warn('MCP', `Attempt ${attempt} failed for ${this.name}`, { error: lastError.message });

                // Clean up failed attempt
                await this.cleanup();

                if (attempt < config.benchmark.maxRetries) {
                    logger.info('MCP', `Retrying in ${config.benchmark.retryDelayMs}ms...`);
                    await new Promise(r => setTimeout(r, config.benchmark.retryDelayMs));
                }
            }
        }

        throw new Error(`[MCP] Adapter ${this.name} failed after ${config.benchmark.maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    private async initAttempt(): Promise<void> {
        this.transport = new StdioClientTransport({
            command: this.serverCommand,
            args: this.serverArgs,
            env: {
                ...process.env,
                CHROME_FLAGS: "--no-sandbox --disable-setuid-sandbox",
                CHROMIUM_FLAGS: "--no-sandbox --disable-setuid-sandbox",
                PUPPETEER_ARGS: "--no-sandbox --disable-setuid-sandbox",
                FORCE_COLOR: "0",
                BROWSER: "none"
            } as Record<string, string>,
        });

        this.client = new Client(
            { name: "benchmark-client", version: "1.0.0" },
            { capabilities: {} }
        );

        // Pre-flight Check: Add stabilization specifically for Vercel
        if (this.name.includes('Vercel-Agent')) {
            logger.debug('MCP', `Pre-flight: Waiting ${config.benchmark.vercelStabilizationDelayMs}ms for ${this.name} to stabilize...`);
            await new Promise(r => setTimeout(r, config.benchmark.vercelStabilizationDelayMs));
        }

        await this.client.connect(this.transport);

        const response = await this.client.listTools({}, { timeout: 10000 });
        this.tools = response.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            parameters: t.inputSchema as any
        }));

        if (this.tools.length === 0) {
            throw new Error("No tools discovered");
        }

        const toolNames = this.tools.map(t => t.name).join(' ');
        logger.info('MCP', `${this.name} discovered tools: ${this.tools.map(t => t.name).join(', ')}`);

        // Check for screenshot support
        this.hasScreenshotSupport = this.tools.some(t =>
            t.name.toLowerCase().includes('screenshot') ||
            t.name.toLowerCase().includes('capture')
        );
        if (this.hasScreenshotSupport) {
            logger.info('MCP', `Screenshot support detected for ${this.name}`);
        }

        // Detect capability set - first try keyword match, then adapter name match
        for (const [key, cap] of Object.entries(CAPABILITIES)) {
            if (toolNames.includes(cap.keyword)) {
                // Find which context tools actually exist (try in order of preference)
                const availableContextTools = cap.context.filter(toolName =>
                    this.tools.some(t => t.name === toolName)
                );

                if (availableContextTools.length > 0) {
                    this.activeCapability = { context: availableContextTools, navigate: cap.navigate };
                    logger.info('MCP', `Detected capability set for ${this.name}: ${key} (keyword: ${cap.keyword}, context tools: ${availableContextTools.join(', ')})`);
                    break;
                } else {
                    logger.warn('MCP', `Keyword '${cap.keyword}' matched but none of context tools [${cap.context.join(', ')}] found. Tools: ${toolNames}`);
                }
            }
        }

        // Fallback: match by adapter name
        if (!this.activeCapability) {
            const adapterLower = this.name.toLowerCase();
            for (const [key, cap] of Object.entries(CAPABILITIES)) {
                if (adapterLower.includes(key)) {
                    const availableContextTools = cap.context.filter(toolName =>
                        this.tools.some(t => t.name === toolName)
                    );

                    if (availableContextTools.length > 0) {
                        this.activeCapability = { context: availableContextTools, navigate: cap.navigate };
                        logger.info('MCP', `Detected capability set for ${this.name} via adapter name: ${key} (context tools: ${availableContextTools.join(', ')})`);
                        break;
                    }
                }
            }
        }

        if (!this.activeCapability) {
            logger.warn('MCP', `No capability set matched for ${this.name}. Available tools: ${toolNames}`);
        }

        if (this.name.includes('Chrome-DevTools')) {
            this.toolTimeout = config.benchmark.chromeDevToolsTimeoutMs;
            logger.debug('MCP', `Increased tool timeout to ${this.toolTimeout}ms for ${this.name}`);
        }
    }

    getTools(): Tool[] {
        return this.tools;
    }

    private isDuplicateAction(name: string, args: any): boolean {
        const recentActions = this.actionHistory.slice(-3);
        const argsStr = JSON.stringify(args);

        return recentActions.some(action =>
            action.tool === name && JSON.stringify(action.args) === argsStr
        );
    }

    private async waitForBrowserIdle(): Promise<void> {
        // Wait for network idle and DOM stability
        const idleDelay = 500;
        await new Promise(resolve => setTimeout(resolve, idleDelay));

        // Try to detect if page is still loading using evaluate
        const evalTool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('evaluate') || lowName.includes('exec') || lowName.includes('script');
        });

        if (evalTool && this.client) {
            try {
                const paramSchema = JSON.stringify(evalTool.parameters);
                let evalArgs: any;
                // Chrome DevTools MCP uses 'func' or 'fn' parameter for evaluate_script
                if (paramSchema.includes('"func"')) {
                    evalArgs = { func: `() => document.readyState === 'complete'` };
                } else if (paramSchema.includes('"fn"')) {
                    evalArgs = { fn: `() => document.readyState === 'complete'` };
                } else if (paramSchema.includes('"expression"')) {
                    evalArgs = { expression: `document.readyState === 'complete'` };
                } else {
                    evalArgs = { script: `document.readyState === 'complete'` };
                }

                // Call MCP directly to avoid executeTool's duplicate detection and recursive idle wait
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('readyState check timeout')), 3000)
                );
                await Promise.race([
                    this.client.callTool({ name: evalTool.name, arguments: evalArgs }),
                    timeoutPromise
                ]);
            } catch (e) {
                logger.debug('MCP', 'Could not check readyState, using fixed delay');
            }
        }
    }

    async executeTool(name: string, args: any): Promise<AdapterResponse> {
        if (!this.client) throw new Error("MCP Client not initialized");

        try {
            // Check for duplicate actions before executing
            const isNavigationOrClick = name.toLowerCase().includes('click') ||
                                       name.toLowerCase().includes('navigate') ||
                                       name.toLowerCase().includes('press');

            if (isNavigationOrClick && this.isDuplicateAction(name, args)) {
                logger.warn('MCP', `Duplicate action detected: ${name} with same args. Refusing to repeat.`);
                return {
                    success: false,
                    message: `DUPLICATE ACTION BLOCKED: "${name}" was already attempted with these exact parameters and failed. Try a different approach or selector.`
                };
            }

            const tool = this.tools.find(t => t.name === name);
            if (tool && args.url) {
                const schema = JSON.stringify(tool.parameters).toLowerCase();
                const isNavigation = name.includes('navigate') || name.includes('goto') || name.includes('open');
                if (isNavigation && schema.includes('"uri"') && !schema.includes('"url"')) {
                    args.uri = args.url;
                    delete args.url;
                }
            }

            const start = Date.now();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`[MCP] Tool ${name} timed out after ${this.toolTimeout}ms`)), this.toolTimeout)
            );
            const toolPromise = this.client.callTool({ name, arguments: args });
            const result = await Promise.race([toolPromise, timeoutPromise]) as any;
            const duration = Date.now() - start;

            // Record action in history
            this.actionHistory.push({ tool: name, args, timestamp: Date.now() });
            if (this.actionHistory.length > 10) {
                this.actionHistory.shift(); // Keep only last 10 actions
            }

            // Wait for browser idle after navigation or click
            if (isNavigationOrClick) {
                await this.waitForBrowserIdle();
            }

            let message = "";
            if (Array.isArray(result.content)) {
                message = result.content
                    .map((c: any) => {
                        if (c.type === 'text') return c.text;
                        if (c.type === 'image') return "[Image Content]";
                        return JSON.stringify(c);
                    })
                    .join('\n');
            } else if (result.content) {
                message = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
            }

            return {
                success: !result.isError,
                message: message || (result.isError ? "Tool execution failed" : "Tool executed"),
                contextSize: message.length,
                data: { durationMs: duration }
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    async getPageContext(): Promise<string | PageContext> {
        if (!this.client) return "Client not initialized";

        let contextParts: string[] = [];
        let screenshot: PageContext['screenshot'] | undefined;

        // Try to capture screenshot first if supported
        if (this.hasScreenshotSupport) {
            const screenshotTool = this.tools.find(t =>
                t.name.toLowerCase().includes('screenshot') ||
                t.name.toLowerCase().includes('capture')
            );

            if (screenshotTool) {
                try {
                    const screenshotResult = await this.client.callTool({
                        name: screenshotTool.name,
                        arguments: {}
                    });

                    if (screenshotResult.content && Array.isArray(screenshotResult.content)) {
                        const imageContent = screenshotResult.content.find((c: any) => c.type === 'image');
                        if (imageContent && imageContent.data) {
                            screenshot = {
                                type: 'image',
                                data: imageContent.data,
                                mimeType: imageContent.mimeType || 'image/png'
                            };
                            contextParts.push('[SCREENSHOT CAPTURED - Analyze the visual state carefully before taking action]');
                            logger.debug('MCP', `Screenshot captured via ${screenshotTool.name}`);
                        }
                    }
                } catch (e) {
                    logger.debug('MCP', `Screenshot capture failed: ${(e as Error).message}`);
                }
            }
        }

        // Priority 1: Visual/Rich context tools (Vibium, screenshots, etc.)
        const visualTools = this.tools.filter(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('visual') || lowName === 'get_visual_context';
        });

        for (const tool of visualTools) {
            try {
                const result = await this.executeTool(tool.name, {});
                if (result.success && result.message && result.message.length > 100) {
                    logger.debug('MCP', `Using visual tool: ${tool.name} (${result.message.length} chars)`);
                    contextParts.push(result.message);
                    const finalText = contextParts.join('\n\n');
                    return screenshot ? { text: finalText, screenshot } : finalText;
                }
            } catch (e) {
                logger.debug('MCP', `Visual tool ${tool.name} failed, trying next...`);
            }
        }

        // Priority 2: Evaluate tools (use for Chrome DevTools before capability-specific tools)
        const evalTool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('evaluate') || lowName.includes('exec') || lowName.includes('script');
        });

        // For Chrome DevTools, prefer evaluate_script over take_snapshot
        if (this.name.includes('Chrome-DevTools') && evalTool) {
            // Chrome DevTools evaluate_script expects a 'fn' parameter with a function string
            const fnBody = `() => {
                function getDeepContent(root, depth = 0) {
                    if (depth > 10) return "";
                    let text = "";
                    if (root.shadowRoot) {
                        text += " [SHADOW]: " + getDeepContent(root.shadowRoot, depth + 1);
                    }
                    for (const child of Array.from(root.childNodes || [])) {
                        if (child.nodeType === Node.TEXT_NODE) {
                            text += child.textContent.trim() + " ";
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            if (['SCRIPT', 'STYLE'].includes(child.tagName)) continue;
                            text += getDeepContent(child, depth + 1);
                        }
                    }
                    return text;
                }

                function getDeepInteractive(root, depth = 0) {
                    if (depth > 10) return [];
                    let elements = [];
                    const all = Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []);
                    for (const el of all) {
                        const isClickable = ['BUTTON', 'INPUT', 'A', 'SELECT'].includes(el.tagName) || el.hasAttribute('onclick');
                        if (isClickable) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                elements.push(el.tagName + ' id="' + el.id + '" text="' + (el.textContent?.trim().slice(0,20) || '') + '"');
                            }
                        }
                        if (el.shadowRoot) {
                            elements = elements.concat(getDeepInteractive(el.shadowRoot, depth + 1));
                        }
                    }
                    return elements;
                }
                const body = document.body || document.documentElement;
                const pageText = getDeepContent(body);
                const interactive = getDeepInteractive(body).slice(0, 30).join('\\n');
                return "VISIBLE TEXT:\\n" + pageText.slice(0, 2000) + '\\n\\nINTERACTIVE ELEMENTS:\\n' + interactive;
            }`;

            // Detect the correct parameter name from the tool's schema
            const paramSchema = JSON.stringify(evalTool.parameters);
            let evalArgs: any;
            if (paramSchema.includes('"func"')) {
                evalArgs = { func: fnBody };
            } else if (paramSchema.includes('"fn"')) {
                evalArgs = { fn: fnBody };
            } else if (paramSchema.includes('"code"')) {
                evalArgs = { code: `(${fnBody})()` };
            } else if (paramSchema.includes('"expression"')) {
                evalArgs = { expression: `(${fnBody})()` };
            } else {
                evalArgs = { script: `(${fnBody})()` };
            }

            logger.debug('MCP', `Attempting Chrome DevTools eval with ${evalTool.name}, param: ${Object.keys(evalArgs)[0]}`);
            const result = await this.executeTool(evalTool.name, evalArgs);
            logger.debug('MCP', `Chrome DevTools eval result: success=${result.success}, length=${result.message?.length || 0}`);
            if (result.success && result.message && result.message.length > 100) {
                logger.debug('MCP', `Using Chrome DevTools eval: ${result.message.length} chars`);
                contextParts.push(result.message);
                const finalText = contextParts.join('\n\n');
                return screenshot ? { text: finalText, screenshot } : finalText;
            } else {
                logger.warn('MCP', `Chrome DevTools eval failed or returned short content: ${result.message?.substring(0, 200)}`);
            }
        }

        // Priority 3: Capability-specific context tools (get_html, get_dom, etc.)
        if (this.activeCapability) {
            for (const contextTool of this.activeCapability.context) {
                try {
                    // Some tools require arguments (e.g., Vibium's browser_find needs a selector)
                    let args: any = {};
                    if (contextTool === 'browser_find') {
                        args = { selector: 'body' };
                    }

                    const result = await this.executeTool(contextTool, args);
                    if (result.success && result.message && result.message.length > 100) {
                        logger.debug('MCP', `Using capability tool ${contextTool}: ${result.message.length} chars`);
                        contextParts.push(result.message);
                        const finalText = contextParts.join('\n\n');
                        return screenshot ? { text: finalText, screenshot } : finalText;
                    }
                } catch (e) {
                    logger.debug('MCP', `Capability tool ${contextTool} failed, trying next...`);
                }
            }
        }

        // Priority 4: Generic evaluate/script tools
        if (evalTool) {
            const fnBody = `() => {
                if (!document.body) return "Empty Body";
                const interactive = Array.from(document.querySelectorAll('button, input, a, select'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    })
                    .map(el => el.tagName + ' id="' + el.id + '" text="' + (el.textContent?.trim().slice(0,30) || '') + '"')
                    .join('\\n');
                return document.body.innerText.slice(0, 2000) + '\\nINTERACTIVE ELEMENTS:\\n' + interactive;
            }`;

            const paramSchema = JSON.stringify(evalTool.parameters);
            let evalArgs: any;
            if (paramSchema.includes('"func"')) {
                evalArgs = { func: fnBody };
            } else if (paramSchema.includes('"fn"')) {
                evalArgs = { fn: fnBody };
            } else if (paramSchema.includes('"expression"')) {
                evalArgs = { expression: `(${fnBody})()` };
            } else {
                evalArgs = { script: `(${fnBody})()` };
            }

            const result = await this.executeTool(evalTool.name, evalArgs);
            if (result.success && result.message && result.message.length > 100) {
                logger.debug('MCP', `Using generic eval: ${result.message.length} chars`);
                contextParts.push(result.message);
                const finalText = contextParts.join('\n\n');
                return screenshot ? { text: finalText, screenshot } : finalText;
            }
        }

        // Priority 5: Fallback - any tool with "get" or "page" in name
        const fallbackTools = this.tools.filter(t => {
            const lowName = t.name.toLowerCase();
            return (lowName.includes('get') || lowName.includes('page')) &&
                   !lowName.includes('navigate') && !lowName.includes('click');
        });

        for (const tool of fallbackTools) {
            try {
                const result = await this.executeTool(tool.name, {});
                if (result.success && result.message && result.message.length > 100) {
                    logger.debug('MCP', `Using fallback tool ${tool.name}: ${result.message.length} chars`);
                    contextParts.push(result.message);
                    const finalText = contextParts.join('\n\n');
                    return screenshot ? { text: finalText, screenshot } : finalText;
                }
            } catch (e) {
                // Continue to next tool
            }
        }

        logger.warn('MCP', `No suitable context tool found for ${this.name}`);
        if (contextParts.length > 0) {
            const finalText = contextParts.join('\n\n');
            return screenshot ? { text: finalText, screenshot } : finalText;
        }
        const errorText = "MCP: No context tool found. Available: " + this.tools.map(t => t.name).join(', ');
        return screenshot ? { text: errorText, screenshot } : errorText;
    }

    private async cleanup(): Promise<void> {
        if (this.transport) {
            try {
                // Try to close gracefully first
                const closePromise = (this.transport as any).close();
                await Promise.race([
                    closePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 3000))
                ]);
            } catch (e) {
                logger.debug('MCP', `Cleanup error for ${this.name} (expected on crash)`, { error: (e as Error).message });

                // Force kill child process if it exists
                try {
                    const transport = this.transport as any;
                    if (transport._process && !transport._process.killed) {
                        logger.debug('MCP', `Force killing process for ${this.name}`);
                        transport._process.kill('SIGKILL');
                    }
                } catch (killError) {
                    logger.debug('MCP', `Force kill failed for ${this.name}`, { error: (killError as Error).message });
                }
            }
        }
        this.client = null;
        this.transport = null;
        this.tools = [];
        this.activeCapability = null;
    }

    async close(): Promise<void> {
        await this.cleanup();

        // Remove cleanup handlers to prevent duplicate calls
        if (this.cleanupHandler) {
            process.removeListener('exit', this.cleanupHandler as any);
            process.removeListener('SIGINT', this.cleanupHandler as any);
            process.removeListener('SIGTERM', this.cleanupHandler as any);
            process.removeListener('uncaughtException', this.cleanupHandler as any);
            this.cleanupHandler = null;
        }
    }
}
