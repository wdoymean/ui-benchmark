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

        // Internal helper to find a context-providing tool
        const stateTools = ['browser_snapshot', 'snapshot', 'get_dom', 'getPageSource', 'get_html'];
        const tool = this.tools.find(t => stateTools.includes(t.name) || (t.name.includes('snapshot') && !t.name.includes('take')));

        if (tool) {
            const result = await this.executeTool(tool.name, {});
            return result.message;
        }

        // Fallback to evaluate tools
        const evalTool = this.tools.find(t =>
            t.name === 'browser_evaluate' ||
            t.name === 'evaluate_script' ||
            t.name === 'playwright_evaluate' ||
            t.name === 'evaluate'
        );

        if (evalTool) {
            const script = `
                (() => {
                    const interactive = Array.from(document.querySelectorAll('button, input, a, [draggable="true"]'))
                        .map(el => \`\${el.tagName} id="\${el.id}" class="\${el.className}" text="\${el.textContent?.trim().slice(0, 30)}"\`)
                        .join('\\n');
                    return document.body.innerText.slice(0, 1000) + '\\nINTERACTIVE ELEMENTS:\\n' + interactive;
                })()
            `;
            const result = await this.executeTool(evalTool.name, { script });
            return result.message;
        }

        return "MCP: No context tool found. Available: " + this.tools.map(t => t.name).join(', ');
    }

    async close(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
        }
        this.client = null;
        this.transport = null;
    }
}
