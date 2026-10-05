import type {Element, Node} from '../dom.js';
import {EpubCfiError} from '../EpubCfiError.js';
import {EpubCfiErrorType} from '../EpubCfiErrorType.js';
import {EpubCfiUtils} from '../EpubCfiUtils.js';
import {IEpubCfiPathNode} from '../model/IEpubCfiPathNode.js';
import {IEpubCfiRootNode} from '../model/IEpubCfiRootNode.js';
import {EpubCfiStringifier} from '../stringifier/EpubCfiStringifier.js';
import {EpubCfiBuilderHelper} from './EpubCfiBuilderHelper.js';
import {IEpubCfiBuilderTextAssertionOptions} from './IEpubCfiBuilderTextAssertionOptions.js';
import {copy} from '../common/Utils.js';
import {ArrayUtils} from '../common/ArrayUtils.js';
import {DomUtils} from '../common/DomUtils.js';
import {EpubCfiIntendedTargetType} from '../resolver/EpubCfiIntendedTargetType.js';
import {EpubCfiResolvedLocalPath} from '../resolver/EpubCfiResolvedLocalPath.js';
import {EpubCfiResolvedPath} from '../resolver/EpubCfiResolvedPath.js';
import {EpubCfiResolvedTarget} from '../resolver/EpubCfiResolvedTarget.js';
import {EpubCfiVirtualTarget} from '../resolver/EpubCfiVirtualTarget.js';

/**
 * Used for programmatically building EPUB CFI model objects from XML-based documents.
 */
export class EpubCfiBuilder {

    private _rootNode: IEpubCfiRootNode;
    private _textAssertionOptions?: IEpubCfiBuilderTextAssertionOptions;

    /**
     * Creates a new EpubCfiBuilder instance.
     *
     * @param rootNode - An existing IEpubCfiRootNode to use. If omitted, a new empty root node is created.
     */
    constructor(rootNode?: IEpubCfiRootNode) {
        if (rootNode) {
            this._rootNode = rootNode;
        } else {
            this._rootNode = EpubCfiUtils.createEmptyRootNode();
        }
    }

    /**
     * Collapses a range root node to its end position, returning a non-range (single-position) root node.
     *
     * The returned root node is a deep copy; the input is not modified. If the input is not a range (it has
     * no range end path), a copy of it is returned unchanged.
     */
    static collapseToEnd(rootNode: IEpubCfiRootNode): IEpubCfiRootNode {
        const builder = new EpubCfiBuilder(EpubCfiUtils.copyRootNode(rootNode));
        if (builder._rootNode.rangeEndPath) {
            builder.collapse(builder._rootNode.rangeEndPath);
        }

        return builder.getEpubCfiRootNode();
    }

    /**
     * Collapses a range root node to its start position, returning a non-range (single-position) root node.
     *
     * The returned root node is a deep copy; the input is not modified. If the input is not a range (it has
     * no range start path), a copy of it is returned unchanged.
     */
    static collapseToStart(rootNode: IEpubCfiRootNode): IEpubCfiRootNode {
        const builder = new EpubCfiBuilder(EpubCfiUtils.copyRootNode(rootNode));
        if (builder._rootNode.rangeStartPath) {
            builder.collapse(builder._rootNode.rangeStartPath);
        }

        return builder.getEpubCfiRootNode();
    }

