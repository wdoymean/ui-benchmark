import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
    // LLM Configuration
    llm: z.object({
        provider: z.enum(['anthropic', 'openai', 'gemini', 'local']),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional(),
        model: z.string().optional(),
    }),

    // Benchmark Configuration
    benchmark: z.object({
        maxSteps: z.number().int().positive().default(20),
        maxRetries: z.number().int().positive().default(3),
        retryDelayMs: z.number().int().positive().default(2000),
        defaultToolTimeoutMs: z.number().int().positive().default(5000),
        chromeDevToolsTimeoutMs: z.number().int().positive().default(10000),
        chromeDevToolsSettleDelayMs: z.number().int().positive().default(1000),
        vibiumWarmupDelayMs: z.number().int().positive().default(2000),
        vercelStabilizationDelayMs: z.number().int().positive().default(5000),
    }),

    // Target Application
    target: z.object({
        baseUrl: z.string().url().default('http://localhost:3001'),
        port: z.number().int().positive().default(3001),
    }),

    // Output Configuration
    output: z.object({
        resultsFile: z.string().default('results.csv'),
        reportFile: z.string().default('LAST_RUN_SUMMARY.md'),
    }),
});

export type Config = z.infer<typeof ConfigSchema>;

function getLLMProvider(): 'anthropic' | 'openai' | 'gemini' | 'local' {
    if (process.env.LOCAL_LLM_URL) return 'local';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    throw new Error('No LLM configuration found. Please set one of: LOCAL_LLM_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
}

function loadConfig(): Config {
    const provider = getLLMProvider();

    const rawConfig = {
        llm: {
            provider,
            apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY,
            baseUrl: process.env.LOCAL_LLM_URL,
            model: process.env.GEMINI_MODEL || process.env.LOCAL_LLM_MODEL,
        },
        benchmark: {
            maxSteps: process.env.MAX_STEPS ? parseInt(process.env.MAX_STEPS, 10) : 20,
            maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES, 10) : 3,
            retryDelayMs: process.env.RETRY_DELAY_MS ? parseInt(process.env.RETRY_DELAY_MS, 10) : 2000,
            defaultToolTimeoutMs: process.env.DEFAULT_TOOL_TIMEOUT_MS ? parseInt(process.env.DEFAULT_TOOL_TIMEOUT_MS, 10) : 5000,
            chromeDevToolsTimeoutMs: process.env.CHROME_DEVTOOLS_TIMEOUT_MS ? parseInt(process.env.CHROME_DEVTOOLS_TIMEOUT_MS, 10) : 10000,
            chromeDevToolsSettleDelayMs: process.env.CHROME_DEVTOOLS_SETTLE_DELAY_MS ? parseInt(process.env.CHROME_DEVTOOLS_SETTLE_DELAY_MS, 10) : 1000,
            vibiumWarmupDelayMs: process.env.VIBIUM_WARMUP_DELAY_MS ? parseInt(process.env.VIBIUM_WARMUP_DELAY_MS, 10) : 2000,
            vercelStabilizationDelayMs: process.env.VERCEL_STABILIZATION_DELAY_MS ? parseInt(process.env.VERCEL_STABILIZATION_DELAY_MS, 10) : 5000,
        },
        target: {
            baseUrl: process.env.TARGET_BASE_URL || 'http://localhost:3001',
            port: process.env.TARGET_PORT ? parseInt(process.env.TARGET_PORT, 10) : 3001,
        },
        output: {
            resultsFile: process.env.RESULTS_FILE || 'results.csv',
            reportFile: process.env.REPORT_FILE || 'LAST_RUN_SUMMARY.md',
        },
    };

    try {
        return ConfigSchema.parse(rawConfig);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Configuration validation failed:');
            error.errors.forEach(err => {
                console.error(`  - ${err.path.join('.')}: ${err.message}`);
            });
        }
        throw new Error('Invalid configuration. Please check your .env file.');
    }
}

export const config = loadConfig();
