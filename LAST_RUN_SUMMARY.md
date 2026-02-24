# 📊 UI Automation Benchmark Report

Generated on: 2/24/2026, 11:27:43 PM

## 🚀 Summary Table

| Scenario | Adapter | Success | Steps | Total (ms) | Efficiency | Avg Context (chars) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Table Pagination | MCP-Selenium | ❌ | 20 | 33631 | **0.000000** | 83 |
| Wizard Form | MCP-Selenium | ❌ | 20 | 41743 | **0.000000** | 287 |
| Shadow DOM | MCP-Selenium | ❌ | 20 | 25924 | **0.000000** | 37 |
| Drag and Drop | MCP-Selenium | ❌ | 20 | 32703 | **0.000000** | 134 |
| Self Healing | MCP-Selenium | ❌ | 20 | 34096 | **0.000000** | 46 |


## 💡 Key Metrics Explained

- **Total Duration**: End-to-end time for the scenario.
- **LLM Duration**: Pure inference time (latency from the provider).
- **Tool Duration**: Time spent executing MCP commands (browser interaction).
- **Token Efficiency**: Calculated as `Success (1/0) / (Total Tokens / 1000)`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.

## 🛠️ Infrastructure

- **LLM**: Gemini Flash (Configurable via .env)
- **Protocol**: Model Context Protocol (MCP)
- **Scenarios**: 5 High-complexity UI tasks (Shadow DOM, D&D, etc.)
