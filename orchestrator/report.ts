import * as fs from 'fs';
import * as path from 'path';

async function generateReport() {
    const csvPath = path.join(process.cwd(), 'results.csv');
    if (!fs.existsSync(csvPath)) {
        console.error("results.csv not found. Run the benchmark first.");
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');
    const data = lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, i) => {
            obj[header] = values[i];
            return obj;
        }, {} as any);
    });

    let markdown = `# 📊 UI Automation Benchmark Report\n\n`;
    markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;

    markdown += `## 🚀 Summary Table\n\n`;
    markdown += `| Scenario | Adapter | Success | Steps | Total (ms) | LLM (ms) | Tool (ms) | Efficiency |\n`;
    markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    data.forEach(row => {
        const efficiency = parseFloat(row['Token Efficiency'] || '0').toFixed(6);
        markdown += `| ${row.Scenario} | ${row.Adapter} | ${row.Success === 'true' ? '✅' : '❌'} | ${row.Steps} | ${row['Total Duration (ms)']} | ${row['LLM Duration (ms)']} | ${row['Tool Duration (ms)']} | **${efficiency}** |\n`;
    });

    markdown += `\n\n## 💡 Key Metrics Explained\n\n`;
    markdown += `- **Total Duration**: End-to-end time for the scenario.\n`;
    markdown += `- **LLM Duration**: Pure inference time (latency from the provider).\n`;
    markdown += `- **Tool Duration**: Time spent executing MCP commands (browser interaction).\n`;
    markdown += `- **Token Efficiency**: Calculated as \`Success (1/0) / (Total Tokens / 1000)\`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.\n\n`;

    markdown += `## 🛠️ Infrastructure\n\n`;
    markdown += `- **LLM**: Gemini Flash (Configurable via .env)\n`;
    markdown += `- **Protocol**: Model Context Protocol (MCP)\n`;
    markdown += `- **Scenarios**: 5 High-complexity UI tasks (Shadow DOM, D&D, etc.)\n`;

    fs.writeFileSync('LAST_RUN_SUMMARY.md', markdown);
    console.log("Report generated: LAST_RUN_SUMMARY.md");
}

generateReport().catch(console.error);
