import {EpubCfiResolvedPath} from './EpubCfiResolvedPath.js';

export interface IEpubCfiCustomTextAssertionMatcherParams {

    /**
     * The offset into `normalizedText` we ideally want the match to be found at.
     */
    idealMatchIndex: number;

    /**
     * Normalized text around the original target position.
     */
    normalizedText: string;

    /**
     * The resolved path object containing the current container node and offset.
     */
    resolvedPath: EpubCfiResolvedPath;

    /**
     * The text expected immediately preceding the offset location.
     */
    pre: string;

    /**
     * The text expected immediately following the offset location.
     */
    post: string;
}