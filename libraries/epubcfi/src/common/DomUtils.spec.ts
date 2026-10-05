import {describe, expect, it} from 'vitest';
import {DomUtils} from './DomUtils.js';
import {parseFragment} from '../testing/dom.js';

describe('DomUtils', () => {
    describe('isMetadataElementWithContent', () => {
        it('should return true for metadata elements with content', () => {
            const fragment = parseFragment('<script>let a = 1;</script><style>body { color: red; }</style><title>My Title</title>');
            expect(DomUtils.isMetadataElementWithContent(fragment.children[0])).toBe(true);
            expect(DomUtils.isMetadataElementWithContent(fragment.children[1])).toBe(true);
            expect(DomUtils.isMetadataElementWithContent(fragment.children[2])).toBe(true);
        });

        it('should return false for other elements', () => {
            const fragment = parseFragment('<div>content</div><span>content</span>');
            expect(DomUtils.isMetadataElementWithContent(fragment.children[0])).toBe(false);
            expect(DomUtils.isMetadataElementWithContent(fragment.children[1])).toBe(false);
        });
    });
});
