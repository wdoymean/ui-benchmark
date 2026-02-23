import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BrowserAdapter, Tool, AdapterResponse } from './base';

const CAPABILITIES: Record<string, { context: string, navigate: string, keyword: string }> = {
    'playwright': { context: 'playwright_get_html', navigate: 'playwright_navigate', keyword: 'playwright' },
    'vibium': { context: 'get_visual_context', navigate: 'navigate', keyword: 'vibium' },
    'vercel': { context: 'agent_browser_get_dom', navigate: 'agent_browser_navigate', keyword: 'agent_browser' },
    'chrome': { context: 'chrome_devtools_get_dom', navigate: 'chrome_devtools_navigate', keyword: 'chrome_devtools' }
};

export class McpAdapter implements BrowserAdapter {
    public name: string;
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private serverCommand: string;
    private serverArgs: string[];
    private tools: Tool[] = [];
    private activeCapability: { context: string, navigate: string } | null = null;

    constructor(name: string, command: string, args: string[] = []) {
        this.name = name;
        // On Windows, running .cmd or .ps1 files usually requires a shell or explicit cmd /c
        if (process.platform === 'win32' && (command === 'npx' || command === 'npm' || command.endsWith('.cmd') || command.endsWith('.ps1'))) {
            this.serverCommand = 'cmd.exe';
            this.serverArgs = ['/c', command, ...args];
        } else {
            this.serverCommand = command;
            this.serverArgs = args;
        }
    }

    async init(): Promise<void> {
        console.log(`[MCP] Initializing ${this.name} with command: ${this.serverCommand} ${this.serverArgs.join(' ')}`);

        this.transport = new StdioClientTransport({
            command: this.serverCommand,
            args: this.serverArgs,
            env: {
                ...process.env,
                CHROME_FLAGS: "--no-sandbox --disable-setuid-sandbox",
                CHROMIUM_FLAGS: "--no-sandbox --disable-setuid-sandbox",
                PUPPETEER_ARGS: "--no-sandbox --disable-setuid-sandbox",
            } as Record<string, string>,
        });

        this.client = new Client(
            {
                name: "benchmark-client",
                version: "1.0.0",
            },
            {
                capabilities: {},
            }
        );

        try {
            await this.client.connect(this.transport);

            // Discover tools
            const response = await this.client.listTools();
            this.tools = response.tools.map(t => ({
                name: t.name,
                description: t.description || '',
                parameters: t.inputSchema as any
            }));

            if (this.tools.length === 0) {
                throw new Error("No tools discovered");
            }

            // Auto-Detection of Capabilities
            const toolNames = this.tools.map(t => t.name).join(' ');
            for (const cap of Object.values(CAPABILITIES)) {
                if (toolNames.includes(cap.keyword)) {
                    this.activeCapability = { context: cap.context, navigate: cap.navigate };
                    console.log(`[MCP] Detected capability set for ${this.name}: ${cap.keyword}`);
                    break;
                }
            }

            // Special case for Vibium if keyword detection is tricky
            if (!this.activeCapability && this.name.toLowerCase().includes('vibium')) {
                this.activeCapability = CAPABILITIES['vibium'];
            }

            console.log(`[MCP] ${this.name} initialized with ${this.tools.length} tools`);
        } catch (error) {
            console.error(`[MCP] Error during ${this.name} initialization:`, error);
            throw new Error(`[MCP] Adapter ${this.name} failed to start - Browser Crash suspected. Details: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getTools(): Tool[] {
        return this.tools;
    }

    async executeTool(name: string, args: any): Promise<AdapterResponse> {
        if (!this.client) throw new Error("MCP Client not initialized");

        try {
            // Flexible Parameter Mapping: Handle url vs uri for navigation
            const tool = this.tools.find(t => t.name === name);
            if (tool && args.url) {
                const schema = JSON.stringify(tool.parameters).toLowerCase();
                const isNavigation = name.includes('navigate') || name.includes('goto') || name.includes('open');

                if (isNavigation && schema.includes('"uri"') && !schema.includes('"url"')) {
                    console.log(`[MCP] Remapping 'url' to 'uri' for tool ${name}`);
                    args.uri = args.url;
                    delete args.url;
                }
            }

            const start = Date.now();
            const result = await this.client.callTool({
                name,
                arguments: args,
            });
            const duration = Date.now() - start;

            let message = "";
            if (Array.isArray(result.content)) {
                message = result.content
                    .map(c => {
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

        // 1. Capability-Based Context
        if (this.activeCapability) {
            const result = await this.executeTool(this.activeCapability.context, {});
            if (result.success && result.message) {
                return result.message;
            }
        }

        // 2. Fallback: JS Evaluate only if no high-level tool worked
        const evalTool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('evaluate') || lowName.includes('exec') || lowName.includes('script');
        });

        if (evalTool) {
            const script = `
                (() => {
                    if (!document.body) return "Empty Body";
                    const interactive = Array.from(document.querySelectorAll('button, input, a, [draggable="true"]'))
                        .filter(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
                        })
                        .map(el => \`\${el.tagName} id="\${el.id}" class="\${el.className}" text="\${el.textContent?.trim().slice(0,30)}"\`)
                        .join('\\n');
                    return document.body.innerText.slice(0, 2000) + '\\nINTERACTIVE ELEMENTS:\\n' + interactive;
                })()
            `;
            const evalArgs = JSON.stringify(evalTool.parameters).includes('expression')
                ? { expression: script }
                : { script: script };

            const result = await this.executeTool(evalTool.name, evalArgs);
            if (result.success && result.message) return result.message;
        }

        return "MCP: No context tool found. Available: " + this.tools.map(t => t.name).join(', ');
    }

    async close(): Promise<void> {
        if (this.transport) {
            await (this.transport as any).close();
        }
        this.client = null;
        this.transport = null;
    }
}
