import { describe, expect, it } from 'vitest';
import { DomTreeWalker } from './DomTreeWalker.js';
import {DomUtils} from './DomUtils.js';

describe('common', () => {
    describe('DomTreeWalker', () => {
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

            const walker = new DomTreeWalker(element, node => DomUtils.isElement(node));

            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('a');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('b');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('c');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('d');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('e');
            walker.advance(true);
            expect((walker._currentNode as Element).id).toBe('f');
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

            const walker = new DomTreeWalker<Element>(element, DomUtils.isElement);
            // Skip container div
            walker.next(true);

            expect(walker.next(true)!.id).toBe('a');
            expect(walker.next(true)!.id).toBe('b');
            expect(walker.next(true)!.id).toBe('c');
            expect(walker.next(true)!.id).toBe('d');
            expect(walker.next(true)!.id).toBe('e');
            expect(walker.next(true)!.id).toBe('f');
            expect(walker.next(true)).toBeNull();
        });

        it('should work on empty root node', () => {
            let div = document.createElement('div');

            let walker = new DomTreeWalker(div, node => DomUtils.isElement(node) || DomUtils.isTextNode(node));

            let result = walker.advance(true);

            expect(result).toEqual(0);
            expect(walker._currentNode).toBeNull();
        });

        it('should work on valid tree structure', () => {
            let div = document.createElement('div');
            div.innerHTML = `
            <div id="a">
                <div id="b">
                    <span>hej</span>
                    <span>då</span>
            </div></div>
        `;
            let walker = new DomTreeWalker(div, node => DomUtils.isElement(node) || DomUtils.isTextNode(node));

            let result = walker.advance(true);
            expect(result).toBe(1);
            expect(walker._currentNode!.nodeType).toBe(Node.TEXT_NODE);

            result = walker.advance(true);
            expect(result).toBe(0);
            expect(walker._currentNode!.nodeType).toBe(Node.ELEMENT_NODE);
            expect((walker._currentNode as Element).id).toEqual('a');

            result = walker.advance(true);
            expect(result).toBe(1);
            expect(walker._currentNode!.nodeType).toBe(Node.TEXT_NODE);

            result = walker.advance(true);
            expect(result).toBe(0);
            expect(walker._currentNode!.nodeType).toBe(Node.ELEMENT_NODE);
            expect((walker._currentNode as Element).id).toEqual('b');

            walker.advance(true);
            walker.advance(true);
            expect(walker._currentNode!.nodeName).toBe('SPAN');
            expect(walker._currentNode!.textContent).toBe('hej');

            walker.advance(false); // Dont dive down in span
            walker.advance(true);

            expect(walker._currentNode!.nodeName).toBe('SPAN');
            expect(walker._currentNode!.textContent).toBe('då');
            walker.advance(true); // dive down in span
            expect(walker._currentNode!.nodeType).toBe(Node.TEXT_NODE);
            expect((walker._currentNode as Text).data).toBe('då');

            walker.advance(true);
            // Last text node
            expect(walker._currentNode!.nodeType).toBe(Node.TEXT_NODE);
            expect(walker._currentNode!.nextSibling).toBeFalsy();

            walker.advance(true);
            expect(walker._currentNode!.nodeType).toBe(Node.TEXT_NODE);

            expect(walker._currentNode!.parentNode).toBe(div);

            walker.advance(true);
            expect(walker._currentNode).toBeNull();
        });
    });
});
