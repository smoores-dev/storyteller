import {DomTreeWalker} from '../common/DomTreeWalker.js';
import {DomUtils} from '../common/DomUtils.js';
import {ReversedTopDownDomTreeWalker} from '../common/ReversedTopDownDomTreeWalker.js';
import {EpubCfiError} from '../EpubCfiError.js';
import {EpubCfiErrorType} from '../EpubCfiErrorType.js';
import {EpubCfiUtils} from '../EpubCfiUtils.js';
import {IEpubCfiAssertionNode} from '../model/assertion/IEpubCfiAssertionNode.js';
import {IEpubCfiLocalPathNode} from '../model/IEpubCfiLocalPathNode.js';
import {IEpubCfiPathNode} from '../model/IEpubCfiPathNode.js';
import {IEpubCfiRootNode} from '../model/IEpubCfiRootNode.js';
import {IEpubCfiStepNode} from '../model/IEpubCfiStepNode.js';
import {EpubCfiOffsetType} from '../model/offset/EpubCfiOffsetType.js';
import {IEpubCfiCharacterOffsetNode} from '../model/offset/IEpubCfiCharacterOffsetNode.js';
import {IEpubCfiBuilderTextAssertionOptions} from './IEpubCfiBuilderTextAssertionOptions.js';

const DEFAULT_WORD_BOUNDARY_MAX_EXPANSION = 20;

/**
 * This is a helper class intended to be used internally by EpubCfiBuilder.
 */
export class EpubCfiBuilderHelper {

    static appendTerminalDomRange(
        range: Range,
        rootNode?: IEpubCfiRootNode,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): IEpubCfiRootNode {
        if (!rootNode) {
            rootNode = EpubCfiUtils.createEmptyRootNode();
        }

        if (range.collapsed) {
            if (!rootNode.parentPath) {
                rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
            }
            EpubCfiBuilderHelper.appendTerminalLocalPath(range.startContainer, range.startOffset, rootNode.parentPath, undefined, options);
            return rootNode;
        }

        if (!rootNode.parentPath) {
            rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }
        if (rootNode.rangeStartPath || rootNode.rangeEndPath) {
            throw new EpubCfiError(EpubCfiErrorType.RANGE_PATHS_ALREADY_SET);
        }
        rootNode.rangeStartPath = EpubCfiUtils.createEmptyPathNode();
        rootNode.rangeEndPath = EpubCfiUtils.createEmptyPathNode();

        EpubCfiBuilderHelper.appendTerminalLocalPath(range.startContainer, range.startOffset, rootNode.rangeStartPath, range.commonAncestorContainer, options);
        EpubCfiBuilderHelper.appendTerminalLocalPath(range.endContainer, range.endOffset, rootNode.rangeEndPath, range.commonAncestorContainer, options);

        let hasLocalPaths = rootNode.parentPath.localPaths.length > 0;
        if (DomUtils.isElement(range.commonAncestorContainer)) {
            rootNode.parentPath.localPaths.push(EpubCfiBuilderHelper.buildLocalPathToElement(range.commonAncestorContainer, hasLocalPaths));
        } else if (DomUtils.isElement(range.commonAncestorContainer.parentNode)) {
            let localPath = EpubCfiBuilderHelper.buildLocalPathToElement(range.commonAncestorContainer.parentNode, hasLocalPaths);
            localPath.steps.push(EpubCfiBuilderHelper.buildTextStep(range.commonAncestorContainer));
            rootNode.parentPath.localPaths.push(localPath);
        } else {
            throw new EpubCfiError(EpubCfiErrorType.CONTAINER_NOT_ATTACHED_TO_DOCUMENT);
        }

        return rootNode;
    }

    static appendTerminalLocalPath(
        container: Node,
        offset: number,
        pathNode?: IEpubCfiPathNode,
        stopNode?: Node,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): IEpubCfiPathNode {
        let steps: IEpubCfiStepNode[] | null = null;
        let offsetNode: IEpubCfiCharacterOffsetNode | null = null;
        if (DomUtils.isElement(container)) {
            let targetNode: Node | null = offset < container.childNodes.length ? container.childNodes[offset] : null;
            if (DomUtils.isElement(targetNode)) {
                steps = EpubCfiBuilderHelper.buildStepsToElement(targetNode, stopNode);
            } else if (!targetNode) {
                steps = EpubCfiBuilderHelper.buildStepsToElement(container, stopNode);
                // It's a virtual target!
                steps.push({
                    assertion: null,
                    stepValue: offset === 0 ? 0 : container.childElementCount * 2 + 2,
                });
            } else {
                steps = EpubCfiBuilderHelper.buildStepsToElement(container, stopNode);
                steps.push(EpubCfiBuilderHelper.buildTextStep(targetNode));
                offsetNode = EpubCfiBuilderHelper.buildCharacterOffsetToNode(targetNode, 0, options);
            }
        } else if (DomUtils.isElement(container.parentNode)) {
            if (container === stopNode) {
                steps = null;
            } else {
                steps = EpubCfiBuilderHelper.buildStepsToElement(container.parentNode, stopNode);
                steps.push(EpubCfiBuilderHelper.buildTextStep(container));
            }
            offsetNode = EpubCfiBuilderHelper.buildCharacterOffsetToNode(container, offset, options);
        } else {
            throw new EpubCfiError(EpubCfiErrorType.CONTAINER_NOT_ATTACHED_TO_DOCUMENT);
        }

        if (!pathNode) {
            pathNode = EpubCfiUtils.createEmptyPathNode();
        }

        if (steps) {

            let hasLocalPathNodes = pathNode.localPaths.length > 0;
            let localPath: IEpubCfiLocalPathNode = {
                indirection: hasLocalPathNodes,
                steps: steps,
            };
            pathNode.localPaths.push(localPath);
        }

        pathNode.offset = offsetNode;

        return pathNode;
    }

