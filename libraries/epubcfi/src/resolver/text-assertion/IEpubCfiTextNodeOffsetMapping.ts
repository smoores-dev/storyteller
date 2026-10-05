/**
 * Describes the footprint of a single original DOM text node within
 * a normalized text string. Provides the necessary information to map
 * offsets back and forth between the normalized string and the original DOM node.
 */
export interface IEpubCfiTextNodeOffsetMapping {
    /**
     * The original DOM text node.
     */
    node: Text;

    /**
     * The normalized text content of this node, after whitespace collapsing/removal.
     */
    normalizedText: string;

    /**
     * A flat array representing pairs of `[original_offset_in_node, num_characters_removed]`
     * which describe where sequences of characters (usually whitespaces) were removed
     * from this original text node during normalization.
     */
    removedCharacters: number[];
}
