import { McpAdapter } from './adapters/mcp.adapter';
import { LLMClient } from './llm-client';
import { Telemetry, TestStatus } from './telemetry';
import { BrowserAdapter } from './adapters/base';
import { config } from './config';
import { logger } from './logger';

const SCENARIOS = [
    { name: 'Table Pagination', url: `${config.target.baseUrl}/table.html`, goal: 'Find the price of "Plasma Shield" by navigating through pages and filtering if needed.' },
    { name: 'Wizard Form', url: `${config.target.baseUrl}/form.html`, goal: 'Complete the checkout wizard with name "Alice", email "alice@test.com", phone "+123456", and address "Wonderland".' },
    { name: 'Shadow DOM', url: `${config.target.baseUrl}/shadow.html`, goal: 'Enter "OPEN-SESAME" into the secret input and click reveal.' },
    { name: 'Drag and Drop', url: `${config.target.baseUrl}/dnd.html`, goal: 'Drag "Implement MCP Logic" from To Do to the Done column.' },
    { name: 'Self Healing', url: `${config.target.baseUrl}/dynamic.html`, goal: 'Click the "ACCESS SYSTEM" button despite its changing attributes.' },
    { name: 'Async Loading', url: `${config.target.baseUrl}/async.html`, goal: 'Click "Fetch Remote Data" button and wait for the result to appear showing "Token: ABC-XYZ-789".' },
    { name: 'Modal Interaction', url: `${config.target.baseUrl}/modal.html`, goal: 'Open the modal, enter code "ALPHA-9000" and submit to see the success message.' },
    { name: 'Dropdown Selection', url: `${config.target.baseUrl}/dropdown.html`, goal: 'Select "EU Central" region and "m5.large" instance, then click Deploy.' },
];

function verifyGoal(scenarioName: string, context: string): boolean {
    if (!context || context.length < 20) return false;
    if (context.startsWith('MCP:') || context.includes('Client not initialized')) return false;

    // Safety check: if context looks like raw HTML, it's likely a false positive from source tools
    if (context.includes('<!DOCTYPE') || (context.includes('<html') && context.includes('<body'))) return false;

    const lowerContext = context.toLowerCase();
    switch (scenarioName) {
        case 'Shadow DOM': return context.includes('The cake is a lie');
        case 'Wizard Form': return context.includes('#CONF-') && !context.includes('id="step3"'); // Should be visible
        case 'Drag and Drop': return context.includes('Completed!');
        case 'Self Healing': return context.includes('ACCESS GRANTED');
        case 'Table Pagination':
            // Stricter check for table pagination to avoid matching source code
            const hasPrice = context.includes('$900');
            const hasName = lowerContext.includes('plasma shield');
            return hasPrice && hasName && !context.includes('const data = [');
        case 'Async Loading':
            return context.includes('Token: ABC-XYZ-789') || context.includes('ABC-XYZ-789');
        case 'Modal Interaction':
            return lowerContext.includes('verification complete') && context.includes('ALPHA-9000');
        case 'Dropdown Selection':
            return lowerContext.includes('deployment successful') &&
                   (lowerContext.includes('eu-central') || lowerContext.includes('m5.large'));
        default: return false;
    }
}

