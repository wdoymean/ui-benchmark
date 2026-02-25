import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Tool } from './adapters/base';

dotenv.config();

export interface LLMResponse {
    content: string;
    toolCalls?: any[];
    usage: {
        promptTokens: number;
        completionTokens: number;
    };
}

export class LLMClient {
    private anthropic?: Anthropic;
    private openai?: OpenAI;
    private gemini?: GoogleGenerativeAI;
    private provider: 'anthropic' | 'openai' | 'gemini' | 'local';

    constructor() {
        if (process.env.LOCAL_LLM_URL) {
            this.openai = new OpenAI({
                apiKey: 'local-no-key',
                baseURL: process.env.LOCAL_LLM_URL
            });
            this.provider = 'local';
        } else if (process.env.ANTHROPIC_API_KEY) {
            this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            this.provider = 'anthropic';
        } else if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            this.provider = 'openai';
        } else if (process.env.GEMINI_API_KEY) {
            this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.provider = 'gemini';
        } else {
            throw new Error('No LLM configuration found in .env (LOCAL_LLM_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY)');
        }
    }

    async chat(messages: any[], tools: Tool[]): Promise<LLMResponse> {
        if (this.provider === 'anthropic') {
            const response = await this.anthropic!.messages.create({
                model: 'claude-3-opus-20240229',
                max_tokens: 1024,
                temperature: 0,  // Deterministic output
                messages: messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({ role: m.role, content: m.content })),
                system: messages.find(m => m.role === 'system')?.content,
                tools: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters as any
                })),
            } as any);

            return {
                content: (response.content as any[]).filter(c => c.type === 'text').map((c: any) => c.text).join('\n'),
                toolCalls: (response.content as any[]).filter(c => c.type === 'tool_use'),
                usage: {
                    promptTokens: response.usage.input_tokens,
                    completionTokens: response.usage.output_tokens
                }
            };
        } else if (this.provider === 'gemini') {
            const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
            console.log(`[LLM] Using Gemini model: ${modelName}`);
            console.log(`[LLM] Gemini Tools: ${JSON.stringify(tools.map(t => t.name))}`);
            const model = this.gemini!.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0,  // Deterministic output
                    topP: 1,
                    topK: 1,
                },
                tools: [{
                    functionDeclarations: tools.map(t => {
                        const cleanSchema = (schema: any): any => {
                            if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

                            const cleaned: any = {};

                            // 1. Handle 'type' (Gemini requires it to be a single string)
                            if (schema.type) {
                                if (Array.isArray(schema.type)) {
                                    // Take the first non-null type if it's a union
                                    cleaned.type = schema.type.find((v: string) => v !== 'null') || schema.type[0];
                                } else {
                                    cleaned.type = schema.type;
                                }
                            }

                            if (schema.description) cleaned.description = schema.description;
                            if (schema.enum) cleaned.enum = schema.enum;

                            // 2. Handle Objects
                            if (cleaned.type === 'object' || schema.properties) {
                                cleaned.type = 'object'; // Ensure type is set
                                if (schema.properties) {
                                    cleaned.properties = {};
                                    for (const prop in schema.properties) {
                                        cleaned.properties[prop] = cleanSchema(schema.properties[prop]);
                                    }
                                }
                                if (Array.isArray(schema.required)) {
                                    cleaned.required = schema.required;
                                }
                            }
                            // 3. Handle Arrays
                            else if (cleaned.type === 'array' || schema.items) {
                                cleaned.type = 'array';
                                if (schema.items) {
                                    cleaned.items = cleanSchema(schema.items);
                                }
                            }

                            return cleaned;
                        };

                        return {
                            name: t.name,
                            description: t.description || 'No description',
                            parameters: cleanSchema(t.parameters)
                        };
                    })
                }] as any
            });

            // Gemini requires alternating roles (user -> model -> user)
            // And history must NOT end with a user message if we use sendMessage()
            const filteredMessages = messages.filter(m => m.role !== 'system');
            const history = filteredMessages.slice(0, -1).map(m => {
                const content = m.content;
                let parts: any[];

                // Handle multimodal content (arrays with images and text)
                if (Array.isArray(content)) {
                    parts = content.map((item: any) => {
                        if (item.type === 'image' && item.source) {
                            return {
                                inlineData: {
                                    mimeType: item.source.media_type,
                                    data: item.source.data
                                }
                            };
                        } else if (item.type === 'text') {
                            return { text: item.text };
                        }
                        return { text: JSON.stringify(item) };
                    });
                } else if (typeof content === 'string') {
                    parts = [{ text: content }];
                } else {
                    parts = [{ text: JSON.stringify(content) }];
                }

                return {
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts
                };
            });

            const lastMessageContent = filteredMessages[filteredMessages.length - 1]?.content;
            let lastMessage: any;

            // Convert last message content to Gemini format
            if (Array.isArray(lastMessageContent)) {
                lastMessage = lastMessageContent.map((item: any) => {
                    if (item.type === 'image' && item.source) {
                        return {
                            inlineData: {
                                mimeType: item.source.media_type,
                                data: item.source.data
                            }
                        };
                    } else if (item.type === 'text') {
                        return { text: item.text };
                    }
                    return { text: JSON.stringify(item) };
                });
            } else {
                lastMessage = lastMessageContent || 'Continue';
            }

            try {
                const chat = model.startChat({ history });
                const result = await chat.sendMessage(lastMessage);
                const response = result.response;
                const toolCalls = response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall);

                return {
                    content: response.text(),
                    toolCalls: toolCalls?.map(tc => ({
                        name: tc.functionCall?.name,
                        args: tc.functionCall?.args
                    })),
                    usage: {
                        promptTokens: response.usageMetadata?.promptTokenCount || 0,
                        completionTokens: response.usageMetadata?.candidatesTokenCount || 0
                    }
                };
            } catch (error: any) {
                if (error.status === 404) {
                    throw new Error(`Gemini Model Not Found (404). This often happens if you use a Vertex AI key with the Google AI SDK, or if the model '${modelName}' is not available in your region.`);
                }
                if (error.status === 400) {
                    console.error('[LLM] Gemini Bad Request:', JSON.stringify(error, null, 2));
                }
                throw error;
            }
        } else {
            const isLocal = this.provider === 'local';
            const model = isLocal ? (process.env.LOCAL_LLM_MODEL || 'llama3') : 'gpt-4-turbo-preview';

            const response = await this.openai!.chat.completions.create({
                model: model,
                messages: messages,
                temperature: 0,  // Deterministic output
                seed: 42,        // Consistent results across runs
                tools: tools.map(t => ({
                    type: 'function' as const,
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