    /**
     * Creates a new range AST from two position AST root nodes.
     *
     * The longest shared leading path of the two positions becomes the range's parent path; the
     * divergent tails become the range start and end paths. If the two positions are identical, a
     * collapsed (non-range) root node is returned. Either input may itself be a range, in which case its
     * collapsed start (for `startRootNode`) and end (for `endRootNode`) are used.
     *
     * The returned root node is a deep copy; the inputs are not modified.
     *
     * Returns `null` if either input has no resolvable path.
     */
    static createRange(startRootNode: IEpubCfiRootNode, endRootNode: IEpubCfiRootNode): IEpubCfiRootNode | null {
        let startPath = startRootNode.parentPath;
        if (startRootNode.rangeStartPath) {
            startPath = EpubCfiBuilder.collapseToStart(startRootNode).parentPath;
        }

        let endPath = endRootNode.parentPath;
        if (endRootNode.rangeEndPath) {
            endPath = EpubCfiBuilder.collapseToEnd(endRootNode).parentPath;
        }

        if (!endPath || !startPath) {
            return null;
        }

        const rangeRootNode = EpubCfiUtils.createEmptyRootNode();
        const rangeParentPath = EpubCfiUtils.createEmptyPathNode();
        const rangeStartPath = EpubCfiUtils.createEmptyPathNode();
        const rangeEndPath = EpubCfiUtils.createEmptyPathNode();

        // Iterate over local paths, find first local path where steps differ
        const minLocalPathLength = Math.min(startPath.localPaths.length, endPath.localPaths.length);
        let diffFound = false;
        let pathIndex = 0;
        while (!diffFound && pathIndex < minLocalPathLength) {
            const localPathStart = startPath.localPaths[pathIndex];
            const localPathEnd = endPath.localPaths[pathIndex];

            if (localPathStart.indirection !== localPathEnd.indirection) {
                diffFound = true;
            } else {

                const stepsStart = localPathStart.steps;
                const stepsEnd = localPathEnd.steps;
                const minStepLength = Math.min(stepsStart.length, stepsEnd.length);

                let stepIndex = 0;
                while (!diffFound && stepIndex < minStepLength) {
                    if (EpubCfiUtils.areStepsEqual(stepsStart[stepIndex], stepsEnd[stepIndex])) {
                        stepIndex++;
                    } else {
                        diffFound = true;
                    }
                }

                // stepIndex now points to the first step index that differs.
                if (stepsStart.length !== stepsEnd.length) {
                    diffFound = true;
                }

                if (diffFound) {
                    if (stepIndex > 0) {
                        // Local paths have some steps in common
                        const rangeParentLocalPath = EpubCfiUtils.createEmptyLocalPathNode();
                        rangeParentLocalPath.indirection = localPathStart.indirection;
                        for (let i = 0; i < stepIndex; i++) {
                            rangeParentLocalPath.steps.push(EpubCfiUtils.copyStepNode(stepsStart[i]));
                        }
                        rangeParentPath.localPaths.push(rangeParentLocalPath);

                        // Now handle rangeStart and rangeEnd. These can never have indirection when splitting.
                        if (stepIndex < stepsStart.length) {
                            const rangeStartLocalPath = EpubCfiUtils.createEmptyLocalPathNode();
                            for (let i = stepIndex; i < stepsStart.length; i++) {
                                rangeStartLocalPath.steps.push(EpubCfiUtils.copyStepNode(stepsStart[i]));
                            }
                            rangeStartPath.localPaths.push(rangeStartLocalPath);
                        }
                        if (stepIndex < stepsEnd.length) {
                            const rangeEndLocalPath = EpubCfiUtils.createEmptyLocalPathNode();
                            for (let i = stepIndex; i < stepsEnd.length; i++) {
                                rangeEndLocalPath.steps.push(EpubCfiUtils.copyStepNode(stepsEnd[i]));
                            }
                            rangeEndPath.localPaths.push(rangeEndLocalPath);
                        }

                        // As we now split the local path between parent and range components we need to increment pathIndex
                        pathIndex++;
                    }

                } else {
                    // local paths are exactly equal so we can copy it to rangeParent!
                    rangeParentPath.localPaths.push(EpubCfiUtils.copyLocalPathNode(localPathStart));
                    pathIndex++;
                }
            }
        }

        // Path index is now the first localPath index from where they completely differ and should go into their respective range component
        // We also have all common local paths already in rangeParentPath.
        if (startPath.localPaths.length !== endPath.localPaths.length) {
            diffFound = true;
        }

        if (diffFound) {
            for (let i = pathIndex; i < startPath.localPaths.length; i++) {
                rangeStartPath.localPaths.push(EpubCfiUtils.copyLocalPathNode(startPath.localPaths[i]));
            }
            for (let i = pathIndex; i < endPath.localPaths.length; i++) {
                rangeEndPath.localPaths.push(EpubCfiUtils.copyLocalPathNode(endPath.localPaths[i]));
            }
            if (startPath.offset) {
                rangeStartPath.offset = EpubCfiUtils.copyOffsetNode(startPath.offset);
            }
            if (endPath.offset) {
                rangeEndPath.offset = EpubCfiUtils.copyOffsetNode(endPath.offset);
            }
        } else {
            // If no diff is found we need to see if we should at least split up the offset node.
            const offsetStart = startPath.offset;
            const offsetEnd = endPath.offset;

            if ((offsetStart && !offsetEnd) || (!offsetStart && offsetEnd) || (offsetStart && offsetEnd && !EpubCfiUtils.areOffsetsEqual(offsetStart, offsetEnd))) {
                rangeStartPath.offset = offsetStart ? EpubCfiUtils.copyOffsetNode(offsetStart) : null;
                rangeEndPath.offset = offsetEnd ? EpubCfiUtils.copyOffsetNode(offsetEnd) : null;
                diffFound = true;
            } else {
                rangeParentPath.offset = offsetStart ? EpubCfiUtils.copyOffsetNode(offsetStart) : null;
            }
        }

        rangeRootNode.parentPath = rangeParentPath;
        if (diffFound) {
            rangeRootNode.rangeStartPath = rangeStartPath;
            rangeRootNode.rangeEndPath = rangeEndPath;
        }

        return rangeRootNode;
    }

