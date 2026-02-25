# 📊 UI Automation Benchmark Report

Generated on: 2/26/2026, 12:06:46 AM

## 🚀 Summary Table

| Scenario | Adapter | Status | Steps | Total (ms) | Efficiency | Avg Context (chars) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Table Pagination | MCP-Playwright | ✅ SUCCESS | 3 | 9943 | **0.076202** | 1420 |
| Wizard Form | MCP-Playwright | ✅ SUCCESS | 12 | 40580 | **0.014472** | 460 |
| Shadow DOM | MCP-Playwright | ✅ SUCCESS | 2 | 6643 | **0.182983** | 505 |
| Drag and Drop | MCP-Playwright | ✅ SUCCESS | 8 | 21265 | **0.028603** | 446 |
| Self Healing | MCP-Playwright | ✅ SUCCESS | 1 | 3603 | **0.423191** | 471 |
| Async Loading | MCP-Playwright | ✅ SUCCESS | 2 | 6055 | **0.191498** | 440 |
| Modal Interaction | MCP-Playwright | ✅ SUCCESS | 3 | 10415 | **0.108401** | 506 |
| Dropdown Selection | MCP-Playwright | ✅ SUCCESS | 8 | 24258 | **0.025951** | 653 |


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

This benchmark evaluates browser automation capabilities across 8 challenging scenarios:

1. **Table Pagination**: Navigate through paginated data to find specific information (Plasma Shield price)
2. **Wizard Form**: Complete a multi-step form with validation and state management
3. **Shadow DOM**: Interact with elements inside Shadow DOM (requires deep DOM traversal - 3 levels)
4. **Drag and Drop**: Perform complex mouse interactions to move items between columns
5. **Self Healing**: Handle dynamic UI with changing attributes and IDs (rotates every 2s)
6. **Async Loading**: Wait for asynchronous operations (3-second simulated API call)
7. **Modal Interaction**: Open modal overlay, interact with z-indexed elements, and submit form
8. **Dropdown Selection**: Select from native HTML dropdowns and verify combination

## 🛠️ Infrastructure

- **Platform**: win32 (x64)
- **Node.js**: v24.12.0
- **OS**: Windows_NT 10.0.26200
- **LLM**: Gemini Flash (Configurable via .env)
- **Protocol**: Model Context Protocol (MCP)
- **Max Steps**: 20 per scenario
