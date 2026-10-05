import {IEpubCfiCustomTextAssertionMatcherParams} from './IEpubCfiCustomTextAssertionMatcherParams.js';

export interface IEpubCfiResolverOptions {

    /**
     * When `true`, enables text location verification using text assertions.
     *
     * Text assertions ensure that the text surrounding a resolved character offset matches the
     * expected text defined in the CFI (e.g., `.../3:10[textBefore,textAfter]`).
     * Enabling this option improves resolution accuracy in documents that may have
     * undergone minor changes by verifying the context of the target location.
     *
     * @default false
     */
    processTextAssertions?: boolean;

    /**
     * Defines the character distance to search backwards and forwards from the resolved
     * target node when attempting to match text assertions.
     * 
     * This limit prevents the resolver from scanning excessively large portions of the document 
     * if an assertion cannot be found near the target location.
     * Applies only when `useTextAssertion` is `true`.
     *
     * @default 10000
     */
    textAssertionSearchDistance?: number;

    /**
     * A custom function that allows for more flexible matching of text assertions.
     * This function is called once if no exact match is found within the textAssertionSearchDistance.
     *
     * The amount of normalized text that this function receives
     * is limited by the `textAssertionSearchDistance` option.
     *
     * The function returns:
     * - An index into `params.normalizedText` indicating the position to use.
     * - -1 if no match is found.
     * - -2 if a match was found but `params.normalizedText` wasn't used to find a match. In this case, `params.resolvedPath` should be modified.
     */
    customTextAssertionMatcher?: (params: IEpubCfiCustomTextAssertionMatcherParams) => number;

}
