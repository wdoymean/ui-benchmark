# 📊 UI Automation Benchmark Report

Generated on: 2/23/2026, 11:12:12 PM

## 🚀 Summary Table

| Scenario | Adapter | Success | Steps | Total (ms) | Efficiency | Avg Context (chars) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Table Pagination | Vibium | ❌ | 20 | 34207 | **0.000000** | 278 |
| Wizard Form | Vibium | ❌ | 20 | 280614 | **0.000000** | 147 |
| Shadow DOM | Vibium | ✅ | 11 | 19493 | **0.037720** | 174 |
| Drag and Drop | Vibium | ❌ | 20 | 105930 | **0.000000** | 136 |
| Self Healing | Vibium | ✅ | 1 | 6356 | **0.687758** | 129 |


## 💡 Key Metrics Explained

- **Total Duration**: End-to-end time for the scenario.
- **LLM Duration**: Pure inference time (latency from the provider).
- **Tool Duration**: Time spent executing MCP commands (browser interaction).
- **Token Efficiency**: Calculated as `Success (1/0) / (Total Tokens / 1000)`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.

## 🛠️ Infrastructure

- **LLM**: Gemini Flash (Configurable via .env)
- **Protocol**: Model Context Protocol (MCP)
- **Scenarios**: 5 High-complexity UI tasks (Shadow DOM, D&D, etc.)
