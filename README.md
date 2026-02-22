# 📊 MCP Browser Automation Benchmark

A high-performance benchmarking harness designed to evaluate AI-driven browser automation frameworks using the **Model Context Protocol (MCP)**. This tool compares different MCP servers (Playwright, Chrome DevTools, Vercel) across complex UI scenarios to measure reliability, latency, and token efficiency.

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file with your API keys:
   ```env
   GEMINI_API_KEY=your_key_here
   ```

3. **Start Target Application**:
   ```bash
   npm run target
   ```
   *The test app will be available at [http://localhost:3001](http://localhost:3001).*

4. **Run Full Benchmark Suite**:
   ```bash
   npm run test:all
   ```

---

## 🛠️ Methodology

This benchmark evaluates frameworks based on three key pillars:

1. **Reliability (Success Rate)**: 
   Tests the agent's ability to reach a specific "Verification State" (e.g., finding a unique string in the Shadow DOM) within a maximum of 5 steps. Success is verified by objective DOM markers.

2. **Economic Efficiency (Token Usage)**: 
   Measures the "Token Tax" of each framework's context representation.
   - **Metric**: `Token Efficiency = Success / (Total Tokens / 1000)`.
   - *Higher is better* (more successful tasks per 1k tokens).

3. **Latency Analysis**: 
   Decouples execution time into:
   - **LLM Duration**: Inference time ("Thinking").
   - **Tool Duration**: Browser interaction time ("Acting").

---

## 🔌 Supported Adapters

The framework dynamically discovers tools from official MCP servers:
- **MCP-Playwright**: Official Playwright MCP implementation (`@playwright/mcp`).
- **MCP-Chrome-DevTools**: Official Google Chrome DevTools MCP (`chrome-devtools-mcp`).
- **Vercel-Agent**: Vercel's Agent Browser MCP (`agent-browser-mcp`).
- **Vibium**: Vibium Browser MCP (`vibium`).

---

## 📈 Reporting

After running `npm run test:all`, the framework automatically generates:
- **`results.csv`**: Raw metrics for every scenario run.
- **`LAST_RUN_SUMMARY.md`**: A human-readable performance breakdown including success rates, durations, and token efficiency.

---

## 🧪 Test Scenarios

1. **Table Pagination**: Complex data retrieval across multiple pages.
2. **Wizard Form**: Multi-step stateful form completion.
3. **Shadow DOM**: Interaction with deep-nested, encapsulated elements.
4. **Drag and Drop**: HTML5 drag-and-drop validation.
5. **Self-Healing**: Resilience against changing IDs and CSS classes.

---

## 🔒 Code Hygiene & Security

- **Environment Isolation**: All API keys are loaded strictly via `.env` (excluded from Git).
- **Process Management**: `McpAdapter` ensures all MCP transport connections are properly closed after execution to prevent hanging processes.
- **Security Bypass**: Browser instances are launched with `--disable-web-security` for reliable benchmarking in isolated environments.
