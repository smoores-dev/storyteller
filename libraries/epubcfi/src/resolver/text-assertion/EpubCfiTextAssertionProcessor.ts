import type {Node, Text} from '../../dom.js';
import {DomTreeWalker} from '../../common/DomTreeWalker.js';
import {DomUtils} from '../../common/DomUtils.js';
import {ReversedTopDownDomTreeWalker} from '../../common/ReversedTopDownDomTreeWalker.js';
import {IEpubCfiTextNodeOffsetMapping} from './IEpubCfiTextNodeOffsetMapping.js';
import {EpubCfiResolvedPath} from '../EpubCfiResolvedPath.js';
import {EpubCfiResolverErrorType} from '../EpubCfiResolverErrorType.js';
import {IEpubCfiResolverOptions} from '../IEpubCfiResolverOptions.js';

/**
 * Processes EPUB CFI text assertions using a chunked bidirectional search algorithm.
 *
 * The EPUB CFI specification allows locations to be qualified with text assertions (e.g., `[pre,post]`).
 * This processor verifies these assertions and, if the underlying document has changed or the offset
 * is slightly inaccurate, attempts to find the best alternative matching location within a specified search radius.
 *
 * **How the algorithm works:**
 * 1. **Text Normalization:** It normalizes both the assertion parameters and the text content from DOM nodes
 *    by collapsing adjacent whitespaces, following the EPUB CFI specification.
 * 2. **Chunked Expansion:** Instead of serializing the entire document text, it iteratively expands a search window.
 *    It uses DOM tree walkers to fetch chunks of text nodes both forwards and backwards from the starting location.
 * 3. **Bidirectional Offset Mapping:** As text chunks are collected and normalized, it builds a mapping
 *    that tracks the original sizes and locations of removed whitespace characters.
 * 4. **Closest Match Heuristic:** It calculates an "ideal" match index relative to the starting location.
 *    It then searches the accumulated text window for the combined `pre` and `post` string, selecting the
 *    occurrence that has the minimum absolute distance to the ideal index.
 * 5. **Path Correction:** Once the optimal match is found in the normalized string, it uses the offset
 *    mapping to translate the match index back into a specific DOM Text node and local character offset.
 */
export class EpubCfiTextAssertionProcessor {
    private _options: IEpubCfiResolverOptions;

    constructor(options: IEpubCfiResolverOptions) {
        this._options = options;
    }

