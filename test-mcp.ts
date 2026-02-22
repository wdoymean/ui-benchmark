import { McpAdapter } from './orchestrator/adapters/mcp.adapter';

async function test() {
    const adapter = new McpAdapter("Test", "npx", ["-y", "@playwright/mcp"]);
    try {
        console.log("Initializing...");
        await adapter.init();
        console.log("Tools:", adapter.getTools().map(t => t.name));
        await adapter.close();
    } catch (e) {
        console.error("Failed:", e);
    }
}

test();
