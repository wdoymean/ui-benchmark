"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telemetry = void 0;
const csv_writer_1 = require("csv-writer");
class Telemetry {
    results = [];
    log(metric) {
        this.results.push(metric);
        console.log(`[Metrics] ${metric.adapter} | ${metric.scenario} | ${metric.success ? 'PASS' : 'FAIL'} | ${metric.steps} steps | ${metric.durationMs}ms`);
    }
    async exportCsv(filePath) {
        const csvWriter = (0, csv_writer_1.createObjectCsvWriter)({
            path: filePath,
            header: [
                { id: 'scenario', title: 'Scenario' },
                { id: 'adapter', title: 'Adapter' },
                { id: 'success', title: 'Success' },
                { id: 'steps', title: 'Steps' },
                { id: 'durationMs', title: 'Duration (ms)' },
                { id: 'promptTokens', title: 'Prompt Tokens' },
                { id: 'completionTokens', title: 'Completion Tokens' },
                { id: 'error', title: 'Error' },
            ]
        });
        await csvWriter.writeRecords(this.results);
        console.log(`Results exported to ${filePath}`);
    }
}
exports.Telemetry = Telemetry;
