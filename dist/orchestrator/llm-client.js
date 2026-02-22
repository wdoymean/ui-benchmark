"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class LLMClient {
    anthropic;
    openai;
    provider;
    constructor() {
        if (process.env.ANTHROPIC_API_KEY) {
            this.anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
            this.provider = 'anthropic';
        }
        else if (process.env.OPENAI_API_KEY) {
            this.openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
            this.provider = 'openai';
        }
        else {
            throw new Error('No LLM API key found in .env');
        }
    }
    async chat(messages, tools) {
        if (this.provider === 'anthropic') {
            const response = await this.anthropic.messages.create({
                model: 'claude-3-opus-20240229',
                max_tokens: 1024,
                messages: messages.filter(m => m.role !== 'system'),
                system: messages.find(m => m.role === 'system')?.content,
                tools: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters
                })),
            });
            return {
                content: response.content.filter(c => c.type === 'text').map((c) => c.text).join('\n'),
                toolCalls: response.content.filter(c => c.type === 'tool_use'),
                usage: {
                    promptTokens: response.usage.input_tokens,
                    completionTokens: response.usage.output_tokens
                }
            };
        }
        else {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: messages,
                tools: tools.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters
                    }
                })),
            });
            return {
                content: response.choices[0].message.content || '',
                toolCalls: response.choices[0].message.tool_calls,
                usage: {
                    promptTokens: response.usage?.prompt_tokens || 0,
                    completionTokens: response.usage?.completion_tokens || 0
                }
            };
        }
    }
}
exports.LLMClient = LLMClient;