    static buildCharacterOffsetToNode(
        node: Node,
        offsetInsideNode: number = 0,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): IEpubCfiCharacterOffsetNode | null {
        if (DomUtils.isElement(node)) {
            return null;
        }
        let currentNode: Node | null = node.previousSibling;
        let offset = DomUtils.isTextNode(node) ? offsetInsideNode : 0;

        while (currentNode && !DomUtils.isElement(currentNode)) {
            if (DomUtils.isTextNode(currentNode)) {
                offset += currentNode.data.length;
            }
            currentNode = currentNode.previousSibling;
        }

        let assertionNode: IEpubCfiAssertionNode | null = null;
        let assertionValues = EpubCfiBuilderHelper.getTextContextAroundNode(node, offsetInsideNode, options);
        if (assertionValues) {
            assertionNode = {
                values: assertionValues,
                parameters: [],
            };
        }

        return {
            type: EpubCfiOffsetType.CHARACTER,
            assertion: assertionNode,
            characterOffset: offset,
        };
    }

    static buildLocalPathToElement(element: Element, indirection: boolean): IEpubCfiLocalPathNode {
        return {
            indirection: indirection,
            steps: EpubCfiBuilderHelper.buildStepsToElement(element),
        };
    }

    static buildStepsToElement(element: Element, rootNode?: Node): IEpubCfiStepNode[] {
        let elements: Element[] = [];
        let stepNodes: IEpubCfiStepNode[] = [];
        while (element.parentNode && DomUtils.isElement(element.parentNode) && element !== rootNode) {
            elements.push(element);
            element = element.parentNode;
        }

        for (let i = elements.length - 1; i >= 0; i--) {
            let element = elements[i];
            let xmlIdAssertion: IEpubCfiAssertionNode | null = null;
            if (element.id) {
                xmlIdAssertion = {
                    values: [element.id],
                    parameters: [],
                };
            }

            stepNodes.push({
                stepValue: (DomUtils.getElementIndex(element) + 1) * 2,
                assertion: xmlIdAssertion,
            });
        }
        return stepNodes;
    }

    static buildTextStep(node: Node): IEpubCfiStepNode {
        let previousSibling = node.previousSibling;
        while (previousSibling && !DomUtils.isElement(previousSibling)) {
            previousSibling = previousSibling.previousSibling;
        }

        let index: number;
        if (previousSibling) {
            index = DomUtils.getElementIndex(previousSibling) * 2 + 3;
        } else {
            index = 1;
        }
        return {
            stepValue: index,
            assertion: null,
        };
    }

    /**
     * Extracts pre and post string context around the node crossing inline boundaries.
     */
    static getTextContextAroundNode(
        node: Node,
        offsetInsideNode: number,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): [string, string] | null {
        if (!options) {
            return null;
        }
        const preLength = options.preLength || 0;
        const postLength = options.postLength || 0;

        if (preLength === 0 && postLength === 0) {
            return null;
        }

        const pre = EpubCfiBuilderHelper.gatherTextLeft(node, offsetInsideNode, preLength, options);
        let post = EpubCfiBuilderHelper.gatherTextRight(node, offsetInsideNode, postLength, options);

        if (pre.endsWith(' ') && post.startsWith(' ')) {
            post = post.replace(/^\s+/, '');
        }

        return [pre.replace(/^\s+/, ''), post.replace(/\s+$/, '')];
    }