    /**
     * Builds a new, corrected EPUB CFI from the DOM positions an {@link EpubCfiResolvedTarget} was
     * resolved to.
     *
     * Resolving may have "repaired" the original CFI using XML id assertions (wrong step values) or
     * text assertions (wrong character offsets). The repaired positions are recorded as live
     * `container`/`offset` pairs on each resolved local path. This method replays those positions
     * through the builder, which recomputes correct step values and offsets from the live DOM, so the
     * returned CFI resolves cleanly without needing the same repairs.
     *
     * Both single positions and ranges are supported. For ranges, the start and end positions are
     * rebuilt as full absolute paths and then split (see {@link createRange}) at their longest common
     * step prefix into a shared parent path plus divergent start/end paths. This handles ranges whose
     * endpoints live in different content documents (the split then lands at the spine level in the OPF
     * document).
     *
     * Returns `null` if the target has no `parentPath`, or if an indirection element could not be
     * resolved.
     *
     * Terminal element offsets — spatial (`@x:y`), temporal (`~t`) and element character offsets
     * (img `alt`) — are copied verbatim from the original AST, since they are DOM-independent values on
     * the resolved element. Side bias (`[;s=b]`), which lives on a step assertion, is not reproduced.
     *
     * @param resolvedTarget - A resolved target object received from `EpubCfiResolver.getResolvedTarget()`
     * @param options - If provided, fresh pre/post text assertions are generated for the corrected
     *                   positions. If omitted, a plain CFI without text assertions is produced.
     */
    static createFromResolvedTarget(
        resolvedTarget: EpubCfiResolvedTarget,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): EpubCfiBuilder | null {
        const parentPath = resolvedTarget.parentPath;
        if (!parentPath) {
            return null;
        }

        if (resolvedTarget.rangeStartPath && resolvedTarget.rangeEndPath) {
            const startLocalPaths = [...parentPath.localPaths, ...resolvedTarget.rangeStartPath.localPaths];
            const endLocalPaths = [...parentPath.localPaths, ...resolvedTarget.rangeEndPath.localPaths];

            const startBuilder = EpubCfiBuilder.createBuilderFromResolvedPath(startLocalPaths, resolvedTarget.rangeStartPath, options);
            const endBuilder = EpubCfiBuilder.createBuilderFromResolvedPath(endLocalPaths, resolvedTarget.rangeEndPath, options);
            if (!startBuilder || !endBuilder) {
                return null;
            }

            const rangeRootNode = EpubCfiBuilder.createRange(startBuilder.getEpubCfiRootNode(), endBuilder.getEpubCfiRootNode());
            if (!rangeRootNode) {
                return null;
            }
            return new EpubCfiBuilder(rangeRootNode);
        }

        return EpubCfiBuilder.createBuilderFromResolvedPath(parentPath.localPaths, parentPath, options);
    }

