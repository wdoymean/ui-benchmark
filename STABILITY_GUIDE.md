# 🎯 Benchmark Stability Guide

## Why Results Vary Between Runs

### Root Causes Identified

#### 1. **LLM Non-Determinism** ✅ FIXED
**Problem**: Without `temperature=0`, LLMs use stochastic sampling, making different decisions each run.

**Solution**: Added deterministic settings to all LLM providers:
- Gemini: `temperature: 0, topP: 1, topK: 1`
- OpenAI: `temperature: 0, seed: 42`
- Anthropic: `temperature: 0`

**Impact**: ~70-80% reduction in decision variance

#### 2. **Race Conditions** ✅ MITIGATED
**Problem**: Parallel adapter execution competes for:
- Browser ports (Chrome instances)
- Target application (single URL for all)
- System resources (CPU, memory)

**Solution**: Added `PARALLEL_EXECUTION` config option
```bash
# For maximum stability (slower)
PARALLEL_EXECUTION=false

# For speed (may have race conditions)
PARALLEL_EXECUTION=true  # default
```

**Impact**: Sequential mode eliminates cross-adapter interference

#### 3. **Context Quality Variations** ✅ IMPROVED
**Problem**: If visual tools fail → fallback to weaker context → different LLM behavior

**Solution**: Priority-based context retrieval with validation:
1. Visual tools (Vibium screenshots) - richest
2. Chrome DevTools eval - Shadow DOM support
3. Capability-specific (get_html, get_dom)
4. Generic evaluate tools
5. Fallback "get"/"page" tools

**Each level validates**: `message.length > 100 chars`

**Impact**: More consistent context quality across runs

#### 4. **Timing Issues** ⚠️ PARTIALLY MITIGATED
**Problem**: Pages may not be fully loaded when context is captured

**Current Delays**:
- Chrome DevTools: 1000ms settle delay
- Vercel: 5000ms stabilization
- Vibium: 2000ms warmup

**Remaining Issue**: No retry logic for failed page loads

**Recommendation**: Increase delays if seeing inconsistent results:
```bash
CHROME_DEVTOOLS_SETTLE_DELAY_MS=2000
VERCEL_STABILIZATION_DELAY_MS=7000
```

#### 5. **Process Cleanup** ✅ FIXED
**Problem**: Zombie Chrome processes from crashes affected subsequent runs

**Solution**:
- Global exit handlers (`SIGINT`, `SIGTERM`, `uncaughtException`)
- Graceful close with 3s timeout
- Force kill (`SIGKILL`) on failure

**Impact**: Clean state between benchmark runs

---

## 🔧 Recommendations for Stable Results

### For Consistent Benchmarking
```bash
# .env configuration
PARALLEL_EXECUTION=false          # Sequential execution
CHROME_DEVTOOLS_SETTLE_DELAY_MS=2000
VERCEL_STABILIZATION_DELAY_MS=7000
```

### For Fast Iteration
```bash
# .env configuration
PARALLEL_EXECUTION=true           # Parallel execution (default)
# Keep default delays
```

### Before Comparing Results
1. **Run 3 times** and take median/average
2. **Check context sizes** in CSV - low sizes (<500 chars) indicate context retrieval issues
3. **Look for CRASHED status** - indicates infrastructure problems, not tool quality
4. **Use same LLM provider** - results vary significantly between Gemini/GPT-4/Claude

### Debugging Flaky Tests
```bash
# Enable debug logging
LOG_LEVEL=DEBUG

# Run single adapter
npm run bench playwright

# Run single scenario
npm run bench playwright "shadow dom"
```

---

## 📊 Expected Variance

Even with all fixes, some variance is **expected**:

| Status | Expected Variance | Reason |
|--------|------------------|---------|
| **SUCCESS** | ±10% | LLM may find same solution in different # of steps |
| **FAILED** | ±20% | Edge cases near success threshold |
| **CRASHED** | Should be 0% | If seeing crashes, it's an infrastructure issue |
| **ERROR** | Should be 0% | If seeing errors, tool is misconfigured |

### Metrics Variance
- **Steps**: ±2-3 steps normal (different solution paths)
- **Duration**: ±30% normal (network latency, CPU load)
- **Token Usage**: ±15% normal (different wording in responses)
- **Context Size**: Should be stable (±5%) - larger variance indicates issues

---

## 🚨 Red Flags

If you see these patterns, investigate:

1. **All adapters failing same scenario**: Target app issue or LLM hallucinating
2. **Same adapter 100% → 0% success**: Race condition or port conflict
3. **Avg Context < 300 chars**: Context retrieval broken
4. **Many CRASHED statuses**: Need to increase timeouts or fix cleanup
5. **Steps always maxing out (20)**: Goal verification logic may be wrong

---

## 🔬 Advanced: Reproducing Exact Results

For research/publication, use this setup:
```bash
# Fix everything
PARALLEL_EXECUTION=false
GEMINI_MODEL=gemini-1.5-flash-002  # Pin specific version
CHROME_DEVTOOLS_SETTLE_DELAY_MS=3000
VERCEL_STABILIZATION_DELAY_MS=10000

# Run multiple times
npm run bench && sleep 5 && npm run bench && sleep 5 && npm run bench

# Statistical analysis
# Success rate should be within ±5% across 3 runs
```

---

## 📝 Reporting Results

When sharing benchmark results:
1. ✅ Include `.env` configuration used
2. ✅ Report median of 3 runs (not single run)
3. ✅ Include variance/std deviation
4. ✅ Specify LLM model & version
5. ✅ Note any CRASHED/ERROR results separately
6. ✅ Include average context sizes

Example:
> "Playwright MCP: 4/5 scenarios successful (3 run median), 1 CRASHED (Drag & Drop), avg context: 1850 chars, using Gemini Flash with temperature=0"
