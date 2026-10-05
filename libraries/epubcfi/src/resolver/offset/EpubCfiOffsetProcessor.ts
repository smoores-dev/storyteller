import type {Text} from '../../dom.js';
import {isNumber} from '../../common/Utils.js';
import {EpubCfiOffsetType} from '../../model/offset/EpubCfiOffsetType.js';
import {IEpubCfiCharacterOffsetNode} from '../../model/offset/IEpubCfiCharacterOffsetNode.js';
import {IEpubCfiSpatialOffsetNode} from '../../model/offset/IEpubCfiSpatialOffsetNode.js';
import {IEpubCfiTemporalOffsetNode} from '../../model/offset/IEpubCfiTemporalOffsetNode.js';
import {EpubCfiIntendedTargetType} from '../EpubCfiIntendedTargetType.js';
import {EpubCfiResolvedPath} from '../EpubCfiResolvedPath.js';
import {DomUtils} from '../../common/DomUtils.js';
import {IEpubCfiResolverOptions} from '../IEpubCfiResolverOptions.js';
import {EpubCfiTextAssertionProcessor} from '../text-assertion/EpubCfiTextAssertionProcessor.js';

export class EpubCfiOffsetProcessor {
    private _options: IEpubCfiResolverOptions;

    constructor(options: IEpubCfiResolverOptions) {
        this._options = options;
    }

    processOffset(path: EpubCfiResolvedPath): void {
        // We handle text offsets. We don't handle spatial or temporal offsets
        let offset = path.ast.offset;

        if (path.intendedTargetType === EpubCfiIntendedTargetType.ELEMENT && offset && path.stepsResolved) {
            switch (offset.type) {
                case EpubCfiOffsetType.TEMPORAL:
                    this.handleTemporalOffset(path, offset);
                    break;
                case EpubCfiOffsetType.SPATIAL:
                    this.handleSpatialOffset(path, offset);
                    break;
                case EpubCfiOffsetType.CHARACTER:
                    this.handleElementCharacterOffset(path, offset);
                    break;
            }

        } else if (path.intendedTargetType === EpubCfiIntendedTargetType.TEXT) {
            let characterOffsetHandled = false;
            if (offset) {
                if (offset.type === EpubCfiOffsetType.CHARACTER) {
                    if (path.stepsResolved) {
                        this.resolveCharacterOffset(path, offset.characterOffset);
                    }
                    characterOffsetHandled = true;

                    const assertionValues = offset.assertion?.values;
                    if (assertionValues && assertionValues.length > 0) {
                        const pre = assertionValues[0];
                        const post = assertionValues.length > 1 ? assertionValues[1] : '';
                        
                        if (this._options.processTextAssertions) {
                            const chunkedTextAssertionProcessor = new EpubCfiTextAssertionProcessor(this._options);
                            chunkedTextAssertionProcessor.processTextAssertion(path, pre, post);
                        }
                    }
                }
            }
            if (!characterOffsetHandled) {
                this.resolveCharacterOffset(path, 0);
            }
        }
    }

    private handleElementCharacterOffset(
        path: EpubCfiResolvedPath,
        characterOffset: IEpubCfiCharacterOffsetNode,
    ): void {
        let targetElement = path.getTargetElement();
        if (targetElement && targetElement.localName === 'img') {
            path.elementCharacterOffset = characterOffset.characterOffset;
        }
    }

    private handleSpatialOffset(path: EpubCfiResolvedPath, spatialOffset: IEpubCfiSpatialOffsetNode): void {
        path.spatialOffset = {
            x: spatialOffset.x,
            y: spatialOffset.y,
        };
    }

    private handleTemporalOffset(path: EpubCfiResolvedPath, temporalOffset: IEpubCfiTemporalOffsetNode): void {
        path.temporalOffset = {
            seconds: temporalOffset.seconds,
        };

        if (isNumber(temporalOffset.x) && isNumber(temporalOffset.y)) {
            path.spatialOffset = {
                x: temporalOffset.x,
                y: temporalOffset.y,
            };
        }
    }

    private resolveCharacterOffset(path: EpubCfiResolvedPath, characterOffset: number): void {
        let targetNode = path.getTargetNode();
        let participatingNodes: Text[] = [];

        // Fetch all participating nodes, typically this will be 1, but it can potentially be 0...N.
        while (targetNode && !DomUtils.isElement(targetNode)) {
            if (DomUtils.isTextNode(targetNode)) {
                participatingNodes.push(targetNode);
            }
            targetNode = targetNode.nextSibling;
        }

        if (participatingNodes.length > 0) {
            let targetTextNode = participatingNodes.find(textNode => {
                if (characterOffset < textNode.length) {
                    return true;
                }
                characterOffset -= textNode.length;
                return false;
            });

            if (targetTextNode) {
                path.container = targetTextNode;
                path.offset = characterOffset;
            } else {
                let lastTextNode = participatingNodes[participatingNodes.length - 1];
                path.container = lastTextNode;
                path.offset = lastTextNode.data.length;
                path.characterOffsetOutOfBounds = characterOffset !== 0;
            }
        } else if (characterOffset > 0) {
            path.characterOffsetOutOfBounds = true;
        }
    }
}