    /**
     * Replays the indirection chain of `localPaths` through a fresh builder, then appends the terminal
     * position taken from `terminalPath`.
     *
     * Each document boundary (indirection) is rebuilt by appending the indirection source element; local
     * paths that merely continue within the same document are skipped because their steps are subsumed by
     * the document-rooted steps built for the next indirection source or the terminal position.
     *
     * The terminal `container`/`offset` are read from `terminalPath` (the {@link EpubCfiResolvedPath}),
     * not from the last local path, because that is where the resolved character offset and any
     * text-assertion repair are recorded.
     *
     * Returns `null` if an indirection element could not be resolved.
     */
    private static createBuilderFromResolvedPath(
        localPaths: EpubCfiResolvedLocalPath[],
        terminalPath: EpubCfiResolvedPath,
        options?: IEpubCfiBuilderTextAssertionOptions,
    ): EpubCfiBuilder | null {
        const builder = new EpubCfiBuilder();
        if (options) {
            builder.setTextAssertionOptions(options);
        }

        for (let i = 0; i < localPaths.length - 1; i++) {
            if (EpubCfiBuilder.isIndirectionBoundary(localPaths[i], localPaths[i + 1])) {
                const indirectionElement = localPaths[i].getTargetElement();
                if (!indirectionElement) {
                    return null;
                }
                builder.appendLocalPathTo(indirectionElement);
            }
        }

        if (!EpubCfiBuilder.appendTerminalPositionFromResolvedPath(builder, terminalPath)) {
            return null;
        }

        // Spatial, temporal and element character (img `alt`) offsets are terminal offsets that apply to
        // the resolved element itself rather than to a text-node position. The resolver does not relocate
        // them (unlike text-node character offsets, which it may repair via text assertions), so copy them
        // verbatim from the original AST onto the rebuilt element terminal.
        if (terminalPath.intendedTargetType === EpubCfiIntendedTargetType.ELEMENT && terminalPath.ast.offset) {
            const rootNode = builder.getEpubCfiRootNode();
            if (rootNode.parentPath) {
                rootNode.parentPath.offset = EpubCfiUtils.copyOffsetNode(terminalPath.ast.offset);
            }
        }

        return builder;
    }

    /**
     * Appends the terminal position of a resolved path to the builder.
     *
     * Virtual targets (first/last child) are handled explicitly so the rebuilt CFI re-emits the virtual
     * step (`/0` or `/N+2`) instead of resolving to a real child node.
     */
    private static appendTerminalPositionFromResolvedPath(builder: EpubCfiBuilder, terminalPath: EpubCfiResolvedPath): boolean {
        if (terminalPath.virtualTarget !== null && DomUtils.isElement(terminalPath.container)) {
            builder.appendLocalPathTo(terminalPath.container);
            const parentPath = builder.getEpubCfiRootNode().parentPath;
            const lastLocalPath = parentPath ? ArrayUtils.last(parentPath.localPaths) : undefined;
            if (!lastLocalPath) {
                return false;
            }
            lastLocalPath.steps.push({
                assertion: null,
                stepValue: terminalPath.virtualTarget === EpubCfiVirtualTarget.FIRST_CHILD ?
                    0 :
                    /* FORK START */
                    terminalPath.container.children.length * 2 + 2,
                    /* FORK END */
            });
            return true;
        }

        builder.appendTerminalDomPosition(terminalPath.container, terminalPath.offset);
        return true;
    }

    /**
     * Whether the transition from `localPath` to `nextLocalPath` crosses a document boundary (indirection).
     */
    private static isIndirectionBoundary(localPath: EpubCfiResolvedLocalPath, nextLocalPath: EpubCfiResolvedLocalPath): boolean {
        if (nextLocalPath.ast && nextLocalPath.ast.indirection) {
            return true;
        }
        return nextLocalPath.documentUrl.href !== localPath.documentUrl.href;
    }

    /**
     * Creates a new IEpubCfiLocalPathNode with all steps necessary to select the specified element from its owner document.
     */
    appendLocalPathTo(element: Element): void {
        if (this._rootNode.rangeStartPath || this._rootNode.rangeEndPath) {
            throw new EpubCfiError(EpubCfiErrorType.RANGE_PATHS_ALREADY_SET);
        }

        let steps = EpubCfiBuilderHelper.buildStepsToElement(element);
        if (!this._rootNode.parentPath) {
            this._rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }

        let hasLocalPath = this._rootNode.parentPath.localPaths.length > 0;
        this._rootNode.parentPath.localPaths.push({
            steps: steps,
            indirection: hasLocalPath,
        });
    }

