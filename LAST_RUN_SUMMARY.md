# 📊 UI Automation Benchmark Report

Generated on: 2/25/2026, 12:12:25 AM

## 🚀 Summary Table

| Scenario | Adapter | Status | Steps | Total (ms) | Efficiency | Avg Context (chars) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Table Pagination | MCP-Playwright | ❌ FAILED | 20 | 51061 | **0.000000** | 672 |
| Wizard Form | MCP-Playwright | ❌ FAILED | 20 | 39724 | **0.000000** | 441 |
| Shadow DOM | MCP-Playwright | ❌ FAILED | 20 | 32262 | **0.000000** | 447 |
| Drag and Drop | MCP-Playwright | ❌ FAILED | 20 | 41820 | **0.000000** | 451 |
| Self Healing | MCP-Playwright | ❌ FAILED | 20 | 41774 | **0.000000** | 520 |


## 💡 Key Metrics Explained

- **Status Types**:
  - ✅ **SUCCESS**: Goal achieved successfully
  - ❌ **FAILED**: Goal not achieved, but execution completed normally
  - 💥 **CRASHED**: Browser/adapter crashed (connection lost, timeout, process died)
  - ⚠️ **ERROR**: Initialization or tool execution error (not a scenario failure)
- **Total Duration**: End-to-end time for the scenario.
- **LLM Duration**: Pure inference time (latency from the provider).
- **Tool Duration**: Time spent executing MCP commands (browser interaction).
- **Token Efficiency**: Calculated as `Success (1/0) / (Total Tokens / 1000)`. Higher is better. It represents how many successful scenarios you get per 1,000 tokens spent.

## 🎯 Test Scenarios

This benchmark evaluates browser automation capabilities across 5 challenging scenarios:

1. **Table Pagination**: Navigate through paginated data to find specific information (Plasma Shield price)
2. **Wizard Form**: Complete a multi-step form with validation and state management
3. **Shadow DOM**: Interact with elements inside Shadow DOM (requires deep DOM traversal)
4. **Drag and Drop**: Perform complex mouse interactions to move items between columns
5. **Self Healing**: Handle dynamic UI with changing attributes and IDs

## 🛠️ Infrastructure

- **Platform**: win32 (x64)
- **Node.js**: v24.12.0
- **OS**: Windows_NT 10.0.26200
- **LLM**: Gemini Flash (Configurable via .env)
- **Protocol**: Model Context Protocol (MCP)
- **Max Steps**: 20 per scenario