    /**
     * Evaluates a text assertion and corrects the given path if necessary.
     *
     * @param path The resolved path object containing the current container node and offset.
     *             This object is mutated: its container and offset are updated on success,
     *             or error flags are set on failure.
     * @param pre The text expected immediately preceding the offset location.
     * @param post The text expected immediately following the offset location.
     */
    processTextAssertion(path: EpubCfiResolvedPath, pre: string, post: string): void {
        const maxDistance = this._options.textAssertionSearchDistance ?? 10000;
        const normalizedPre = pre.replaceAll(/\s+/g, ' ');
        const normalizedPreLength = normalizedPre.length;
        const targetString = (normalizedPre + post).replaceAll(/\s+/g, ' ');
        if (targetString.length === 0) {
            return;
        }

        const container = path.container;
        if (!container) {
            return;
        }

        const initialNode = DomUtils.isTextNode(container) ? (container as Text) : null;

        const mappingsBefore: IEpubCfiTextNodeOffsetMapping[][] = [];
        const mappingsAfter: IEpubCfiTextNodeOffsetMapping[][] = [];
        let centerMappings: IEpubCfiTextNodeOffsetMapping[] = [];

        let backwardIsWhitespace = false;
        let forwardIsWhitespace = false;
        let targetOffsetInitialText = 0;
        let initialText = '';
        let forwardDistance = 0;
        let backwardDistance = 0;

        if (initialNode) {

            const skip = Math.max(0, path.offset - maxDistance);
            const res = this.normalizeForward([initialNode], false, path.offset + maxDistance - skip, skip);
            initialText = res.text;
            centerMappings = res.nodeMappings;
            forwardIsWhitespace = res.endWhitespace;
            forwardDistance = initialNode.data.length - path.offset;
            backwardDistance = path.offset - skip;

            targetOffsetInitialText = this.calculateGlobalOffset(centerMappings[0], path.offset || 0);

            // The backwardIsWhitespace state should match the start of the node.
            // If the node started with whitespace, the backward side should act as if it ends with whitespace.
            if (initialNode.data.length > 0 && /\s/.test(initialNode.data[0])) {
                backwardIsWhitespace = true;
            }

            const idealMatchIndex = targetOffsetInitialText - normalizedPre.length;
            const best = this.findBestMatch(initialText, targetString, 0, idealMatchIndex);
            if (best !== null) {
                if (idealMatchIndex === best.matchIndex && !this.isOutOfBounds(path.container, path.offset)) {
                    path.textAssertionFailed = false;
                    return;
                }

                const splitPointInitial = best.matchIndex + normalizedPre.length;
                this.updatePathWithTextAssertionResult({
                    mappings: centerMappings,
                    normalizedTargetOffset: splitPointInitial,
                    path: path,
                    pre: pre,
                    post: post,
                });
                return;
            }
        }

        const forwardWalker = new DomTreeWalker(container, (n) => DomUtils.isTextNode(n as Node));
        forwardWalker.setEndNode(path.getDocument());
        if (initialNode) {
            forwardWalker.next(true);
        }

        const backwardWalker = new ReversedTopDownDomTreeWalker(container, (n) => DomUtils.isTextNode(n as Node));
        backwardWalker.setEndNode(path.getDocument());

        let reachedForwardEnd = false;
        let reachedBackwardEnd = false;

        let totalBeforeLength = targetOffsetInitialText;
        let totalAfterLength = initialText.length - targetOffsetInitialText;

        const windowOverlapSize = targetString.length - 1;
        let windowOverlapBackward = initialText.substring(0, windowOverlapSize);
        let windowOverlapForward = initialText.substring(Math.max(0, initialText.length - windowOverlapSize));

        while ((forwardDistance < maxDistance || backwardDistance < maxDistance) && (!reachedForwardEnd || !reachedBackwardEnd)) {

            // Collect text nodes forward and backward /////////////////////////////////////////////////////////////////
            let forwardNodes: Text[] = [];
            let forwardLength = 0;
            while (forwardLength < 200 && !reachedForwardEnd && forwardLength + forwardDistance < maxDistance) {
                const node = forwardWalker.next(true);
                if (node) {
                    forwardNodes.push(node as Text);
                    forwardLength += (node as Text).data.length;
                } else {
                    reachedForwardEnd = true;
                }
            }
            forwardDistance += forwardLength;

            let backwardNodes: Text[] = [];
            let backwardLength = 0;
            while (backwardLength < 200 && !reachedBackwardEnd && backwardLength + backwardDistance < maxDistance) {
                const node = backwardWalker.next(true);
                if (node) {
                    backwardNodes.push(node as Text);
                    backwardLength += (node as Text).data.length;
                } else {
                    reachedBackwardEnd = true;
                }
            }
            backwardDistance += backwardLength;

            // Prevents an infinite loop deadlock. The outer loop condition might remain true if one direction 
            // hit the maxDistance but not the document end, while the other hit the document end but not 
            // the maxDistance. If neither direction can collect any new text nodes, we are stuck and must break.
            if (forwardLength === 0 && backwardLength === 0) {
                break;
            }

            // Normalize the newly collected text segments /////////////////////////////////////////////////////////////
            let newAfterText = '';
            if (forwardNodes.length > 0) {
                const remainingDistance = maxDistance - (forwardDistance - forwardLength);
                const res = this.normalizeForward(forwardNodes, forwardIsWhitespace, remainingDistance);
                newAfterText = res.text;
                mappingsAfter.push(res.nodeMappings);

                forwardIsWhitespace = res.endWhitespace;
            }

            let newBeforeText = '';
            if (backwardNodes.length > 0) {
                const remainingDistance = maxDistance - (backwardDistance - backwardLength);
                const res = this.normalizeBackward(backwardNodes, backwardIsWhitespace, remainingDistance);
                newBeforeText = res.text;
                // Prepend mappings
                mappingsBefore.push(res.nodeMappings);
                backwardIsWhitespace = res.endWhitespace;
            }

            // Check if we have any match in the newly fetched text ////////////////////////////////////////////////////
            const currentFullTextLength = totalBeforeLength + totalAfterLength;
            const newTotalBeforeLength = totalBeforeLength + newBeforeText.length;
            const idealMatchIndex = newTotalBeforeLength - normalizedPreLength;

            let bestMatchIndex = -1;
            let minDist = Infinity;

            // When the accumulated text is shorter than the target string length - 1, we must combine the newly
            // fetched text from both the left and right sides with the previously accumulated text (`windowLeft`).
            // This is necessary to catch matches that span across the left expansion, the previously collected text,
            // and the right expansion simultaneously. Once accumulated text is long enough, we can safely search
            // left and right sides independently in the else block.
            if (currentFullTextLength < windowOverlapSize) {
                const combined = newBeforeText + windowOverlapBackward + newAfterText;
                const best = this.findBestMatch(combined, targetString, 0, idealMatchIndex);
                if (best) {
                    bestMatchIndex = best.matchIndex;
                    minDist = best.dist;
                }
            } else {
                if (newBeforeText.length > 0) {
                    const searchStr = newBeforeText + windowOverlapBackward;
                    const best = this.findBestMatch(searchStr, targetString, 0, idealMatchIndex);
                    if (best && best.dist < minDist) {
                        minDist = best.dist;
                        bestMatchIndex = best.matchIndex;
                    }
                }

                if (newAfterText.length > 0) {
                    const searchStr = windowOverlapForward + newAfterText;
                    const offsetInFullText = currentFullTextLength + newBeforeText.length + newAfterText.length - searchStr.length;
                    const best = this.findBestMatch(searchStr, targetString, offsetInFullText, idealMatchIndex);
                    if (best && best.dist <= minDist) {
                        minDist = best.dist;
                        bestMatchIndex = best.matchIndex;
                    }
                }
            }

            if (bestMatchIndex !== -1) {
                if (idealMatchIndex === bestMatchIndex && !this.isOutOfBounds(path.container, path.offset)) {
                    path.textAssertionFailed = false;
                    return;
                }

                const normalizedTargetOffset = bestMatchIndex + normalizedPreLength;
                const reversedBefore = [...mappingsBefore].reverse().flat();

                const allMappings = [
                    ...reversedBefore,
                    ...centerMappings,
                    ...mappingsAfter.flat()
                ];
                this.updatePathWithTextAssertionResult({
                    mappings: allMappings,
                    normalizedTargetOffset: normalizedTargetOffset,
                    path: path,
                    pre: pre,
                    post: post,
                });
                return;
            }

            // Move the backward and forward search windows ////////////////////////////////////////////////////////////
            totalBeforeLength += newBeforeText.length;
            totalAfterLength += newAfterText.length;

            const res = this.calculateWindowOverlaps(windowOverlapBackward, windowOverlapSize, newBeforeText, newAfterText, windowOverlapForward);
            windowOverlapBackward = res.windowOverlapBackward;
            windowOverlapForward = res.windowOverlapForward;

        }

        if (this._options.customTextAssertionMatcher) {
            const reversedBefore = [...mappingsBefore].reverse().flat();
            const allMappings = [
                ...reversedBefore,
                ...centerMappings,
                ...mappingsAfter.flat()
            ];
            const normalizedText = allMappings.map(m => m.normalizedText).join('');
            const beforeLength = reversedBefore.reduce((acc, m) => acc + m.normalizedText.length, 0);
            const idealMatchIndex = beforeLength + targetOffsetInitialText;

            const customMatchIndex = this._options.customTextAssertionMatcher({
                idealMatchIndex,
                normalizedText,
                resolvedPath: path,
                pre,
                post
            });

            if (customMatchIndex === -2) {
                path.textAssertionFailed = false;
                path.repairedWithTextAssertion = true;
                return;
            } else if (customMatchIndex !== -1) {
                this.updatePathWithTextAssertionResult({
                    mappings: allMappings,
                    normalizedTargetOffset: customMatchIndex,
                    path: path,
                    pre: pre,
                    post: post,
                });
                return;
            }
        }

        path.textAssertionFailed = true;
        path.getTerminalLocalPath().createResolverError(EpubCfiResolverErrorType.TEXT_ASSERTION_FAILED, path.container, {
            pre,
            post,
        });
    }

