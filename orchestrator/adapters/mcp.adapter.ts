import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BrowserAdapter, Tool, AdapterResponse } from './base';

export class McpAdapter implements BrowserAdapter {
    public name: string;
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private serverCommand: string;
    private serverArgs: string[];
    private tools: Tool[] = [];

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
            env: process.env as Record<string, string>, // Inherit full environment
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

        await this.client.connect(this.transport);

        // Discover tools
        const response = await this.client.listTools();
        this.tools = response.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            parameters: t.inputSchema as any
        }));

        console.log(`[MCP] ${this.name} initialized with ${this.tools.length} tools`);
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
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
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

        // 1. Heuristic Context Tool Discovery
        const contextKeywords = ['snapshot', 'dom', 'source', 'view', 'html'];
        const tool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return contextKeywords.some(k => lowName.includes(k)) &&
                !lowName.includes('take') && // Avoid "take_screenshot"
                !lowName.includes('capture');
        });

        if (tool) {
            const result = await this.executeTool(tool.name, {});
            if (result.success && result.message) return result.message;
        }

        // 2. Resource Fallback (New MCP Feature)
        try {
            const resources = await this.client.listResources();
            const pageResource = resources.resources.find(r =>
                r.name.toLowerCase().includes('page') ||
                r.name.toLowerCase().includes('dom') ||
                r.uri.includes('current')
            );

            if (pageResource) {
                const content = await this.client.readResource({ uri: pageResource.uri });
                const firstContent = content.contents?.[0];
                if (firstContent && 'text' in firstContent && typeof firstContent.text === 'string') {
                    return firstContent.text;
                }
            }
        } catch (e) {
            // Server might not support resources, ignore
        }

        // 3. Fallback to common evaluate pattern
        const evalTool = this.tools.find(t => {
            const lowName = t.name.toLowerCase();
            return lowName.includes('evaluate') || lowName.includes('exec') || lowName.includes('script');
        });

        if (evalTool) {
            const script = `
                (() => {
                    const interactive = Array.from(document.querySelectorAll('button, input, a, [draggable="true"]'))
                        .map(el => \`\${el.tagName} id="\${el.id}" class="\${el.className}" text="\${el.textContent?.trim().slice(0, 30)}"\`)
                        .join('\\n');
                    return document.body.innerText.slice(0, 1000) + '\\nINTERACTIVE ELEMENTS:\\n' + interactive;
                })()
            `;
            // Some evaluate tools use 'expression' instead of 'script'
            const evalArgs = JSON.stringify(evalTool.parameters).includes('expression')
                ? { expression: script }
                : { script: script };

            const result = await this.executeTool(evalTool.name, evalArgs);
            if (result.success) return result.message;
        }

        return "MCP: No context tool or resource found. Available: " + this.tools.map(t => t.name).join(', ');
    }

    async close(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
        }
        this.client = null;
        this.transport = null;
    }
}
