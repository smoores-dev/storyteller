import {IEpubCfiAssertionNode} from './model/assertion/IEpubCfiAssertionNode.js';
import {IEpubCfiAssertionParameterNode} from './model/assertion/IEpubCfiAssertionParameterNode.js';
import {IEpubCfiLocalPathNode} from './model/IEpubCfiLocalPathNode.js';
import {IEpubCfiPathNode} from './model/IEpubCfiPathNode.js';
import {IEpubCfiRootNode} from './model/IEpubCfiRootNode.js';
import {IEpubCfiStepNode} from './model/IEpubCfiStepNode.js';
import {EpubCfiOffsetNode} from './model/offset/EpubCfiOffsetNode.js';
import {EpubCfiOffsetType} from './model/offset/EpubCfiOffsetType.js';
import {IEpubCfiCharacterOffsetNode} from './model/offset/IEpubCfiCharacterOffsetNode.js';
import {IEpubCfiSpatialOffsetNode} from './model/offset/IEpubCfiSpatialOffsetNode.js';
import {IEpubCfiTemporalOffsetNode} from './model/offset/IEpubCfiTemporalOffsetNode.js';

/**
 * Various utility methods for working with EPUB CFIs.
 */
export class EpubCfiUtils {

    static areAssertionsEqual(assertion1: IEpubCfiAssertionNode, assertion2: IEpubCfiAssertionNode): boolean {
        if (assertion1.values.length !== assertion2.values.length) {
            return false;
        }
        if (assertion1.parameters.length !== assertion2.parameters.length) {
            return false;
        }

        if (assertion1.values.some((value, index) => assertion2.values[index] !== value)) {
            return false;
        }

        return assertion1.parameters.every((param1, index) => {
            const param2 = assertion2.parameters[index];
            return param1.name === param2.name && param1.values.length === param2.values.length && param1.values.every((
                value,
                valIndex,
            ) => {
                return value === param2.values[valIndex];
            });
        });
    }

    static areOffsetsEqual(o1: EpubCfiOffsetNode, o2: EpubCfiOffsetNode): boolean {
        if (o1.type === EpubCfiOffsetType.CHARACTER && o2.type === EpubCfiOffsetType.CHARACTER) {
            if (o1.characterOffset !== o2.characterOffset) {
                return false;
            }
        } else if (o1.type === EpubCfiOffsetType.SPATIAL && o2.type === EpubCfiOffsetType.SPATIAL) {
            if (o1.x !== o2.x || o1.y !== o2.y) {
                return false;
            }
        } else if (o1.type === EpubCfiOffsetType.TEMPORAL && o2.type === EpubCfiOffsetType.TEMPORAL) {
            if (o1.seconds !== o2.seconds || o1.x !== o2.x || o1.y !== o2.y) {
                return false;
            }
        } else {
            return false;
        }

        const assertion1 = o1.assertion;
        const assertion2 = o2.assertion;
        return assertion1 && assertion2 ?
            EpubCfiUtils.areAssertionsEqual(assertion1, assertion2) :
            assertion1 === assertion2;
    }

    static areStepsEqual(step1: IEpubCfiStepNode, step2: IEpubCfiStepNode): boolean {
        if (step1.stepValue !== step2.stepValue) {
            return false;
        }
        const assertion1 = step1.assertion;
        const assertion2 = step2.assertion;

        return assertion1 && assertion2 ?
            EpubCfiUtils.areAssertionsEqual(assertion1, assertion2) :
            assertion1 === assertion2;
    }

    static copyAssertionNode(assertionNode: IEpubCfiAssertionNode): IEpubCfiAssertionNode {
        return {
            parameters: assertionNode.parameters.map(parameter => EpubCfiUtils.copyAssertionParameterNode(parameter)),
            srcOffset: assertionNode.srcOffset,
            values: assertionNode.values.slice(),
        };
    }

    static copyLocalPathNode(localPathNode: IEpubCfiLocalPathNode): IEpubCfiLocalPathNode {
        return {
            indirection: localPathNode.indirection,
            srcOffset: localPathNode.srcOffset,
            steps: localPathNode.steps.map(step => EpubCfiUtils.copyStepNode(step)),
        };
    }