    /**
     * Appends a terminal local path to the specified container node and offset.
     * If the container node is an Element, the offset specifies the child node within that element.
     * If the container node is a Text node, the offset specified the character offset.
     */
    appendTerminalDomPosition(container: Node, offset: number): void {
        offset = Math.round(offset);
        if (this._rootNode.rangeStartPath || this._rootNode.rangeEndPath) {
            throw new EpubCfiError(EpubCfiErrorType.RANGE_PATHS_ALREADY_SET);
        }
        if (!this._rootNode.parentPath) {
            this._rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }

        EpubCfiBuilderHelper.appendTerminalLocalPath(container, offset, this._rootNode.parentPath, undefined, this._textAssertionOptions);
    }

    /* FORK START */
    // Removed appendTerminalDomRange(): it took a live DOM Range, which xmldom does
    // not provide. Use appendTerminalDomPosition() for a single position.
    /* FORK END */

    appendTerminalIndirection(): void {
        if (this._rootNode.rangeStartPath || this._rootNode.rangeEndPath) {
            throw new EpubCfiError(EpubCfiErrorType.RANGE_PATHS_ALREADY_SET);
        }
        if (!this._rootNode.parentPath) {
            this._rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }

        this._rootNode.parentPath.localPaths.push({
            indirection: true,
            steps: [
                {
                    assertion: null,
                    stepValue: 0,
                },
            ],
        });
    }

    /**
     * Creates a clone of this instance including all state.
     */
    clone(): EpubCfiBuilder {
        const builder = new EpubCfiBuilder(copy(this._rootNode));
        if (this._textAssertionOptions) {
            builder._textAssertionOptions = copy(this._textAssertionOptions);
        }

        return builder;
    }

    /**
     * Get the IEpubCfiRootNode containing all paths and steps appended with this builder.
     */
    getEpubCfiRootNode(): IEpubCfiRootNode {
        return this._rootNode;
    }

    /**
     * Get the options configured for this builder.
     */
    getTextAssertionOptions(): IEpubCfiBuilderTextAssertionOptions | undefined {
        return this._textAssertionOptions;
    }

    prependLocalPathTo(element: Element): void {
        let steps = EpubCfiBuilderHelper.buildStepsToElement(element);
        if (!this._rootNode.parentPath) {
            this._rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }
        let firstLocalPath = this._rootNode.parentPath.localPaths[0];
        if (firstLocalPath) {
            firstLocalPath.indirection = true;
        }
        this._rootNode.parentPath.localPaths.unshift({
            steps: steps,
            indirection: false,
        });
    }

    /**
     * Configures options for the builder.
     */
    setTextAssertionOptions(options: Partial<IEpubCfiBuilderTextAssertionOptions>): EpubCfiBuilder {
        this._textAssertionOptions = {
            ...this._textAssertionOptions,
            ...options
        };
        return this;
    }

    /**
     * Serializes the current state of the EPUB CFI model as a selector fragment string.
     */
    toString(): string {
        return EpubCfiStringifier.stringifyRootNode(this._rootNode);
    }

    private collapse(rangePath: IEpubCfiPathNode): void {
        this._rootNode.rangeStartPath = null;
        this._rootNode.rangeEndPath = null;

        if (!this._rootNode.parentPath) {
            this._rootNode.parentPath = EpubCfiUtils.createEmptyPathNode();
        }
        const parentPath = this._rootNode.parentPath;

        if (parentPath.localPaths) {
            // Need to merge paths!
            const firstRangeLocalPath = ArrayUtils.first(rangePath.localPaths);
            const lastParentLocalPath = ArrayUtils.last(parentPath.localPaths);
            if (firstRangeLocalPath) {
                if (lastParentLocalPath && !firstRangeLocalPath.indirection) {
                    // Local paths should be merged
                    lastParentLocalPath.steps.push(...firstRangeLocalPath.steps);
                    rangePath.localPaths.shift();
                }

                parentPath.localPaths.push(...rangePath.localPaths);
            }

        } else {
            // No parent local paths
            parentPath.localPaths = rangePath.localPaths;
        }

        parentPath.offset = rangePath.offset;
    }
}
