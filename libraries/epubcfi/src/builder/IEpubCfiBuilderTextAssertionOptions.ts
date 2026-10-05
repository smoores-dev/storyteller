/**
 * Options for configuring the behavior of EpubCfiBuilder.
 */
export interface IEpubCfiBuilderTextAssertionOptions {
    /**
     * The number of characters to capture for the `pre` text assertion.
     */
    preLength?: number;

    /**
     * The number of characters to capture for the `post` text assertion.
     */
    postLength?: number;

    /**
     * If true, expands the extracted text to the nearest word boundary to avoid fragmented word assertions.
     */
    snapToWordBoundaries?: boolean;

    /**
     * The maximum number of characters to expand when searching for a word boundary.
     * Useful for languages without spaces (like Chinese, Japanese, Thai).
     *
     * @default 20
     */
    wordBoundaryMaxExpansion?: number;
}
