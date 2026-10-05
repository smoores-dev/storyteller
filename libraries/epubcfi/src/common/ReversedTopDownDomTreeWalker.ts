import { isFunction } from './Utils.js';
import { DomTreeWalker } from './DomTreeWalker.js';

/**
 * Same as the DomTreeWalker (top-down) but traverses in reversed order.
 * WARNING:
 * When creating the walker, _currentNode will always point to startNode.
 * First advance() will move the pointer to last deepest child (which would have been the last visited node in the regular DomTreeWalker)
 *
 * By Using the next() method instead, the order is exactly the same as reversed regular DomTreeWalker.
 */
export class ReversedTopDownDomTreeWalker<S extends Node = Node> extends DomTreeWalker<S> {
    protected override advanceToNextNode(canTraverseDeeper: boolean | ((node: Node) => boolean)): number {
        let node: Node = this._currentNode!;
        let result = 0;

        if (
            this._pristine &&
            node.lastChild &&
            (isFunction(canTraverseDeeper) ? canTraverseDeeper(node) : canTraverseDeeper)
        ) {
            while (node.lastChild && (isFunction(canTraverseDeeper) ? canTraverseDeeper(node) : canTraverseDeeper)) {
                node = node.lastChild;
                result++;
            }
            this._currentNode = node;
        } else if (node !== this._endNode && node.previousSibling) {
            node = node.previousSibling;
            while (node.lastChild && (isFunction(canTraverseDeeper) ? canTraverseDeeper(node) : canTraverseDeeper)) {
                node = node.lastChild;
                result++;
            }

            this._currentNode = node;
        } else {
            if (node === this._endNode || !node.parentNode) {
                this._currentNode = null;
            } else {
                this._currentNode = node.parentNode;
                result = -1;
            }
        }

        return result;
    }

    override next(canTraverseDeeper: boolean | ((node: Node) => boolean)): S | null {
        this.advance(canTraverseDeeper);
        return this._currentNode as S;
    }
}
