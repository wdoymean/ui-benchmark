"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerCdpAdapter = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
class PuppeteerCdpAdapter {
    name = 'Puppeteer-CDP';
    browser;
    page;
    async init() {
        this.browser = await puppeteer_1.default.launch({ headless: false });
        this.page = await this.browser.newPage();
    }
    getTools() {
        return [
            {
                name: 'navigate',
                description: 'Navigate to a URL',
                parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
            },
            {
                name: 'click_cdp',
                description: 'Click using CDP accessibility tree coordinates or selector',
                parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] }
            },
            {
                name: 'type_text',
                description: 'Type text into an element',
                parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] }
            }
        ];
    }
    async executeTool(name, args) {
        if (!this.page)
            return { success: false, message: 'Browser not initialized' };
        try {
            switch (name) {
                case 'navigate':
                    await this.page.goto(args.url);
                    return { success: true, message: `Navigated to ${args.url}` };
                case 'click_cdp':
                    await this.page.click(args.selector);
                    return { success: true, message: `Clicked ${args.selector}` };
                case 'type_text':
                    await this.page.type(args.selector, args.text);
                    return { success: true, message: `Typed into ${args.selector}` };
                default:
                    return { success: false, message: `Unknown tool: ${name}` };
            }
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async getPageContext() {
        if (!this.page)
            return '';
        // CDP specific: Get AXTree or similar. For now, simple DOM.
        const client = await this.page.target().createCDPSession();
        const { nodes } = await client.send('Accessibility.getFullAXTree');
        return JSON.stringify(nodes.slice(0, 50)); // Simplified
    }
    async close() {
        await this.browser?.close();
    }
}
exports.PuppeteerCdpAdapter = PuppeteerCdpAdapter;