    /**
     * Calculates the new overlap strings for the backward and forward search windows after new text has been fetched.
     *
     * @param windowOverlapBackward The current backward overlap string.
     * @param windowOverlapSize The required size for the overlap window.
     * @param newBeforeText The newly fetched text in the backward direction.
     * @param newAfterText The newly fetched text in the forward direction.
     * @param windowOverlapForward The current forward overlap string.
     * @returns An object containing the updated `windowOverlapBackward` and `windowOverlapForward` strings.
     */
    private calculateWindowOverlaps(
        windowOverlapBackward: string,
        windowOverlapSize: number,
        newBeforeText: string,
        newAfterText: string,
        windowOverlapForward: string,
    ) {
        if (windowOverlapBackward.length < windowOverlapSize) {
            windowOverlapBackward = newBeforeText + windowOverlapBackward + newAfterText;
            if (windowOverlapBackward.length > windowOverlapSize) {
                windowOverlapBackward = windowOverlapBackward.substring(0, windowOverlapSize);
            }
        } else if (newBeforeText.length < windowOverlapSize) {
            windowOverlapBackward = (newBeforeText + windowOverlapBackward).substring(0, windowOverlapSize);
        } else {
            windowOverlapBackward = newBeforeText.substring(0, windowOverlapSize);
        }

        if (windowOverlapForward.length < windowOverlapSize) {
            windowOverlapForward = newBeforeText + windowOverlapForward + newAfterText;
            if (windowOverlapForward.length > windowOverlapSize) {
                windowOverlapForward = windowOverlapForward.substring(windowOverlapForward.length - windowOverlapSize);
            }
        } else if (newAfterText.length < windowOverlapSize) {
            const rightTemp = windowOverlapForward + newAfterText;
            windowOverlapForward = rightTemp.substring(Math.max(0, rightTemp.length - windowOverlapSize));
        } else {
            windowOverlapForward = newAfterText.substring(newAfterText.length - windowOverlapSize);
        }
        return {windowOverlapBackward, windowOverlapForward};
    }