    static copyOffsetNode(offsetNode: EpubCfiOffsetNode): EpubCfiOffsetNode {
        switch (offsetNode.type) {
            case EpubCfiOffsetType.CHARACTER:
                return EpubCfiUtils.copyCharacterOffsetNode(offsetNode);

            case EpubCfiOffsetType.SPATIAL:
                return EpubCfiUtils.copySpatialOffsetNode(offsetNode);

            case EpubCfiOffsetType.TEMPORAL:
                return EpubCfiUtils.copyTemporalOffsetNode(offsetNode);
        }
    }

    static copyPathNode(pathNode: IEpubCfiPathNode): IEpubCfiPathNode {
        return {
            complete: pathNode.complete,
            localPaths: pathNode.localPaths.map(localPath => EpubCfiUtils.copyLocalPathNode(localPath)),
            offset: pathNode.offset ? EpubCfiUtils.copyOffsetNode(pathNode.offset) : null,
            srcOffset: pathNode.srcOffset,
        };
    }

    static copyRootNode(rootNode: IEpubCfiRootNode): IEpubCfiRootNode {
        return {
            errors: [],
            parentPath: rootNode.parentPath ? EpubCfiUtils.copyPathNode(rootNode.parentPath) : null,
            rangeEndPath: rootNode.rangeEndPath ? EpubCfiUtils.copyPathNode(rootNode.rangeEndPath) : null,
            rangeStartPath: rootNode.rangeStartPath ? EpubCfiUtils.copyPathNode(rootNode.rangeStartPath) : null,
            src: rootNode.src,
            srcModified: rootNode.srcModified,
            srcOffset: rootNode.srcOffset,
        };
    }

    static copyStepNode(stepNode: IEpubCfiStepNode): IEpubCfiStepNode {
        return {
            assertion: stepNode.assertion ? EpubCfiUtils.copyAssertionNode(stepNode.assertion) : null,
            srcOffset: stepNode.srcOffset,
            stepValue: stepNode.stepValue,
        };
    }

    static createEmptyLocalPathNode(): IEpubCfiLocalPathNode {
        return {
            indirection: false,
            steps: [],
        };
    }

    static createEmptyPathNode(): IEpubCfiPathNode {
        return {
            complete: false,
            localPaths: [],
            offset: null,
        };
    }

    static createEmptyRootNode(): IEpubCfiRootNode {
        return {
            errors: [],
            parentPath: null,
            rangeEndPath: null,
            rangeStartPath: null,
            src: '',
            srcModified: false,
        };
    }

    /**
     * Returns true if the value in the step node is an even number, i.e. targets an Element.
     */
    static isElementStepNode(node: IEpubCfiStepNode): boolean {
        return node.stepValue % 2 === 0;
    }

    static isTextStepNode(node: IEpubCfiStepNode): boolean {
        return node.stepValue % 2 === 1;
    }

    private static copyAssertionParameterNode(parameterNode: IEpubCfiAssertionParameterNode): IEpubCfiAssertionParameterNode {
        return {
            name: parameterNode.name,
            srcOffset: parameterNode.srcOffset,
            values: parameterNode.values.slice(),
        };
    }

    private static copyCharacterOffsetNode(offsetNode: IEpubCfiCharacterOffsetNode): IEpubCfiCharacterOffsetNode {
        return {
            assertion: offsetNode.assertion ? EpubCfiUtils.copyAssertionNode(offsetNode.assertion) : null,
            characterOffset: offsetNode.characterOffset,
            srcOffset: offsetNode.srcOffset,
            type: offsetNode.type,
        };
    }

    private static copySpatialOffsetNode(offsetNode: IEpubCfiSpatialOffsetNode): IEpubCfiSpatialOffsetNode {
        return {
            assertion: offsetNode.assertion ? EpubCfiUtils.copyAssertionNode(offsetNode.assertion) : null,
            srcOffset: offsetNode.srcOffset,
            type: offsetNode.type,
            x: offsetNode.x,
            y: offsetNode.y,
        };
    }

    private static copyTemporalOffsetNode(offsetNode: IEpubCfiTemporalOffsetNode): IEpubCfiTemporalOffsetNode {
        return {
            assertion: offsetNode.assertion ? EpubCfiUtils.copyAssertionNode(offsetNode.assertion) : null,
            seconds: offsetNode.seconds,
            srcOffset: offsetNode.srcOffset,
            type: offsetNode.type,
            x: offsetNode.x,
            y: offsetNode.y,
        };
    }

}