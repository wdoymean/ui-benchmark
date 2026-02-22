import { McpAdapter } from './adapters/mcp.adapter';
import { LLMClient } from './llm-client';
import { Telemetry, Metrics } from './telemetry';
import { BrowserAdapter } from './adapters/base';

const SCENARIOS = [
    { name: 'Table Pagination', url: 'http://localhost:3001/table.html', goal: 'Find the price of "Plasma Shield" by navigating through pages and filtering if needed.' },
    { name: 'Wizard Form', url: 'http://localhost:3001/form.html', goal: 'Complete the checkout wizard with name "Alice", email "alice@test.com", phone "+123456", and address "Wonderland".' },
    { name: 'Shadow DOM', url: 'http://localhost:3001/shadow.html', goal: 'Enter "OPEN-SESAME" into the secret input and click reveal.' },
    { name: 'Drag and Drop', url: 'http://localhost:3001/dnd.html', goal: 'Drag "Implement MCP Logic" from To Do to the Done column.' },
    { name: 'Self Healing', url: 'http://localhost:3001/dynamic.html', goal: 'Click the "ACCESS SYSTEM" button despite its changing attributes.' },
];

function verifyGoal(scenarioName: string, context: string): boolean {
    if (!context) return false;
    const lowerContext = context.toLowerCase();
    switch (scenarioName) {
        case 'Shadow DOM': return context.includes('The cake is a lie');
        case 'Wizard Form': return context.includes('#CONF-');
        case 'Drag and Drop': return context.includes('Completed!');
        case 'Self Healing': return context.includes('ACCESS GRANTED');
        case 'Table Pagination': return context.includes('$900') || lowerContext.includes('plasma shield');
        default: return false;
    }
}

async function runBenchmark() {
    const llm = new LLMClient();
    const telemetry = new Telemetry();
    const adapterFilter = process.argv[2]?.toLowerCase();
    const scenarioFilter = process.argv[3]?.toLowerCase();

    const allAdapters: BrowserAdapter[] = [
        new McpAdapter("MCP-Playwright", "npx", ["-y", "@playwright/mcp"]),
        new McpAdapter("MCP-Chrome-DevTools", "npx", ["-y", "chrome-devtools-mcp"]),
        new McpAdapter("Vercel-Agent", "npx", ["-y", "agent-browser"]),
        new McpAdapter("Vibium", "npx", ["-y", "vibium", "mcp"])
    ];

    const adapters = adapterFilter
        ? allAdapters.filter(a => a.name.toLowerCase().includes(adapterFilter))
        : allAdapters;

    if (adapters.length === 0) {
        console.error(`No adapters found matching: ${adapterFilter}`);
        process.exit(1);
    }

    const filteredScenarios = scenarioFilter
        ? SCENARIOS.filter(s => s.name.toLowerCase().includes(scenarioFilter))
        : SCENARIOS;

    for (const adapter of adapters) {
        console.log(`\n=== Starting Adapter: ${adapter.name} ===`);
        try {
            await adapter.init();

            // Optimization: Filter tools once per adapter
            const navigationTools = ['browser_navigate', 'navigate', 'navigate_page', 'navigate_url', 'browser_navigate_back', 'browser_tabs', 'browser_close', 'close_page', 'browser_install'];
            const scenarioTools = adapter.getTools().filter(t => !navigationTools.includes(t.name));

            for (const scenario of filteredScenarios) {
                console.log(`\n>>> Testing scenario: ${scenario.name}`);

                const startTime = Date.now();
                let steps = 0;
                let totalPromptTokens = 0;
                let totalCompletionTokens = 0;
                let llmDurationMs = 0;
                let toolDurationMs = 0;
                let success = false;
                let lastError = '';

                try {
                    // Initial Navigation
                    const navTool = adapter.getTools().find(t => t.name === 'browser_navigate' || t.name === 'navigate' || t.name === 'navigate_page' || t.name === 'navigate_url');
                    if (navTool) {
                        await adapter.executeTool(navTool.name, { url: scenario.url });
                    }

                    const messages: any[] = [
                        { role: 'system', content: `Goal: ${scenario.goal}. Respond with "SUCCESS" when achieved.` },
                    ];

                    while (steps < 20 && !success) {
                        // 1. Get Context & Merge Verification
                        const contextStart = Date.now();
                        const context = await adapter.getPageContext();
                        toolDurationMs += (Date.now() - contextStart);

                        // Early exit if goal achieved by previous step
                        if (verifyGoal(scenario.name, context)) {
                            success = true;
                            break;
                        }

                        steps++;
                        messages.push({ role: 'user', content: `Page State:\n${context}\n\nAction?` });

                        // 2. LLM Inference
                        const llmStart = Date.now();
                        const response = await llm.chat(messages, scenarioTools);
                        llmDurationMs += (Date.now() - llmStart);

                        totalPromptTokens += response.usage.promptTokens;
                        totalCompletionTokens += response.usage.completionTokens;

                        if (response.toolCalls && response.toolCalls.length > 0) {
                            for (const toolCall of response.toolCalls) {
                                const toolName = toolCall.name;
                                const toolArgs = toolCall.args;

                                console.log(`Step ${steps}: ${toolName}`);
                                const toolStart = Date.now();
                                const result = await adapter.executeTool(toolName, toolArgs);
                                toolDurationMs += (Date.now() - toolStart);

                                messages.push({ role: 'assistant', content: response.content || '...', tool_calls: response.toolCalls });
                                messages.push({ role: 'user', content: result.success ? `RESULT: ${result.message}` : `ERROR: ${result.message}` });
                            }
                        } else if (response.content.toUpperCase().includes('SUCCESS')) {
                            // Final Verification (User requested fresh check)
                            const finalCheckStart = Date.now();
                            const finalContext = await adapter.getPageContext();
                            toolDurationMs += (Date.now() - finalCheckStart);

                            if (verifyGoal(scenario.name, finalContext)) {
                                success = true;
                            } else {
                                messages.push({ role: 'user', content: `Verification failed. The goal does not appear to be met based on the current page state.` });
                            }
                        } else {
                            console.log(`Step ${steps}: ${response.content}`);
                        }
                    }
                } catch (err: any) {
                    lastError = err.message;
                    console.error(`Error:`, err);
                } finally {
                    const totalDurationMs = Date.now() - startTime;
                    const totalTokens = totalPromptTokens + totalCompletionTokens;

                    telemetry.log({
                        scenario: scenario.name,
                        adapter: adapter.name,
                        success,
                        steps,
                        durationMs: totalDurationMs,
                        llmDurationMs,
                        toolDurationMs,
                        promptTokens: totalPromptTokens,
                        completionTokens: totalCompletionTokens,
                        tokenEfficiency: totalTokens > 0 ? (success ? 1 : 0) / (totalTokens / 1000) : 0,
                        error: lastError
                    });
                }
            }
        } catch (err: any) {
            console.error(`Failed to initialize adapter ${adapter.name}:`, err);
        } finally {
            await adapter.close();
        }
    }

    await telemetry.exportCsv('results.csv');
}

runBenchmark().catch(console.error);
