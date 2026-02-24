import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BrowserAdapter, Tool, AdapterResponse } from './base';
import { logger } from '../logger';
import { config } from '../config';

const CAPABILITIES: Record<string, { context: string, navigate: string, keyword: string }> = {
    'playwright': { context: 'playwright_get_html', navigate: 'playwright_navigate', keyword: 'playwright' },
    'vibium': { context: 'get_visual_context', navigate: 'navigate', keyword: 'vibium' },
    'vercel': { context: 'agent_browser_get_dom', navigate: 'agent_browser_navigate', keyword: 'agent_browser' },
    'chrome': { context: 'chrome_devtools_get_dom', navigate: 'chrome_devtools_navigate', keyword: 'chrome' },
    'selenium': { context: 'get_page_source', navigate: 'navigate', keyword: 'selenium' }
};

export class McpAdapter implements BrowserAdapter {
    public name: string;
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private serverCommand: string;
    private serverArgs: string[];
    private tools: Tool[] = [];
    private activeCapability: { context: string, navigate: string } | null = null;
    private toolTimeout: number = config.benchmark.defaultToolTimeoutMs;
    private cleanupHandler: (() => Promise<void>) | null = null;

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
        for (const cap of Object.values(CAPABILITIES)) {
            if (toolNames.includes(cap.keyword)) {
                this.activeCapability = { context: cap.context, navigate: cap.navigate };
                logger.debug('MCP', `Detected capability set for ${this.name}: ${cap.keyword}`);
                break;
            }
        }

        if (!this.activeCapability && this.name.toLowerCase().includes('vibium')) {
            this.activeCapability = CAPABILITIES['vibium'];
        }

        if (this.name.includes('Chrome-DevTools')) {
            this.toolTimeout = config.benchmark.chromeDevToolsTimeoutMs;
            logger.debug('MCP', `Increased tool timeout to ${this.toolTimeout}ms for ${this.name}`);
        }
    }

    getTools(): Tool[] {
        return this.tools;
    }

    async executeTool(name: string, args: any): Promise<AdapterResponse> {
        if (!this.client) throw new Error("MCP Client not initialized");

        try {
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

    async getPageContext(): Promise<string> {
        if (!this.client) return "Client not initialized";

        // Priority 1: Visual/Rich context tools (Vibium, screenshots, etc.)
        const visualTools = this.tools.filter(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('visual') || lowName.includes('screenshot') || lowName === 'get_visual_context';
        });

        for (const tool of visualTools) {
            try {
                const result = await this.executeTool(tool.name, {});
                if (result.success && result.message && result.message.length > 100) {
                    logger.debug('MCP', `Using visual tool: ${tool.name} (${result.message.length} chars)`);
                    return result.message;
                }
            } catch (e) {
                logger.debug('MCP', `Visual tool ${tool.name} failed, trying next...`);
            }
        }

        // Priority 2: Chrome DevTools with deep Shadow DOM support
        const evalTool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('evaluate') || lowName.includes('exec') || lowName.includes('script');
        });

        if (this.name.includes('Chrome-DevTools') && evalTool) {
            const script = `
                (() => {
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
                            const isClickable = ['BUTTON', 'INPUT', 'A'].includes(el.tagName) || el.hasAttribute('onclick');
                            if (isClickable) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    elements.push(\`\${el.tagName} id="\${el.id}" text="\${el.textContent?.trim().slice(0,20)}"\`);
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
                })()
            `;
            const evalArgs = JSON.stringify(evalTool.parameters).includes('expression') ? { expression: script } : { script: script };
            const result = await this.executeTool(evalTool.name, evalArgs);
            if (result.success && result.message && result.message.length > 100) {
                logger.debug('MCP', `Using Chrome DevTools eval: ${result.message.length} chars`);
                return result.message;
            }
        }

        // Priority 3: Capability-specific context tools (get_html, get_dom, etc.)
        if (this.activeCapability) {
            const result = await this.executeTool(this.activeCapability.context, {});
            if (result.success && result.message && result.message.length > 100) {
                logger.debug('MCP', `Using capability tool ${this.activeCapability.context}: ${result.message.length} chars`);
                return result.message;
            }
        }

        // Priority 4: Generic evaluate/script tools
        if (evalTool) {
            const script = `
                (() => {
                    if (!document.body) return "Empty Body";
                    const interactive = Array.from(document.querySelectorAll('button, input, a'))
                        .filter(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0;
                        })
                        .map(el => \`\${el.tagName} id="\${el.id}" text="\${el.textContent?.trim().slice(0,30)}"\`)
                        .join('\\n');
                    return document.body.innerText.slice(0, 2000) + '\\nINTERACTIVE ELEMENTS:\\n' + interactive;
                })()
            `;
            const evalArgs = JSON.stringify(evalTool.parameters).includes('expression') ? { expression: script } : { script: script };
            const result = await this.executeTool(evalTool.name, evalArgs);
            if (result.success && result.message && result.message.length > 100) {
                logger.debug('MCP', `Using generic eval: ${result.message.length} chars`);
                return result.message;
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
                    return result.message;
                }
            } catch (e) {
                // Continue to next tool
            }
        }

        logger.warn('MCP', `No suitable context tool found for ${this.name}`);
        return "MCP: No context tool found. Available: " + this.tools.map(t => t.name).join(', ');
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