    private isOutOfBounds(container: Node, offset: number): boolean {
        if (!DomUtils.isTextNode(container)) {
            return true;
        }
        const textNode = container as Text;
        return offset < 0 || offset > textNode.data.length;
    }

    /**
     * Updates the resolved path with the results of a successful text assertion match.
     *
     * @param options An object containing the update parameters.
     * @param options.mappings The accumulated offset mappings for the text nodes.
     * @param options.normalizedTargetOffset The character offset within the normalized text string where the match occurred.
     * @param options.path The resolved path object to be updated.
     * @param options.pre The pre-assertion text used for error reporting if the mapping fails.
     * @param options.post The post-assertion text used for error reporting if the mapping fails.
     */
    private updatePathWithTextAssertionResult({mappings, normalizedTargetOffset, path, pre, post}: {
            mappings: IEpubCfiTextNodeOffsetMapping[],
            normalizedTargetOffset: number,
            path: EpubCfiResolvedPath,
            pre: string,
            post: string
        },
    ) {
        const map = this.getNodeAndOffsetFromNormalizedOffset(mappings, normalizedTargetOffset);
        if (map) {
            if (path.container !== map.node || path.offset !== map.offset) {
                path.repairedWithTextAssertion = true;
            }
            path.container = map.node;
            path.offset = map.offset;
            path.textAssertionFailed = false;
        } else {
            path.textAssertionFailed = true;
            path.getTerminalLocalPath().createResolverError(EpubCfiResolverErrorType.TEXT_LOCATION_MAPPING_FAILED, path.container, {
                pre,
                post,
            });
        }
    }

