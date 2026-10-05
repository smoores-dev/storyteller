import {describe, expect, it} from 'vitest';
import {DomUtils} from './DomUtils.js';
describe('DomUtils', () => {
    describe('isMetadataElementWithContent', () => {
        it('should return true for metadata elements with content', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<script>let a = 1;</script><style>body { color: red; }</style><title>My Title</title>', 'text/html');
            expect(DomUtils.isMetadataElementWithContent(doc.querySelector('script')!)).toBe(true);
            expect(DomUtils.isMetadataElementWithContent(doc.querySelector('style')!)).toBe(true);
            expect(DomUtils.isMetadataElementWithContent(doc.querySelector('title')!)).toBe(true);
        });

        it('should return false for other elements', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<div>content</div><span>content</span>', 'text/html');
            expect(DomUtils.isMetadataElementWithContent(doc.querySelector('div')!)).toBe(false);
            expect(DomUtils.isMetadataElementWithContent(doc.querySelector('span')!)).toBe(false);
        });
    });
});