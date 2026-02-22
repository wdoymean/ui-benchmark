# 📊 UI Automation Benchmark Report

Generated on: 2/22/2026, 10:45:59 PM

## 🚀 Summary Table

| Scenario | Adapter | Success | Steps | Total (ms) | LLM (ms) | Tool (ms) | Efficiency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Table Pagination | MCP-Playwright | ✅ | 7 | 12473 | 6763 | 5262 | **0.028791** |
| Wizard Form | MCP-Playwright | ✅ | 5 | 6972 | 4758 | 2165 | **0.073692** |
| Shadow DOM | MCP-Playwright | ✅ | 2 | 3850 | 1722 | 2079 | **0.220459** |
| Drag and Drop | MCP-Playwright | ❌ | 20 | 58338 | 54022 | 4276 | **0.000000** |
| Self Healing | MCP-Playwright | ✅ | 1 | 1885 | 797 | 1043 | **0.485909** |


## 💡 Key Metrics Explained

- **Total Duration**: End-to-end time for the scenario.
- **LLM Duration**: Pure inference time (latency from the provider).
- **Tool Duration**: Time spent executing MCP commands (browser interaction).
- **Token Efficiency**: Calculated as `Success (1/0) / (Total Tokens / 1000)`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.

## 🛠️ Infrastructure

- **LLM**: Gemini Flash (Configurable via .env)
- **Protocol**: Model Context Protocol (MCP)
- **Scenarios**: 5 High-complexity UI tasks (Shadow DOM, D&D, etc.)
