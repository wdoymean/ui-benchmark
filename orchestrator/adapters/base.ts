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

export interface BrowserAdapter {
    name: string;
    init(): Promise<void>;
    getTools(): Tool[];
    executeTool(name: string, args: any): Promise<AdapterResponse>;
    getPageContext(): Promise<string>;
    close(): Promise<void>;
}
