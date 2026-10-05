import { describe, expect, it } from 'vitest';
import { DomUtils } from './DomUtils.js';
import { ReversedTopDownDomTreeWalker } from './ReversedTopDownDomTreeWalker.js';

describe('common', () => {
    describe('ReversedTopDownDomTreeWalker', () => {
        it('should traverse in correct order using advance', () => {
            const html = `
                <div id="a">
                    <div id="b"></div>
                    <div id="c">
                        <div id="d">
                            <div id="e"></div>
                        </div>
                    </div>
                    <div id="f"></div>
                </div>
            `;

            const element = document.createElement('div');
            element.innerHTML = html;

            const walker = new ReversedTopDownDomTreeWalker(element, node => DomUtils.isElement(node));

            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('f');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('e');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('d');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('c');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('b');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('a');
            walker.advance(true);
            expect(walker._currentNode).toBe(element);
            walker.advance(true);
            expect(walker._currentNode).toBeNull();
        });

        it('should traverse in correct order using next', () => {
            const html = `
                <div id="a">
                    <div id="b"></div>
                    <div id="c">
                        <div id="d">
                            <div id="e"></div>
                        </div>
                    </div>
                    <div id="f"></div>
                </div>
            `;

            const element = document.createElement('div');
            element.innerHTML = html;

            const walker = new ReversedTopDownDomTreeWalker<Element>(element, node => DomUtils.isElement(node));

            expect(walker.next(true)!.id).toBe('f');
            expect(walker.next(true)!.id).toBe('e');
            expect(walker.next(true)!.id).toBe('d');
            expect(walker.next(true)!.id).toBe('c');
            expect(walker.next(true)!.id).toBe('b');
            expect(walker.next(true)!.id).toBe('a');
            expect(walker.next(true)).toBe(element);
            expect(walker.next(true)).toBeNull();
        });
    });
});
