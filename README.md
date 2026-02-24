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

## 🔧 Configuration

The framework now supports comprehensive configuration via `.env` file:

```bash
# Copy example configuration
cp .env.example .env

# Edit with your settings
# Key options:
# - LOG_LEVEL: DEBUG, INFO, WARN, ERROR
# - MAX_STEPS: Maximum steps per scenario (default: 20)
# - MAX_RETRIES: Retry attempts for adapter init (default: 3)
```

See `.env.example` for all available options.

---

## 🧪 Testing

```bash
npm test  # Run unit tests
```

---

## 🐛 Troubleshooting

### Windows: Chrome Sandbox Permission Errors

If you see `Sandbox cannot access executable` errors with Vibium or other Chrome-based adapters:

**Option 1: Run as Administrator** (Recommended)
```bash
# Run PowerShell/Terminal as Administrator, then:
npm run bench
```

**Option 2: Disable Chrome Sandbox** (Less secure, testing only)
Add to your `.env`:
```env
CHROME_FLAGS=--no-sandbox --disable-setuid-sandbox
```

### Adapter Initialization Failures

The framework automatically retries failed adapter initialization 3 times with 2s delays. If adapters still fail:
- Check that you have network access for `npx` to download MCP servers
- Verify your Node.js version is >= 18
- Try running a single adapter: `npm run bench vibium`

### Port Already in Use

If port 3001 is taken, change it in `.env`:
```env
TARGET_PORT=3002
TARGET_BASE_URL=http://localhost:3002
```

---

## 🔒 Code Hygiene & Security

- **Environment Isolation**: All API keys are loaded strictly via `.env` (excluded from Git).
- **Process Management**: `McpAdapter` ensures all MCP transport connections are properly closed after execution to prevent hanging processes.
- **Configuration Validation**: Zod schema validation ensures type-safe configuration.
- **Structured Logging**: Color-coded logs with configurable levels for debugging.
- **Parallel Execution**: Adapters run concurrently with isolated state.
- **Retry Logic**: Automatic retry with exponential backoff for transient failures.
