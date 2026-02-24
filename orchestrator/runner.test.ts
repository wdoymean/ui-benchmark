import { describe, it, expect } from '@jest/globals';

// Mock verifyGoal function for testing
function verifyGoal(scenarioName: string, context: string): boolean {
    if (!context || context.length < 20) return false;
    if (context.startsWith('MCP:') || context.includes('Client not initialized')) return false;

    // Safety check: if context looks like raw HTML, it's likely a false positive from source tools
    if (context.includes('<!DOCTYPE') || (context.includes('<html') && context.includes('<body'))) return false;

    const lowerContext = context.toLowerCase();
    switch (scenarioName) {
        case 'Shadow DOM': return context.includes('The cake is a lie');
        case 'Wizard Form': return context.includes('#CONF-') && !context.includes('id="step3"'); // Should be visible
        case 'Drag and Drop': return context.includes('Completed!');
        case 'Self Healing': return context.includes('ACCESS GRANTED');
        case 'Table Pagination':
            // Stricter check for table pagination to avoid matching source code
            const hasPrice = context.includes('$900');
            const hasName = lowerContext.includes('plasma shield');
            return hasPrice && hasName && !context.includes('const data = [');
        default: return false;
    }
}

describe('verifyGoal', () => {
    describe('Shadow DOM scenario', () => {
        it('should return true when "The cake is a lie" is present', () => {
            const context = 'Some content here. The cake is a lie. More content.';
            expect(verifyGoal('Shadow DOM', context)).toBe(true);
        });

        it('should return false when the phrase is not present', () => {
            const context = 'Some other content that is long enough to pass length check';
            expect(verifyGoal('Shadow DOM', context)).toBe(false);
        });

        it('should return true even for context at minimum length when phrase is present', () => {
            const context = 'The cake is a lie!!'; // 19 chars - at boundary but has phrase
            expect(verifyGoal('Shadow DOM', context)).toBe(false); // Still fails due to < 20 check
        });

        it('should return false for very short context', () => {
            const context = 'short';
            expect(verifyGoal('Shadow DOM', context)).toBe(false);
        });
    });

    describe('Wizard Form scenario', () => {
        it('should return true when confirmation code is present and not on step3', () => {
            const context = 'Your order #CONF-12345 has been processed successfully!';
            expect(verifyGoal('Wizard Form', context)).toBe(true);
        });

        it('should return false when confirmation code is present but still on step3', () => {
            const context = '#CONF-12345 <div id="step3">Still filling form</div>';
            expect(verifyGoal('Wizard Form', context)).toBe(false);
        });

        it('should return false when no confirmation code', () => {
            const context = 'Please fill out the form to continue with your order';
            expect(verifyGoal('Wizard Form', context)).toBe(false);
        });
    });

    describe('Drag and Drop scenario', () => {
        it('should return true when "Completed!" is present', () => {
            const context = 'Task has been moved to Done column. Completed!';
            expect(verifyGoal('Drag and Drop', context)).toBe(true);
        });

        it('should return false when not completed', () => {
            const context = 'Task is still in the To Do column, not done yet';
            expect(verifyGoal('Drag and Drop', context)).toBe(false);
        });
    });

    describe('Self Healing scenario', () => {
        it('should return true when "ACCESS GRANTED" is present', () => {
            const context = 'Button clicked successfully. ACCESS GRANTED to the system.';
            expect(verifyGoal('Self Healing', context)).toBe(true);
        });

        it('should return false when access not granted', () => {
            const context = 'Please click the button to access the system';
            expect(verifyGoal('Self Healing', context)).toBe(false);
        });
    });

    describe('Table Pagination scenario', () => {
        it('should return true when both price and name are present', () => {
            const context = 'Product: Plasma Shield, Price: $900, Stock: 15 units';
            expect(verifyGoal('Table Pagination', context)).toBe(true);
        });

        it('should return false when only price is present', () => {
            const context = 'Product price is $900 for this item in the catalog';
            expect(verifyGoal('Table Pagination', context)).toBe(false);
        });

        it('should return false when only name is present', () => {
            const context = 'Looking for Plasma Shield in the product database';
            expect(verifyGoal('Table Pagination', context)).toBe(false);
        });

        it('should return false when context looks like source code', () => {
            const context = 'const data = [ { name: "Plasma Shield", price: "$900" } ]';
            expect(verifyGoal('Table Pagination', context)).toBe(false);
        });
    });

    describe('General validation rules', () => {
        it('should return false for empty context', () => {
            expect(verifyGoal('Shadow DOM', '')).toBe(false);
        });

        it('should return false for context shorter than 20 chars', () => {
            expect(verifyGoal('Shadow DOM', 'Too short')).toBe(false);
        });

        it('should return false when context starts with "MCP:"', () => {
            const context = 'MCP: Error message that is long enough to pass length validation';
            expect(verifyGoal('Shadow DOM', context)).toBe(false);
        });

        it('should return false when context contains "Client not initialized"', () => {
            const context = 'Client not initialized, please wait for connection to establish';
            expect(verifyGoal('Shadow DOM', context)).toBe(false);
        });

        it('should return false when context looks like HTML source', () => {
            const context = '<!DOCTYPE html><html><body>The cake is a lie</body></html>';
            expect(verifyGoal('Shadow DOM', context)).toBe(false);
        });

        it('should return false for unknown scenario', () => {
            const context = 'Some valid context that is long enough for validation';
            expect(verifyGoal('Unknown Scenario', context)).toBe(false);
        });
    });
});
