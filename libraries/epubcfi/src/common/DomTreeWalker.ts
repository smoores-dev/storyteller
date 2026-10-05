import { isFunction } from './Utils.js';

/**
 * A TreeWalker implementation that has a bit different API than the default TreeWalker.
 *
 * This tree walker will report how many levels that DOM was traversed when advancing it to next node.
 * It also support setting both startNode and endNode for making it suitable for traversing Ranges.
 */
export class DomTreeWalker<S extends Node = Node> {
    _currentNode: Node | null;
    protected _endNode: Node | null = null;
    protected _nodeFilter: null | ((node: Node) => boolean);
    protected _pristine: boolean = true;

    constructor(startNode: Node, nodeFilter?: (node: Node) => boolean);
    constructor(startNode: Node, nodeFilter?: (node: Node) => node is S) {
        this._currentNode = startNode;
        this._endNode = startNode;
        this._nodeFilter = nodeFilter || null;
    }

    /**
     * Advance currentNode so that it points to the next node in the DOM, taking into account current nodeFilter and canTraverseDeeper.
     * The returned number indicates how the DOM was traversed to the new currentNode.
     *
     * -x: The new currentNode is x parent levels above the previous currentNode.
     *  0: The new currentNode is a sibling to the previous currentNode.
     * +x : The new currentNode is a child or grandchild to the previous currentNode.
     *
     * @param canTraverseDeeper A boolean or callback indicating if the tree walker should down deeper into current node if possible.
     * @return The number indicating how the DOM was traversed. See explanation above.
     */
    advance(canTraverseDeeper: boolean | ((node: Node) => boolean)): number {
        if (this._currentNode === null) {
            return 0;
        }

        let result = this.advanceToNextNode(canTraverseDeeper);
        this._pristine = false;

        while (this._currentNode !== null && this._nodeFilter && !this._nodeFilter(this._currentNode!)) {
            result += this.advanceToNextNode(canTraverseDeeper);
        }

        return result;
    }

    next(canTraverseDeeper: boolean | ((node: Node) => boolean)): S | null {
        if (this._pristine && (!this._nodeFilter || this._nodeFilter(this._currentNode!))) {
            this._pristine = false;
            return this._currentNode as S;
        }
        this.advance(canTraverseDeeper);
        return this._currentNode as S;
    }

    /**
     * When this node is passed, stop tree walker.
     * This means that the endNode and all its children will be traversed, but the walker will not continue to advance after that.
     *
     * Note that the TreeWalker will traverse pass the end node if it is part of a sub-tree skipped with advance(canTraverseDeeper = false).
     */
    setEndNode(node: Node | null): void {
        this._endNode = node;
    }

    protected advanceToNextNode(canTraverseDeeper: boolean | ((node: Node) => boolean)): number {
        let node: Node = this._currentNode!;
        let result = 0;

        if (node.firstChild && (isFunction(canTraverseDeeper) ? canTraverseDeeper(node) : canTraverseDeeper)) {
            // Dont check end node here, because we should check all children first.
            this._currentNode = node.firstChild;
            result = 1;
        } else if (node !== this._endNode && node.nextSibling) {
            this._currentNode = node.nextSibling;
        } else {
            while (node !== this._endNode && node && !node.nextSibling) {
                node = node.parentNode!;
                result--;
            }

            if (!node || node === this._endNode) {
                this._currentNode = null;
            } else {
                this._currentNode = node.nextSibling;
            }
        }

        return result;
    }
}
