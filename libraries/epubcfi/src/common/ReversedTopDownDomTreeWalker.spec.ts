import { describe, expect, it } from 'vitest';
import { DomUtils } from './DomUtils.js';
import { ReversedTopDownDomTreeWalker } from './ReversedTopDownDomTreeWalker.js';
import { parseFragment } from '../testing/dom.js';
import type { Element } from '../dom.js';

const id = (node: Element | null) => DomUtils.getElementId(node!);

describe('common', () => {
    describe('ReversedTopDownDomTreeWalker', () => {
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

        it('should traverse in correct order using advance', () => {
            const element = parseFragment(html);

            const walker = new ReversedTopDownDomTreeWalker(element, node => DomUtils.isElement(node));

            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('f');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('e');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('d');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('c');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('b');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('a');
            walker.advance(true);
            expect(walker._currentNode).toBe(element);
            walker.advance(true);
            expect(walker._currentNode).toBeNull();
        });

        it('should traverse in correct order using next', () => {
            const element = parseFragment(html);

            const walker = new ReversedTopDownDomTreeWalker<Element>(element, node => DomUtils.isElement(node));

            expect(id(walker.next(true)!)).toBe('f');
            expect(id(walker.next(true)!)).toBe('e');
            expect(id(walker.next(true)!)).toBe('d');
            expect(id(walker.next(true)!)).toBe('c');
            expect(id(walker.next(true)!)).toBe('b');
            expect(id(walker.next(true)!)).toBe('a');
            expect(walker.next(true)).toBe(element);
            expect(walker.next(true)).toBeNull();
        });
    });
});