    /**
     * Normalizes a sequence of text nodes in the forward direction.
     *
     * It collapses adjacent whitespace characters into a single space, removing leading
     * whitespaces if `startWhitespace` is true to prevent double spaces across chunk boundaries.
     *
     * @param nodes An array of DOM Text nodes to normalize, in document order.
     * @param startWhitespace Indicates whether the preceding text chunk ended with a whitespace.
     * @param maxLength Maximum number of characters to process from the given nodes.
     * @param startIndex Number of characters to skip at the start of the first node.
     * @returns An object containing the normalized text, the offset mappings for each node,
     *          and a boolean indicating if the normalized text ends with a whitespace.
     */
    private normalizeForward(nodes: Text[], startWhitespace: boolean, maxLength: number, startIndex: number = 0): {
        text: string,
        nodeMappings: IEpubCfiTextNodeOffsetMapping[],
        endWhitespace: boolean
    } {
        let text = '';
        let isWhitespace = startWhitespace;
        const nodeMappings: IEpubCfiTextNodeOffsetMapping[] = [];
        const regex = /\s+/g;

        let processedLength = 0;

        for (let i = 0; i < nodes.length; i++) {
            const textNode = nodes[i];
            let data = textNode.data;
            const currentSkip = i === 0 ? startIndex : 0;
            const remaining = maxLength - processedLength;
            if (remaining <= 0) {
                break;
            }
            if (data.length > remaining + currentSkip) {
                data = data.substring(0, remaining + currentSkip);
            }
            if (currentSkip > 0) {
                if (data.length > currentSkip) {
                    data = data.substring(currentSkip);
                } else {
                    data = '';
                }
            }
            processedLength += data.length;
            const removedCharacters: number[] = [];
            if (currentSkip > 0) {
                removedCharacters.push(0, currentSkip);
            }
            let match;
            let lastIndex = 0;
            let nodeText = '';
            regex.lastIndex = 0;

            while ((match = regex.exec(data)) !== null) {
                const before = data.substring(lastIndex, match.index);
                if (before.length > 0) {
                    nodeText += before;
                    isWhitespace = false;
                }
                const wsLength = match[0].length;
                if (isWhitespace) {
                    removedCharacters.push(match.index + currentSkip, wsLength);
                } else {
                    nodeText += ' ';
                    isWhitespace = true;
                    if (wsLength > 1) {
                        removedCharacters.push(match.index + 1 + currentSkip, wsLength - 1);
                    }
                }
                lastIndex = regex.lastIndex;
            }
            if (lastIndex < data.length) {
                nodeText += data.substring(lastIndex);
                isWhitespace = false;
            }
            text += nodeText;
            nodeMappings.push({node: textNode, normalizedText: nodeText, removedCharacters});
        }
        return {text, nodeMappings, endWhitespace: isWhitespace};
    }

    /**
     * Normalizes a sequence of text nodes in the backward direction.
     *
     * This processes nodes fetched in reverse document order. It collapses adjacent whitespaces
     * and handles spaces across chunk boundaries correctly by carrying over the whitespace state.
     * The resulting text and mappings are returned in standard document order (left-to-right).
     *
     * @param nodes An array of DOM Text nodes to normalize, in reverse document order.
     * @param startWhitespace Indicates whether the succeeding text chunk (already processed)
     *                        started with a whitespace.
     * @param maxLength Maximum number of characters to process from the given nodes.
     * @returns An object containing the normalized text, the offset mappings for each node,
     *          and a boolean indicating if the combined text has a leading whitespace
     *          (representing the boundary state for the next backward chunk).
     */
    private normalizeBackward(nodes: Text[], startWhitespace: boolean, maxLength: number): {
        text: string,
        nodeMappings: IEpubCfiTextNodeOffsetMapping[],
        endWhitespace: boolean
    } {
        let text = '';
        let isWhitespace = startWhitespace;
        const nodeMappings: IEpubCfiTextNodeOffsetMapping[] = [];
        const regex = /\s+/g;

        let processedLength = 0;

        for (const textNode of nodes) {
            let data = textNode.data;
            let offsetInNode = 0;
            const remaining = maxLength - processedLength;
            if (remaining <= 0) {
                break;
            }
            if (data.length > remaining) {
                offsetInNode = data.length - remaining;
                data = data.substring(offsetInNode);
            }
            processedLength += data.length;

            const removedCharacters: number[] = [];
            let matches = [];
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(data)) !== null) {
                matches.push({index: match.index, length: match[0].length});
            }

            let nodeText = '';
            let currentDataEnd = data.length;

            for (let i = matches.length - 1; i >= 0; i--) {
                const m = matches[i];
                const after = data.substring(m.index + m.length, currentDataEnd);
                if (after.length > 0) {
                    nodeText = after + nodeText;
                    isWhitespace = false;
                }
                if (isWhitespace) {
                    removedCharacters.push(m.index, m.length);
                } else {
                    nodeText = ' ' + nodeText;
                    isWhitespace = true;
                    if (m.length > 1) {
                        removedCharacters.push(m.index + 1, m.length - 1);
                    }
                }
                currentDataEnd = m.index;
            }

            const before = data.substring(0, currentDataEnd);
            if (before.length > 0) {
                nodeText = before + nodeText;
                isWhitespace = false;
            }

