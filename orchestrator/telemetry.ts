import { createObjectCsvWriter } from 'csv-writer';

export interface Metrics {
    scenario: string;
    adapter: string;
    success: boolean;
    steps: number;
    durationMs: number;
    llmDurationMs: number;
    toolDurationMs: number;
    promptTokens: number;
    completionTokens: number;
    tokenEfficiency: number;
    avgContextSize: number;
    error?: string;
}

export class Telemetry {
    private results: Metrics[] = [];

    log(metric: Metrics) {
        this.results.push(metric);
        console.log(`[Metrics] ${metric.adapter} | ${metric.scenario} | ${metric.success ? 'PASS' : 'FAIL'} | ${metric.steps} steps | ${metric.durationMs}ms`);
    }

    async exportCsv(filePath: string) {
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'scenario', title: 'Scenario' },
                { id: 'adapter', title: 'Adapter' },
                { id: 'success', title: 'Success' },
                { id: 'steps', title: 'Steps' },
                { id: 'durationMs', title: 'Total Duration (ms)' },
                { id: 'llmDurationMs', title: 'LLM Duration (ms)' },
                { id: 'toolDurationMs', title: 'Tool Duration (ms)' },
                { id: 'promptTokens', title: 'Prompt Tokens' },
                { id: 'completionTokens', title: 'Completion Tokens' },
                { id: 'tokenEfficiency', title: 'Token Efficiency' },
                { id: 'avgContextSize', title: 'Avg Context Size (chars)' },
                { id: 'error', title: 'Error' },
            ]
        });

        await csvWriter.writeRecords(this.results);
        console.log(`Results exported to ${filePath}`);
    }
}