async function runAdapterScenarios(
    adapter: BrowserAdapter,
    scenarios: typeof SCENARIOS,
    llm: LLMClient,
    telemetry: Telemetry
): Promise<void> {
    logger.info('Benchmark', `Starting Adapter: ${adapter.name}`);
    try {
        await adapter.init();

        // Add a Warm-up specifically for Vibium
        if (adapter.name === 'Vibium') {
            logger.debug('Benchmark', `Waiting ${config.benchmark.vibiumWarmupDelayMs}ms for ${adapter.name} stabilization...`);
            await new Promise(r => setTimeout(r, config.benchmark.vibiumWarmupDelayMs));
        }

        // Optimization: Filter tools once per adapter
        const navigationTools = ['browser_navigate', 'navigate', 'navigate_page', 'navigate_url', 'browser_navigate_back', 'browser_tabs', 'browser_close', 'close_page', 'browser_install', 'browser_launch', 'browser_quit'];
        const excludedTools = [
            ...navigationTools,
            // Chrome DevTools tools that shouldn't be used by the LLM during scenarios
            'performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight',
            'take_memory_snapshot', 'list_network_requests', 'get_network_request',
            'list_console_messages', 'get_console_message', 'emulate', 'resize_page',
            'list_pages', 'select_page', 'new_page', 'upload_file'
        ];
        const scenarioTools = adapter.getTools().filter(t => !excludedTools.includes(t.name));

        for (const scenario of scenarios) {
                logger.info('Scenario', `Testing: ${scenario.name} with ${adapter.name}`);

                const startTime = Date.now();
                let steps = 0;
                let totalPromptTokens = 0;
                let totalCompletionTokens = 0;
                let llmDurationMs = 0;
                let toolDurationMs = 0;
                let success = false;
                let lastError = '';
                let totalContextChars = 0;
                let contextCount = 0;

                try {
                    // Check if browser needs to be launched first (e.g., Vibium)
                    const launchTool = adapter.getTools().find(t => t.name === 'browser_launch');
                    if (launchTool) {
                        logger.debug('Scenario', 'Launching browser...');
                        await adapter.executeTool(launchTool.name, {});
                    }

                    // Initial Navigation
                    const navTool = adapter.getTools().find(t =>
                        t.name === 'browser_navigate' ||
                        t.name === 'navigate' ||
                        t.name === 'navigate_page' ||
                        t.name === 'navigate_url' ||
                        t.name === 'agent_browser_navigate'
                    );
                    if (navTool) {
                        logger.debug('Scenario', `Navigating to ${scenario.url} using ${navTool.name}`);
                        await adapter.executeTool(navTool.name, { url: scenario.url });
                    } else {
                        logger.warn('Scenario', `No navigation tool found! Available: ${adapter.getTools().map(t => t.name).join(', ')}`);
                    }

                    const messages: any[] = [
                        { role: 'system', content: `Goal: ${scenario.goal}. Respond with "SUCCESS" when achieved.` },
                    ];

                    while (steps < config.benchmark.maxSteps && !success) {
                        // 1. Get Context & Merge Verification
                        const contextStart = Date.now();

                        // Settle delay for Chrome DevTools to allow UI to update
                        if (adapter.name.includes('Chrome-DevTools')) {
                            await new Promise(r => setTimeout(r, config.benchmark.chromeDevToolsSettleDelayMs));
                        }

                        const contextData = await adapter.getPageContext();
                        const contextText = typeof contextData === 'string' ? contextData : contextData.text;
                        totalContextChars += contextText.length;
                        contextCount++;
                        toolDurationMs += (Date.now() - contextStart);

                        // Early exit if goal achieved by previous step
                        if (verifyGoal(scenario.name, contextText)) {
                            success = true;
                            break;
                        }

                        steps++;

                        // Build message content - multimodal if screenshot available
                        let messageContent: any;
                        if (typeof contextData !== 'string' && contextData.screenshot) {
                            messageContent = [
                                {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: contextData.screenshot.mimeType,
                                        data: contextData.screenshot.data
                                    }
                                },
                                {
                                    type: 'text',
                                    text: `Page State:\n${contextText}\n\nBefore taking action, carefully analyze the screenshot. If you're about to repeat a failed action, stop and try a different selector or approach.\n\nAction?`
                                }
                            ];
                        } else {
                            messageContent = `Page State:\n${contextText}\n\nBefore taking action, analyze the current state. If you're about to repeat a failed action, stop and try a different selector.\n\nAction?`;
                        }

                        messages.push({ role: 'user', content: messageContent });

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

                                logger.debug('Scenario', `Step ${steps}: ${toolName}`);
                                const toolStart = Date.now();
                                const result = await adapter.executeTool(toolName, toolArgs);
                                if (result.message) {
                                    totalContextChars += result.message.length;
                                    contextCount++;
                                }
                                toolDurationMs += (Date.now() - toolStart);

                                messages.push({ role: 'assistant', content: response.content || '...', tool_calls: response.toolCalls });
                                messages.push({ role: 'user', content: result.success ? `RESULT: ${result.message}` : `ERROR: ${result.message}` });
                            }
                        } else if (response.content.toUpperCase().includes('SUCCESS')) {
                            // Final Verification (User requested fresh check)
                            const finalCheckStart = Date.now();
                            const finalContextData = await adapter.getPageContext();
                            const finalContextText = typeof finalContextData === 'string' ? finalContextData : finalContextData.text;
                            totalContextChars += finalContextText.length;
                            contextCount++;
                            toolDurationMs += (Date.now() - finalCheckStart);

                            if (verifyGoal(scenario.name, finalContextText)) {
                                success = true;
                            } else {
                                messages.push({ role: 'user', content: `Verification failed. The goal does not appear to be met based on the current page state.` });
                            }
                        } else {
                            logger.debug('Scenario', `Step ${steps}: ${response.content}`);
                        }
                    }
                } catch (err: any) {
                    lastError = err.message;
                    logger.error('Scenario', 'Scenario execution failed', { error: err.message, stack: err.stack });
                } finally {
                    const totalDurationMs = Date.now() - startTime;
                    const totalTokens = totalPromptTokens + totalCompletionTokens;

                    // Determine test status
                    let status: TestStatus;
                    if (success) {
                        status = 'success';
                    } else if (lastError) {
                        // Check for crash indicators
                        if (lastError.includes('Connection closed') ||
                            lastError.includes('ECONNRESET') ||
                            lastError.includes('timed out') ||
                            lastError.includes('Transport closed') ||
                            lastError.includes('Process exited')) {
                            status = 'crashed';
                        } else if (lastError.includes('Tool execution failed') ||
                                   lastError.includes('not initialized') ||
                                   lastError.includes('No tools discovered')) {
                            status = 'error';
                        } else {
                            status = 'failed';
                        }
                    } else {
                        // Failed to achieve goal but no explicit error
                        status = 'failed';
                    }

                    telemetry.log({
                        scenario: scenario.name,
                        adapter: adapter.name,
                        success,
                        status,
                        steps,
                        durationMs: totalDurationMs,
                        llmDurationMs,
                        toolDurationMs,
                        promptTokens: totalPromptTokens,
                        completionTokens: totalCompletionTokens,
                        tokenEfficiency: totalTokens > 0 ? (success ? 1 : 0) / (totalTokens / 1000) : 0,
                        avgContextSize: contextCount > 0 ? totalContextChars / contextCount : 0,
                        error: lastError
                    });
                }
            }
    } catch (err: any) {
        logger.error('Benchmark', `Failed to initialize adapter ${adapter.name}`, { error: err.message });
    } finally {
        await adapter.close();
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
        new McpAdapter("Vibium", "npx", ["-y", "vibium", "mcp"]),
        new McpAdapter("MCP-Selenium", "npx", ["-y", "@angiejones/mcp-selenium"])
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

    // Run adapters sequentially or in parallel based on config
    const executionMode = config.benchmark.parallelExecution ? 'parallel' : 'sequential';
    logger.info('Benchmark', `Starting ${executionMode} benchmark with ${adapters.length} adapter(s) and ${filteredScenarios.length} scenario(s)`);

    if (config.benchmark.parallelExecution) {
        await Promise.all(
            adapters.map(adapter => runAdapterScenarios(adapter, filteredScenarios, llm, telemetry))
        );
    } else {
        // Sequential execution - more stable, avoids race conditions
        for (const adapter of adapters) {
            await runAdapterScenarios(adapter, filteredScenarios, llm, telemetry);
        }
    }

    await telemetry.exportCsv(config.output.resultsFile);
    logger.info('Benchmark', `Benchmark complete! Results saved to ${config.output.resultsFile}`);
}

runBenchmark().catch(console.error);
