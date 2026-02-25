export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export interface AdapterResponse {
    success: boolean;
    message: string;
    contextSize?: number; // Total characters in the message/content
    data?: any;
}

export interface PageContext {
    text: string;
    screenshot?: {
        type: 'image';
        data: string; // base64 encoded image data
        mimeType: string;
    };
}

export interface BrowserAdapter {
    name: string;
    init(): Promise<void>;
    getTools(): Tool[];
    executeTool(name: string, args: any): Promise<AdapterResponse>;
    getPageContext(): Promise<string | PageContext>;
    close(): Promise<void>;
}
