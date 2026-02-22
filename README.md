# MCP Browser Automation Benchmark

Benchmarking harness for comparing browser automation frameworks (Playwright, Puppeteer, Vibium, Vercel Agent) using different LLM providers.

## Project Structure

- `target-app/`: Local Express server (Port 3001) with 5 interactive test scenarios.
- `orchestrator/`: Benchmarking engine.
  - `adapters/`: Logic for various browser automation frameworks.
  - `llm-client.ts`: LLM wrapper supporting Claude, GPT-4, Gemini, and Local models.
  - `runner.ts`: Core orchestrator that manages scenarios, adapters, and LLM turns.
  - `telemetry.ts`: Metrics capture and CSV reporting.

## Test Scenarios (Target App)

1. **Table Pagination**: Find items by navigating through pages and applying filters.
2. **Wizard Form**: Complete a multi-step checkout process with field validation.
3. **Shadow DOM**: Interact with elements hidden inside nested Shadow Roots.
4. **Drag and Drop**: Move tasks between columns on a Kanban board.
5. **Self-Healing**: Click buttons whose identifiers (ID/Class) change dynamically.

## Supported LLMs

Configure your preferred provider in `.env`:

*   **Anthropic**: `ANTHROPIC_API_KEY=...`
*   **OpenAI**: `OPENAI_API_KEY=...`
*   **Google Gemini**: `GEMINI_API_KEY=...` (Supports custom models via `GEMINI_MODEL`)
*   **Local LLM (Ollama/LM Studio)**: 
    ```env
    LOCAL_LLM_URL=http://localhost:11434/v1
    LOCAL_LLM_MODEL=llama3
    ```

## Usage

### 1. Start Target Application
```bash
npm run target
```
The dashboard is available at: [http://localhost:3001/](http://localhost:3001/)

### 2. Run Benchmark
Execute the full suite and generate a report:
```bash
npm run benchmark
```

### 3. Running Specific Tests (Selective Benchmarking)
You can filter by adapter name or scenario name using command-line arguments:
```bash
# Run only Playwright adapter
npm run bench -- playwright

# Run MCP Playwright on the "Shadow DOM" scenario
npm run bench -- mcp-playwright shadow
```

## Metrics & Results

The runner exports performance data to **`results.csv`** and generates **`BENCHMARK_REPORT.md`** including:
- **Success/Failure**: Based on scenario-specific confirmation markers.
- **Steps**: Total turns taken (capped at 5 per scenario).
- **Latency**: Duration (ms) split by LLM (inference) and Tool (browser action).
- **Token Efficiency**: Calculated as `Success / (Prompt + Completion Tokens)`. 
    - **Higher is better.** 
    - A higher value means the model/adapter combination is more intelligent and cost-effective, achieving success with minimal conversational overhead.
- **Cost**: Raw token usage (Prompt & Completion).

## Security Note

Browser adapters are launched with `--disable-web-security` and CSP bypass enabled to allow LLM-driven automation without interference from restrictive security policies during benchmarking.
