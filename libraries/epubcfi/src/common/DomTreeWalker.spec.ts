import { describe, expect, it } from 'vitest';
import { DomTreeWalker } from './DomTreeWalker.js';
import {DomUtils} from './DomUtils.js';
import {NodeType} from './definitions/NodeType.js';
import { parseFragment } from '../testing/dom.js';
import type { Element, Text } from '../dom.js';

const id = (node: Element | null) => DomUtils.getElementId(node!);

describe('common', () => {
    describe('DomTreeWalker', () => {
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

            const walker = new DomTreeWalker(element, node => DomUtils.isElement(node));

            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('a');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('b');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('c');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('d');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('e');
            walker.advance(true);
            expect(id(walker._currentNode as Element)).toBe('f');
            walker.advance(true);
            expect(walker._currentNode).toBeNull();
        });

        it('should traverse in correct order using next', () => {
            const element = parseFragment(html);

            const walker = new DomTreeWalker<Element>(element, DomUtils.isElement);
            // Skip container div
            walker.next(true);

            expect(id(walker.next(true)!)).toBe('a');
            expect(id(walker.next(true)!)).toBe('b');
            expect(id(walker.next(true)!)).toBe('c');
            expect(id(walker.next(true)!)).toBe('d');
            expect(id(walker.next(true)!)).toBe('e');
            expect(id(walker.next(true)!)).toBe('f');
            expect(walker.next(true)).toBeNull();
        });

        it('should work on empty root node', () => {
            let div = parseFragment('');

            let walker = new DomTreeWalker(div, node => DomUtils.isElement(node) || DomUtils.isTextNode(node));

            let result = walker.advance(true);

            expect(result).toEqual(0);
            expect(walker._currentNode).toBeNull();
        });

        it('should work on valid tree structure', () => {
            let div = parseFragment(`
            <div id="a">
                <div id="b">
                    <span>hej</span>
                    <span>då</span>
            </div></div>
        `);
            let walker = new DomTreeWalker(div, node => DomUtils.isElement(node) || DomUtils.isTextNode(node));

            let result = walker.advance(true);
            expect(result).toBe(1);
            expect(walker._currentNode!.nodeType).toBe(NodeType.TEXT_NODE);

            result = walker.advance(true);
            expect(result).toBe(0);
            expect(walker._currentNode!.nodeType).toBe(NodeType.ELEMENT_NODE);
            expect(id(walker._currentNode as Element)).toEqual('a');

            result = walker.advance(true);
            expect(result).toBe(1);
            expect(walker._currentNode!.nodeType).toBe(NodeType.TEXT_NODE);

            result = walker.advance(true);
            expect(result).toBe(0);
            expect(walker._currentNode!.nodeType).toBe(NodeType.ELEMENT_NODE);
            expect(id(walker._currentNode as Element)).toEqual('b');

            walker.advance(true);
            walker.advance(true);
            expect(walker._currentNode!.nodeName).toBe('span');
            expect(walker._currentNode!.textContent).toBe('hej');

            walker.advance(false); // Dont dive down in span
            walker.advance(true);

            expect(walker._currentNode!.nodeName).toBe('span');
            expect(walker._currentNode!.textContent).toBe('då');
            walker.advance(true); // dive down in span
            expect(walker._currentNode!.nodeType).toBe(NodeType.TEXT_NODE);
            expect((walker._currentNode as Text).data).toBe('då');

            walker.advance(true);
            // Last text node
            expect(walker._currentNode!.nodeType).toBe(NodeType.TEXT_NODE);
            expect(walker._currentNode!.nextSibling).toBeFalsy();

            walker.advance(true);
            expect(walker._currentNode!.nodeType).toBe(NodeType.TEXT_NODE);

            expect(walker._currentNode!.parentNode).toBe(div);

            walker.advance(true);
            expect(walker._currentNode).toBeNull();
        });
    });
});
