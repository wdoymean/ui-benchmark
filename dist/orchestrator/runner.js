"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_adapter_1 = require("./adapters/playwright.adapter");
const puppeteer_adapter_1 = require("./adapters/puppeteer.adapter");
const vibium_adapter_1 = require("./adapters/vibium.adapter");
const vercel_adapter_1 = require("./adapters/vercel.adapter");
const llm_client_1 = require("./llm-client");
const telemetry_1 = require("./telemetry");
const SCENARIOS = [
    { name: 'Table Pagination', url: 'http://localhost:3000/table.html', goal: 'Find the price of "Plasma Shield" by navigating through pages and filtering if needed.' },
    { name: 'Wizard Form', url: 'http://localhost:3000/form.html', goal: 'Complete the checkout wizard with name "Alice", email "alice@test.com", phone "+123456", and address "Wonderland".' },
    { name: 'Shadow DOM', url: 'http://localhost:3000/shadow.html', goal: 'Enter "OPEN-SESAME" into the secret input and click reveal.' },
    { name: 'Drag and Drop', url: 'http://localhost:3000/dnd.html', goal: 'Drag "Implement MCP Logic" from To Do to the Done column.' },
    { name: 'Self Healing', url: 'http://localhost:3000/dynamic.html', goal: 'Click the "ACCESS SYSTEM" button despite its changing attributes.' },
];
async function runBenchmark() {
    const llm = new llm_client_1.LLMClient();
    const telemetry = new telemetry_1.Telemetry();
    const adapters = [
        new playwright_adapter_1.PlaywrightAdapter(),
        new puppeteer_adapter_1.PuppeteerCdpAdapter(),
        new vibium_adapter_1.VibiumAdapter(),
        new vercel_adapter_1.VercelAgentAdapter()
    ];
    for (const adapter of adapters) {
        for (const scenario of SCENARIOS) {
            console.log(`\n>>> Testing scenario: ${scenario.name} with adapter: ${adapter.name}`);
            const startTime = Date.now();
            let steps = 0;
            let totalPromptTokens = 0;
            let totalCompletionTokens = 0;
            let success = false;
            let lastError = '';
            try {
                await adapter.init();
                await adapter.executeTool('navigate', { url: scenario.url });
                const messages = [
                    { role: 'system', content: 'You are an expert web automation agent. Your goal is: ' + scenario.goal },
                ];
                while (steps < 10 && !success) {
                    steps++;
                    const context = await adapter.getPageContext();
                    messages.push({ role: 'user', content: `Current Page State:\n${context}` });
                    const response = await llm.chat(messages, adapter.getTools());
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                    if (response.toolCalls && response.toolCalls.length > 0) {
                        for (const toolCall of response.toolCalls) {
                            const toolName = toolCall.name || toolCall.tool_use?.name || (toolCall.function?.name);
                            const toolArgs = toolCall.args || toolCall.tool_use?.input || JSON.parse(toolCall.function?.arguments || '{}');
                            console.log(`Step ${steps}: Executing ${toolName}`, toolArgs);
                            const result = await adapter.executeTool(toolName, toolArgs);
                            messages.push({ role: 'assistant', content: response.content || 'Executing tool...', tool_calls: response.toolCalls });
                            messages.push({ role: 'user', content: `Tool Result: ${result.message}` });
                            if (result.message.toLowerCase().includes('success') || result.message.toLowerCase().includes('cracked') || result.message.toLowerCase().includes('completed')) {
                                // Heuristic check or LLM confirms
                            }
                        }
                    }
                    else {
                        console.log(`Step ${steps}: LLM Response: ${response.content}`);
                        if (response.content.toLowerCase().includes('goal achieved') || response.content.toLowerCase().includes('success')) {
                            success = true;
                        }
                    }
                    // Heuristic for success based on scenario specific markers
                    const bodyText = await adapter.getPageContext();
                    if ((scenario.name === 'Shadow DOM' && bodyText.includes('The cake is a lie')) ||
                        (scenario.name === 'Wizard Form' && bodyText.includes('#CONF-')) ||
                        (scenario.name === 'Drag and Drop' && bodyText.includes('Completed!')) ||
                        (scenario.name === 'Self Healing' && bodyText.includes('ACCESS GRANTED')) ||
                        (scenario.name === 'Table Pagination' && bodyText.includes('$900'))) {
                        success = true;
                    }
                }
            }
            catch (err) {
                lastError = err.message;
                console.error(`Error in ${scenario.name}:`, err);
            }
            finally {
                await adapter.close();
                const durationMs = Date.now() - startTime;
                telemetry.log({
                    scenario: scenario.name,
                    adapter: adapter.name,
                    success,
                    steps,
                    durationMs,
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    error: lastError
                });
            }
        }
    }
    await telemetry.exportCsv('results.csv');
}
runBenchmark().catch(console.error);
