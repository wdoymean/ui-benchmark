"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightAdapter = void 0;
const playwright_1 = require("playwright");
class PlaywrightAdapter {
    name = 'Playwright';
    browser;
    page;
    async init() {
        this.browser = await playwright_1.chromium.launch({ headless: false });
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
                name: 'click',
                description: 'Click an element by CSS selector',
                parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] }
            },
            {
                name: 'fill',
                description: 'Fill an input field',
                parameters: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] }
            },
            {
                name: 'drag_and_drop',
                description: 'Drag one element to another',
                parameters: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' } }, required: ['source', 'target'] }
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
                case 'click':
                    await this.page.click(args.selector);
                    return { success: true, message: `Clicked ${args.selector}` };
                case 'fill':
                    await this.page.fill(args.selector, args.value);
                    return { success: true, message: `Filled ${args.selector}` };
                case 'drag_and_drop':
                    await this.page.dragAndDrop(args.source, args.target);
                    return { success: true, message: `Dragged ${args.source} to ${args.target}` };
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
        const dom = await this.page.evaluate(() => {
            // Very basic DOM cleaning for LLM
            return document.body.innerText + '\n' + Array.from(document.querySelectorAll('button, input, a, [draggable="true"]')).map(el => {
                return `${el.tagName} id="${el.id}" class="${el.className}" text="${el.textContent?.trim().slice(0, 30)}"`;
            }).join('\n');
        });
        return dom;
    }
    async close() {
        await this.browser?.close();
    }
}
exports.PlaywrightAdapter = PlaywrightAdapter;
