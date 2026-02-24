import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import { logger } from './logger';

// Proper CSV parsing that handles commas in quoted fields
function parseCSV(content: string): Record<string, string>[] {
    const lines = content.trim().split('\n');
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);
    const data: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) {
            logger.warn('Report', `Skipping malformed CSV line ${i + 1}`);
            continue;
        }

        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j];
        }
        data.push(row);
    }

    return data;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Field separator
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

async function generateReport() {
    const csvPath = path.join(process.cwd(), config.output.resultsFile);
    if (!fs.existsSync(csvPath)) {
        logger.error('Report', `${config.output.resultsFile} not found. Run the benchmark first.`);
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const data = parseCSV(content);

    let markdown = `# 📊 UI Automation Benchmark Report\n\n`;
    markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;

    markdown += `## 🚀 Summary Table\n\n`;
    markdown += `| Scenario | Adapter | Status | Steps | Total (ms) | Efficiency | Avg Context (chars) |\n`;
    markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    data.forEach(row => {
        const efficiency = parseFloat(row['Token Efficiency'] || '0').toFixed(6);
        const contextSize = Math.round(parseFloat(row['Avg Context Size (chars)'] || '0'));

        // Status display with emoji
        const status = row.Status?.toLowerCase() || (row.Success === 'true' ? 'success' : 'failed');
        let statusIcon = '';
        switch (status) {
            case 'success': statusIcon = '✅ SUCCESS'; break;
            case 'crashed': statusIcon = '💥 CRASHED'; break;
            case 'error': statusIcon = '⚠️ ERROR'; break;
            default: statusIcon = '❌ FAILED'; break;
        }

        markdown += `| ${row.Scenario} | ${row.Adapter} | ${statusIcon} | ${row.Steps} | ${row['Total Duration (ms)']} | **${efficiency}** | ${contextSize} |\n`;
    });

    markdown += `\n\n## 💡 Key Metrics Explained\n\n`;
    markdown += `- **Status Types**:\n`;
    markdown += `  - ✅ **SUCCESS**: Goal achieved successfully\n`;
    markdown += `  - ❌ **FAILED**: Goal not achieved, but execution completed normally\n`;
    markdown += `  - 💥 **CRASHED**: Browser/adapter crashed (connection lost, timeout, process died)\n`;
    markdown += `  - ⚠️ **ERROR**: Initialization or tool execution error (not a scenario failure)\n`;
    markdown += `- **Total Duration**: End-to-end time for the scenario.\n`;
    markdown += `- **LLM Duration**: Pure inference time (latency from the provider).\n`;
    markdown += `- **Tool Duration**: Time spent executing MCP commands (browser interaction).\n`;
    markdown += `- **Token Efficiency**: Calculated as \`Success (1/0) / (Total Tokens / 1000)\`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.\n\n`;

    markdown += `## 🛠️ Infrastructure\n\n`;
    markdown += `- **LLM**: Gemini Flash (Configurable via .env)\n`;
    markdown += `- **Protocol**: Model Context Protocol (MCP)\n`;
    markdown += `- **Scenarios**: 5 High-complexity UI tasks (Shadow DOM, D&D, etc.)\n`;

    fs.writeFileSync(config.output.reportFile, markdown);
    logger.info('Report', `Report generated: ${config.output.reportFile}`);
}

generateReport().catch(err => {
    logger.error('Report', 'Failed to generate report', { error: err.message });
    process.exit(1);
});
