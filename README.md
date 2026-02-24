# 📊 MCP Browser Automation Benchmark

A high-performance benchmarking harness designed to evaluate AI-driven browser automation frameworks using the **Model Context Protocol (MCP)**. This tool compares different MCP servers (Playwright, Chrome DevTools, Vercel, Vibium, Selenium) across complex UI scenarios to measure reliability, latency, and token efficiency.

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
- **MCP-Playwright**: Official Playwright MCP implementation (`@playwright/mcp`)
- **MCP-Chrome-DevTools**: Official Google Chrome DevTools MCP (`chrome-devtools-mcp`)
- **Vercel-Agent**: Vercel's Agent Browser MCP (`agent-browser`)
- **Vibium**: Vibium Browser MCP (`vibium`)
- **MCP-Selenium**: Selenium WebDriver MCP (`@angiejones/mcp-selenium`)

---

## 📈 Reporting

After running `npm run test:all`, the framework automatically generates:
- **`results.csv`**: Raw metrics for every scenario run.
- **`LAST_RUN_SUMMARY.md`**: A human-readable performance breakdown including success rates, durations, and token efficiency.

---

## 🧪 Test Scenarios

This benchmark evaluates automation tools across **8 challenging scenarios**:

### Core Patterns
1. **Table Pagination**: Complex data retrieval across multiple pages with filtering
2. **Wizard Form**: Multi-step stateful form completion with validation
3. **Shadow DOM**: Interaction with 3-level deep nested, encapsulated elements
4. **Drag and Drop**: HTML5 drag-and-drop between columns
5. **Self Healing**: Resilience against changing IDs and CSS classes (rotates every 2s)

### Advanced Patterns
6. **Async Loading**: Wait for asynchronous operations (3-second API simulation)
7. **Modal Interaction**: Overlay management, z-index handling, popup form submission
8. **Dropdown Selection**: Native HTML `<select>` element interaction and validation

**Coverage**: ~70% of real-world QA automation scenarios. See [SCENARIOS_COVERAGE.md](./SCENARIOS_COVERAGE.md) for detailed analysis.

---

## 🔧 Configuration

The framework supports comprehensive configuration via `.env` file:

```bash
# Copy example configuration
cp .env.example .env

# Edit with your settings
```

### Key Configuration Options

**LLM Provider** (choose one):
```env
GEMINI_API_KEY=your_key          # Google Gemini (recommended)
OPENAI_API_KEY=your_key          # OpenAI GPT-4
ANTHROPIC_API_KEY=your_key       # Anthropic Claude
LOCAL_LLM_URL=http://localhost:11434/v1  # Local LLM (Ollama, LM Studio)
```

**Stability & Performance**:
```env
PARALLEL_EXECUTION=false         # Sequential mode (more stable, avoids race conditions)
MAX_STEPS=20                     # Maximum steps per scenario
CHROME_DEVTOOLS_SETTLE_DELAY_MS=2000  # Increase for flaky tests
LOG_LEVEL=DEBUG                  # DEBUG, INFO, WARN, ERROR
```

**📖 Documentation**:
- See [`.env.example`](./.env.example) for all options
- See [`STABILITY_GUIDE.md`](./STABILITY_GUIDE.md) for troubleshooting result variance

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

## 🎯 Advanced Usage

### Running Specific Adapters or Scenarios

```bash
# Test single adapter
npm run bench playwright

# Test single scenario
npm run bench playwright "shadow dom"

# Test multiple adapters in sequential mode (more stable)
PARALLEL_EXECUTION=false npm run bench
```

### Result Interpretation

The benchmark generates:
- **`results.csv`**: Raw metrics with status codes (SUCCESS/FAILED/CRASHED/ERROR)
- **`LAST_RUN_SUMMARY.md`**: Human-readable report with:
  - ✅ **SUCCESS**: Goal achieved
  - ❌ **FAILED**: Goal not achieved (normal test failure)
  - 💥 **CRASHED**: Browser/adapter crashed (infrastructure issue)
  - ⚠️ **ERROR**: Tool initialization error (config issue)

**Important**: Run benchmark **3 times** and take median for reliable comparisons. See [`STABILITY_GUIDE.md`](./STABILITY_GUIDE.md) for details.

---

## 📚 Documentation

- **[STABILITY_GUIDE.md](./STABILITY_GUIDE.md)**: Why results vary & how to achieve consistent benchmarks
- **[SCENARIOS_COVERAGE.md](./SCENARIOS_COVERAGE.md)**: Complete analysis of test scenario coverage
- **[.env.example](./.env.example)**: All configuration options

---

## 🔒 Code Hygiene & Security

- **Environment Isolation**: All API keys loaded strictly via `.env` (excluded from Git)
- **Process Management**: Automatic cleanup of zombie Chrome processes with graceful + force kill
- **Deterministic LLM**: `temperature=0` for consistent results across runs
- **Configuration Validation**: Zod schema validation for type-safe configuration
- **Structured Logging**: Color-coded logs with configurable levels (DEBUG/INFO/WARN/ERROR)
- **Parallel/Sequential Execution**: Configurable to avoid race conditions
- **Retry Logic**: Automatic retry with backoff for transient failures
- **Context Quality Validation**: 5-level priority system ensures rich page context (>100 chars)