            text = nodeText + text;
            const reversedPairs: number[] = [];
            if (offsetInNode > 0) {
                reversedPairs.push(0, offsetInNode);
            }
            for (let i = removedCharacters.length - 2; i >= 0; i -= 2) {
                reversedPairs.push(removedCharacters[i] + offsetInNode, removedCharacters[i + 1]);
            }
            nodeMappings.push({node: textNode, normalizedText: nodeText, removedCharacters: reversedPairs});
        }
        nodeMappings.reverse();
        return {text, nodeMappings, endWhitespace: isWhitespace};
    }

    /**
     * Calculates the offset in the normalized text corresponding to a given offset within the original text node.
     *
     * @param targetMapping The offset mapping information for a specific text node.
     * @param targetOffsetInNode The character offset within the original, un-normalized text node.
     * @returns The equivalent character offset within the normalized text representation of this node.
     */
    private calculateGlobalOffset(targetMapping: IEpubCfiTextNodeOffsetMapping, targetOffsetInNode: number): number {
        let localNormalized: number | undefined;
        let numRemovedCharacters = 0;

        for (let j = 0; j < targetMapping.removedCharacters.length; j += 2) {
            const removedStart = targetMapping.removedCharacters[j];
            const removedLength = targetMapping.removedCharacters[j + 1];

            if (targetOffsetInNode < removedStart) {
                localNormalized = targetOffsetInNode - numRemovedCharacters;
                break;
            } else if (targetOffsetInNode >= removedStart && targetOffsetInNode < removedStart + removedLength) {
                localNormalized = removedStart - numRemovedCharacters;
                break;
            } else {
                numRemovedCharacters += removedLength;
            }
        }

        if (localNormalized === undefined) {
            localNormalized = targetOffsetInNode - numRemovedCharacters;
            if (localNormalized > targetMapping.normalizedText.length) {
                localNormalized = targetMapping.normalizedText.length;
            }
        }

        return localNormalized;
    }

    /**
     * Translates a character offset from a combined, normalized string back into a specific DOM Text node and an offset
     * within that original node.
     *
     * @param nodeMappings An array of text node offset mappings representing the accumulated text chunks.
     * @param targetOffset The character offset within the combined, normalized string.
     * @returns An object containing the original DOM Text node and the original character offset within it,
     *          or null if the offset falls outside the mapped bounds.
     */
    private getNodeAndOffsetFromNormalizedOffset(nodeMappings: IEpubCfiTextNodeOffsetMapping[], targetOffset: number): {
        node: Text,
        offset: number
    } | null {
        let globalOffset = 0;

        for (let i = 0; i < nodeMappings.length; i++) {
            const map = nodeMappings[i];

            if (targetOffset >= globalOffset && targetOffset < globalOffset + map.normalizedText.length) {
                let currentOriginalOffset = targetOffset - globalOffset;

                for (let j = 0; j < map.removedCharacters.length; j += 2) {
                    const removedStart = map.removedCharacters[j];
                    const removedCount = map.removedCharacters[j + 1];

                    if (removedStart <= currentOriginalOffset) {
                        currentOriginalOffset += removedCount;
                    } else {
                        break;
                    }
                }

                return {node: map.node, offset: currentOriginalOffset};
            }

            globalOffset += map.normalizedText.length;
        }

        if (targetOffset === globalOffset && nodeMappings.length > 0) {
            const lastMap = nodeMappings[nodeMappings.length - 1];
            return {node: lastMap.node, offset: lastMap.node.data.length};
        }

        return null;
    }

    /**
     * Finds the closest match for a target string within a search string relative to an ideal position.
     *
     * @param searchStr The text in which to search for the target string.
     * @param targetString The target string to search for.
     * @param offsetInFullText The global offset of `searchStr` within the complete accumulated text.
     * @param idealMatchIndex The target offset we ideally want the string to start at.
     * @returns An object with the global `matchIndex` and its distance `dist` to the ideal index, or null if not found.
     */
    private findBestMatch(searchStr: string, targetString: string, offsetInFullText: number, idealMatchIndex: number): {
        matchIndex: number,
        dist: number
    } | null {
        let bestMatchIndex = -1;
        let minDist = Infinity;
        let idx = searchStr.indexOf(targetString);
        while (idx !== -1) {
            const fullIdx = offsetInFullText + idx;
            const dist = Math.abs(fullIdx - idealMatchIndex);
            if (dist <= minDist) {
                minDist = dist;
                bestMatchIndex = fullIdx;
            }
            idx = searchStr.indexOf(targetString, idx + 1);
        }
        if (bestMatchIndex !== -1) {
            return {matchIndex: bestMatchIndex, dist: minDist};
        }
        return null;
    }
}