    private static gatherTextLeft(
        startNode: Node,
        offsetInsideNode: number,
        targetLength: number,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): string {
        if (targetLength <= 0) {
            return '';
        }
        let result = '';
        let isFirst = true;

        const snap = options?.snapToWordBoundaries === true;
        const maxExpansion = options?.wordBoundaryMaxExpansion ?? DEFAULT_WORD_BOUNDARY_MAX_EXPANSION;
        const walker = new ReversedTopDownDomTreeWalker(startNode);
        walker.setEndNode(startNode.ownerDocument);

        while (walker._currentNode) {
            const current = walker._currentNode;
            if (DomUtils.isElement(current) && DomUtils.isMetadataElementWithContent(current)) {
                break;
            }

            if (DomUtils.isTextNode(current)) {
                let text = current.data;
                if (isFirst) {
                    text = text.substring(0, offsetInsideNode);
                    isFirst = false;
                }

                result = (text + result).replaceAll(/\s+/g, ' ');

                if (result.length >= targetLength) {
                    if (!snap) {
                        break;
                    } else {
                        const edgeChar = result.charAt(0);
                        if (/\s/.test(edgeChar)) {
                            break;
                        }
                        const precedingText = result.slice(0, result.length - targetLength);
                        if (/\s/.test(precedingText)) {
                            break;
                        }
                        if (precedingText.length >= maxExpansion) {
                            break;
                        }
                    }
                }
            }

            const canTraverseDeeper = (node: Node) => {
                return !(DomUtils.isElement(node) && DomUtils.isMetadataElementWithContent(node));
            };
            walker.advance(canTraverseDeeper);
        }

        if (result.length > targetLength) {
            if (!snap) {
                result = result.substring(result.length - targetLength);
            } else {
                const mandatoryPart = result.substring(result.length - targetLength);
                const optionalPart = result.substring(0, result.length - targetLength);

                let needsExpansion = true;
                if (mandatoryPart.length > 0 && /\s/.test(mandatoryPart.charAt(0))) {
                    needsExpansion = false;
                }
                if (optionalPart.length > 0 && /\s/.test(optionalPart.charAt(optionalPart.length - 1))) {
                    needsExpansion = false;
                }

                if (!needsExpansion) {
                    result = mandatoryPart;
                } else {
                    let cutIndex = optionalPart.length;
                    const minCutIndex = Math.max(0, optionalPart.length - maxExpansion);
                    for (let i = optionalPart.length - 1; i >= minCutIndex; i--) {
                        if (/\s/.test(optionalPart.charAt(i))) {
                            cutIndex = i + 1;
                            break;
                        }
                    }
                    if (cutIndex === optionalPart.length) {
                        if (optionalPart.length > maxExpansion) {
                            cutIndex = optionalPart.length - maxExpansion;
                        } else {
                            cutIndex = 0;
                        }
                    }
                    result = optionalPart.substring(cutIndex) + mandatoryPart;
                }
            }
        }

        return result;
    }

    private static gatherTextRight(
        startNode: Node,
        offsetInsideNode: number,
        targetLength: number,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): string {
        if (targetLength <= 0) {
            return '';
        }
        let result = '';
        let isFirst = true;

        const snap = options?.snapToWordBoundaries === true;
        const maxExpansion = options?.wordBoundaryMaxExpansion ?? DEFAULT_WORD_BOUNDARY_MAX_EXPANSION;
        const walker = new DomTreeWalker(startNode);
        walker.setEndNode(startNode.ownerDocument);

        while (walker._currentNode) {
            const current = walker._currentNode;
            if (DomUtils.isElement(current) && DomUtils.isMetadataElementWithContent(current)) {
                break;
            }

            if (DomUtils.isTextNode(current)) {
                let text = current.data;
                if (isFirst) {
                    text = text.substring(offsetInsideNode);
                    isFirst = false;
                }

                result = (result + text).replaceAll(/\s+/g, ' ');

                if (result.length >= targetLength) {
                    if (!snap) {
                        break;
                    } else {
                        const edgeChar = result.charAt(result.length - 1);
                        if (/\s/.test(edgeChar)) {
                            break;
                        }

                        const trailingText = result.slice(targetLength);
                        if (/\s/.test(trailingText)) {
                            break;
                        }
                        if (trailingText.length >= maxExpansion) {
                            break;
                        }
                    }
                }
            }
            walker.advance(true);
        }

        if (result.length > targetLength) {
            if (!snap) {
                result = result.substring(0, targetLength);
            } else {

                const mandatoryPart = result.substring(0, targetLength);
                const optionalPart = result.substring(targetLength);

                let needsExpansion = true;
                if (mandatoryPart.length > 0 && /\s/.test(mandatoryPart.charAt(mandatoryPart.length - 1))) {
                    needsExpansion = false;
                }
                if (optionalPart.length > 0 && /\s/.test(optionalPart.charAt(0))) {
                    needsExpansion = false;
                }

                if (!needsExpansion) {
                    result = mandatoryPart;
                } else {
                    let cutIndex = optionalPart.length;
                    const maxCutIndex = Math.min(optionalPart.length, maxExpansion);
                    for (let i = 0; i < maxCutIndex; i++) {
                        if (/\s/.test(optionalPart.charAt(i))) {
                            cutIndex = i;
                            break;
                        }
                    }
                    if (cutIndex === optionalPart.length && optionalPart.length > maxExpansion) {
                        cutIndex = maxExpansion;
                    }
                    result = mandatoryPart + optionalPart.substring(0, cutIndex);
                }

            }
        }

        return result;
    }

}
