import {describe, expect, it} from 'vitest';
import {DomUtils} from '../common/DomUtils.js';
import {EpubCfiUtils} from '../EpubCfiUtils.js';
import {EpubCfiParser} from '../parser/EpubCfiParser.js';
import {EpubCfiResolvedPath} from '../resolver/EpubCfiResolvedPath.js';
import {EpubCfiResolvedTarget} from '../resolver/EpubCfiResolvedTarget.js';
import {EpubCfiResolver} from '../resolver/EpubCfiResolver.js';
import {EpubCfiSideBias} from '../resolver/EpubCfiSideBias.js';
import {EpubCfiVirtualTarget} from '../resolver/EpubCfiVirtualTarget.js';
import {EpubCfiBuilder} from './EpubCfiBuilder.js';
// @ts-ignore
import testOpf from '../resolver/test-data/testBookOpf.xml?raw';
// @ts-ignore
import testChapter1 from '../resolver/test-data/testChapter1.xhtml?raw';
// @ts-ignore
import testChapter2 from '../resolver/test-data/testChapter2.xhtml?raw';

const OPF_URL = 'com.colibrio://something/testBookOpf.xml';
const CHAPTER1_URL = 'com.colibrio://something/testChapter1.xhtml';
const CHAPTER2_URL = 'com.colibrio://something/testChapter2.html';

describe('EpubCfiBuilder', () => {

    describe('createRange', () => {

        function rangeString(startCfi: string, endCfi: string): string | null {
            const rangeRoot = EpubCfiBuilder.createRange(EpubCfiParser.parse(startCfi), EpubCfiParser.parse(endCfi));
            return rangeRoot ? new EpubCfiBuilder(rangeRoot).toString() : null;
        }

        it('splits two text positions into a range within the same document', () => {
            expect(rangeString('epubcfi(/6/4!/4/2/1:6)', 'epubcfi(/6/4!/4/2/1:11)'))
                .toBe('epubcfi(/6/4!/4/2/1,:6,:11)');
        });

        it('splits at the deepest shared element step', () => {
            expect(rangeString('epubcfi(/6/4!/4/2/2/1:0)', 'epubcfi(/6/4!/4/2/6/1:3)'))
                .toBe('epubcfi(/6/4!/4/2,/2/1:0,/6/1:3)');
        });

        it('splits a cross-document range at the spine, keeping each indirection', () => {
            expect(rangeString('epubcfi(/6/8!/4/2/1:6)', 'epubcfi(/6/10!/4/2/1:13)'))
                .toBe('epubcfi(/6,/8!/4/2/1:6,/10!/4/2/1:13)');
        });

        it('collapses identical positions to a non-range node', () => {
            const rangeRoot = EpubCfiBuilder.createRange(
                EpubCfiParser.parse('epubcfi(/6/4!/4/2/1:6)'),
                EpubCfiParser.parse('epubcfi(/6/4!/4/2/1:6)'),
            )!;
            expect(rangeRoot.rangeStartPath).toBeNull();
            expect(rangeRoot.rangeEndPath).toBeNull();
            expect(new EpubCfiBuilder(rangeRoot).toString()).toBe('epubcfi(/6/4!/4/2/1:6)');
        });

        it('uses the collapsed start/end when given range inputs', () => {
            expect(rangeString('epubcfi(/6/4!/4/2/1,:2,:6)', 'epubcfi(/6/4!/4/2/1,:11,:14)'))
                .toBe('epubcfi(/6/4!/4/2/1,:2,:14)');
        });

        it('emits an empty start component when the start is an ancestor of the end', () => {
            expect(rangeString('epubcfi(/6/4!/4/2)', 'epubcfi(/6/4!/4/2/6/1:3)'))
                .toBe('epubcfi(/6/4!/4/2,,/6/1:3)');
        });

        it('emits an empty start component when only the end continues past an indirection', () => {
            expect(rangeString('epubcfi(/6/4)', 'epubcfi(/6/4!/4/2/1:5)'))
                .toBe('epubcfi(/6/4,,!/4/2/1:5)');
        });

        it('splits when only one position has an offset', () => {
            expect(rangeString('epubcfi(/6/4!/4/2/1)', 'epubcfi(/6/4!/4/2/1:5)'))
                .toBe('epubcfi(/6/4!/4/2/1,,:5)');
        });

        it('splits when the offsets have different types', () => {
            expect(rangeString('epubcfi(/6/4!/4/2@10:20)', 'epubcfi(/6/4!/4/2~5)'))
                .toBe('epubcfi(/6/4!/4/2,@10:20,~5)');
        });

        it('treats steps with the same value but different assertions as divergent', () => {
            expect(rangeString('epubcfi(/6/4!/4/2[foo]/1:0)', 'epubcfi(/6/4!/4/2[bar]/1:3)'))
                .toBe('epubcfi(/6/4!/4,/2[foo]/1:0,/2[bar]/1:3)');
        });

        it('does not validate that the start position precedes the end position', () => {
            // Reversed inputs produce a reversed range; ordering is the caller's responsibility.
            expect(rangeString('epubcfi(/6/4!/4/2/1:11)', 'epubcfi(/6/4!/4/2/1:6)'))
                .toBe('epubcfi(/6/4!/4/2/1,:11,:6)');
        });

        it('returns null when an input has no parent path', () => {
            const empty = EpubCfiUtils.createEmptyRootNode();
            expect(EpubCfiBuilder.createRange(empty, EpubCfiParser.parse('epubcfi(/6/4)'))).toBeNull();
            expect(EpubCfiBuilder.createRange(EpubCfiParser.parse('epubcfi(/6/4)'), empty)).toBeNull();
        });

    });

    describe('createFromResolvedTarget', () => {

        /**
         * Resolves an EPUB CFI against the example book, feeding the resolver whatever document each
         * indirection asks for (handles cross-document ranges that span chapter 1 and chapter 2).
         */
        function resolve(epubcfi: string): EpubCfiResolvedTarget {
            let resolver = new EpubCfiResolver(epubcfi, {processTextAssertions: true});
            let domParser = new DOMParser();

            let opf = domParser.parseFromString(testOpf, 'application/xml');
            let result = resolver.continueResolving(opf, new URL(OPF_URL));

            while (result) {
                let idref = result.element.getAttribute('idref');
                let raw: string;
                let url: string;
                if (idref === 'chapter-001') {
                    raw = testChapter1;
                    url = CHAPTER1_URL;
                } else if (idref === 'chapter-002') {
                    raw = testChapter2;
                    url = CHAPTER2_URL;
                } else {
                    throw new Error(`Unexpected idref: ${idref}`);
                }
                let doc = domParser.parseFromString(raw, 'application/xhtml+xml');
                result = resolver.continueResolving(doc, new URL(url));
            }

            return resolver.getResolvedTarget();
        }

        /** A document-agnostic snapshot of a resolved position, comparable across separate resolutions. */
        function describePos(path: EpubCfiResolvedPath | null): unknown {
            if (!path) {
                return null;
            }
            return {
                offset: path.offset,
                documentUrl: path.documentUrl.href,
                containerName: path.container.nodeName,
                text: DomUtils.isTextNode(path.container) ? (path.container as Text).data : null,
                virtualTarget: path.virtualTarget,
            };
        }

        function describeTarget(target: EpubCfiResolvedTarget): unknown {
            return {
                parent: describePos(target.parentPath),
                rangeStart: describePos(target.rangeStartPath),
                rangeEnd: describePos(target.rangeEndPath),
            };
        }

        it('round-trips a single text position', () => {
            let original = resolve('epubcfi(/6/8!/4/2[chapter-i]/2/2/1[;s=b])');
            expect(original.hasErrors()).toBeFalsy();

            let builder = EpubCfiBuilder.createFromResolvedTarget(original);
            expect(builder).not.toBeNull();

            let rebuilt = resolve(builder!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('removes the warning for a CFI missing an XML id assertion', () => {
            // Same target as above but without the [chapter-i] id assertion -> resolves with a warning.
            let original = resolve('epubcfi(/6/8!/4/2/2/2/1[;s=b])');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.hasWarnings()).toBeTruthy();
            expect(original.isMissingXmlIdAssertions()).toBeTruthy();

            let rebuilt = resolve(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            // The rebuilt CFI re-adds the id assertion from the live element, so the warning is gone.
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(rebuilt.isMissingXmlIdAssertions()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('bakes in the corrected offset for a CFI repaired with text assertions', () => {
            let domParser = new DOMParser();
            let testDoc = domParser.parseFromString(`
                <html xmlns="http://www.w3.org/1999/xhtml">
                <head><title>Test</title></head>
                <body><p>apple banana orange banana apple</p></body>
                </html>
            `, 'application/xhtml+xml');
            let url = new URL('com.colibrio://test.xhtml');

            // Offset 16 is wrong; the [app,le] assertion repairs it to offset 3.
            let resolver = new EpubCfiResolver('epubcfi(/4/2/1:16[app,le])', {processTextAssertions: true});
            resolver.continueResolving(testDoc, url);
            let original = resolver.getResolvedTarget();
            expect(original.parentPath!.repairedWithTextAssertion).toBeTruthy();
            expect(original.parentPath!.offset).toBe(3);

            let rebuiltCfi = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();

            let rebuiltResolver = new EpubCfiResolver(rebuiltCfi, {processTextAssertions: true});
            rebuiltResolver.continueResolving(
                domParser.parseFromString(`
                    <html xmlns="http://www.w3.org/1999/xhtml">
                    <head><title>Test</title></head>
                    <body><p>apple banana orange banana apple</p></body>
                    </html>
                `, 'application/xhtml+xml'),
                url,
            );
            let rebuilt = rebuiltResolver.getResolvedTarget();
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(rebuilt.parentPath!.repairedWithTextAssertion).toBeFalsy();
            expect(rebuilt.parentPath!.offset).toBe(3);
        });

        it('regenerates text assertions when options are supplied', () => {
            let original = resolve('epubcfi(/6/8!/4/2[chapter-i]/4/2/1:6)');
            expect(original.hasErrors()).toBeFalsy();

            let withAssertions = EpubCfiBuilder.createFromResolvedTarget(original, {preLength: 10, postLength: 10})!.toString();
            let withoutAssertions = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();

            // With options, the terminal offset carries a [pre,post] text assertion; without, it does not.
            expect(withAssertions).toMatch(/:6\[/);
            expect(withoutAssertions).not.toMatch(/:6\[/);

            let rebuilt = resolve(withAssertions);
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('round-trips a same-document text range', () => {
            let original = resolve('epubcfi(/6/8!/4/2[chapter-i]/4/2/1,:6,:11)');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.isOwnedBySingleDocument()).toBeTruthy();
            expect(original.createDomRange()!.toString()).toBe('ipsum');

            let rebuilt = resolve(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(rebuilt.isDomRange()).toBeTruthy();
            expect(rebuilt.createDomRange()!.toString()).toBe('ipsum');
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('round-trips a same-document element range with virtual targets', () => {
            let original = resolve('epubcfi(/6/8!/4/2[chapter-i]/2,/0,/4)');
            expect(original.hasErrors()).toBeFalsy();

            let rebuilt = resolve(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('round-trips a cross-document range (start and end in different chapters)', () => {
            let original = resolve(
                'epubcfi(/6,/8!/4/2[chapter-i]/4/2/1:6,/10!/4/2[chapter-ii]/4/2/1:13)',
            );
            expect(original.hasErrors()).toBeFalsy();
            expect(original.hasRangePaths()).toBeTruthy();
            expect(original.isOwnedBySingleDocument()).toBeFalsy();
            expect(original.rangeStartPath!.documentUrl.href).toBe(CHAPTER1_URL);
            expect(original.rangeEndPath!.documentUrl.href).toBe(CHAPTER2_URL);

            let rebuiltCfi = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();
            // Two indirections: each endpoint keeps its own spine itemref + '!'.
            expect((rebuiltCfi.match(/!/g) || []).length).toBe(2);

            let rebuilt = resolve(rebuiltCfi);
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(rebuilt.isOwnedBySingleDocument()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('round-trips a CFI targeting the OPF document (no indirection)', () => {
            let original = resolve('epubcfi(/6/8)');
            expect(original.isTargetingOpfDocument()).toBeTruthy();

            let builder = EpubCfiBuilder.createFromResolvedTarget(original);
            expect(builder).not.toBeNull();

            let rebuilt = resolve(builder!.toString());
            expect(rebuilt.isTargetingOpfDocument()).toBeTruthy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('preserves spatial, temporal and element character (img alt) offsets', () => {
            const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>hi</p><img alt="An image description" src="x.png"/></body></html>`;
            const url = new URL('com.colibrio://offsets.xhtml');
            function resolveSingle(cfi: string): EpubCfiResolvedTarget {
                const resolver = new EpubCfiResolver(cfi, {processTextAssertions: true});
                resolver.continueResolving(new DOMParser().parseFromString(html, 'application/xhtml+xml'), url);
                return resolver.getResolvedTarget();
            }

            // Element character offset (into the img's alt text).
            let original = resolveSingle('epubcfi(/2/4:3)');
            expect(original.getElementCharacterOffsets()).toEqual({start: 3, end: null});
            let rebuilt = resolveSingle(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.getElementCharacterOffsets()).toEqual({start: 3, end: null});

            // Spatial offset.
            original = resolveSingle('epubcfi(/2/4@50.5:60)');
            expect(original.getSpatialOffsets()).toEqual({start: {x: 50.5, y: 60}, end: null});
            rebuilt = resolveSingle(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.getSpatialOffsets()).toEqual({start: {x: 50.5, y: 60}, end: null});

            // Temporal offset.
            original = resolveSingle('epubcfi(/2/4~12.5)');
            expect(original.getTemporalOffsets()).toEqual({start: {seconds: 12.5}, end: null});
            rebuilt = resolveSingle(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.getTemporalOffsets()).toEqual({start: {seconds: 12.5}, end: null});
        });

        it('bakes in the corrected step for a CFI repaired with an XML id assertion', () => {
            // /4/4 is out of bounds (body has a single element child); the [chapter-i] assertion repairs it to /4/2.
            let original = resolve('epubcfi(/6/8!/4/4[chapter-i]/4/2/1:6)');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.isRepairedWithXmlIdAssertions()).toBeTruthy();

            let rebuilt = resolve(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(describeTarget(rebuilt)).toEqual(describeTarget(original));
        });

        it('bakes in corrected offsets for a range repaired with text assertions', () => {
            const html = '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Test</title></head>' +
                '<body><p>apple banana orange banana apple</p></body></html>';
            const url = new URL('com.colibrio://range-repair.xhtml');
            function resolveSingle(cfi: string): EpubCfiResolvedTarget {
                const resolver = new EpubCfiResolver(cfi, {processTextAssertions: true});
                resolver.continueResolving(new DOMParser().parseFromString(html, 'application/xhtml+xml'), url);
                return resolver.getResolvedTarget();
            }

            // Both offsets are wrong; [app,le] repairs the start to 3 and [ora,nge] repairs the end to 16.
            let original = resolveSingle('epubcfi(/4/2/1,:10[app,le],:20[ora,nge])');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.isRepairedWithTextAssertions()).toBeTruthy();
            expect(original.rangeStartPath!.offset).toBe(3);
            expect(original.rangeEndPath!.offset).toBe(16);

            let rebuilt = resolveSingle(EpubCfiBuilder.createFromResolvedTarget(original)!.toString());
            expect(rebuilt.hasErrors()).toBeFalsy();
            expect(rebuilt.hasWarnings()).toBeFalsy();
            expect(rebuilt.rangeStartPath!.offset).toBe(3);
            expect(rebuilt.rangeEndPath!.offset).toBe(16);
        });

        it('re-emits virtual first/last-child steps for an empty element', () => {
            const html = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p></p></body></html>';
            const url = new URL('com.colibrio://virtual.xhtml');
            function resolveSingle(cfi: string): EpubCfiResolvedTarget {
                const resolver = new EpubCfiResolver(cfi, {processTextAssertions: true});
                resolver.continueResolving(new DOMParser().parseFromString(html, 'application/xhtml+xml'), url);
                return resolver.getResolvedTarget();
            }

            // /2/2 = body > p; /2 inside the empty <p> is a virtual LAST_CHILD with offset 0, which must
            // not be confused with FIRST_CHILD (whose offset is also 0).
            let original = resolveSingle('epubcfi(/2/2/2)');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);

            let rebuiltCfi = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();
            expect(rebuiltCfi).toBe('epubcfi(/2/2/2)');
            expect(resolveSingle(rebuiltCfi).parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);

            original = resolveSingle('epubcfi(/2/2/0)');
            expect(original.parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.FIRST_CHILD);
            expect(EpubCfiBuilder.createFromResolvedTarget(original)!.toString()).toBe('epubcfi(/2/2/0)');
        });

        it('re-emits a virtual last-child step after the last element child', () => {
            const html = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>a</p><p>b</p></body></html>';
            const url = new URL('com.colibrio://virtual.xhtml');
            function resolveSingle(cfi: string): EpubCfiResolvedTarget {
                const resolver = new EpubCfiResolver(cfi, {processTextAssertions: true});
                resolver.continueResolving(new DOMParser().parseFromString(html, 'application/xhtml+xml'), url);
                return resolver.getResolvedTarget();
            }

            // /6 points just past the two <p> children of body.
            let original = resolveSingle('epubcfi(/2/6)');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);
            expect(EpubCfiBuilder.createFromResolvedTarget(original)!.toString()).toBe('epubcfi(/2/6)');
        });

        it('rebuilds an out-of-bounds text step as a virtual element step', () => {
            const html = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>a</p></body></html>';
            const url = new URL('com.colibrio://virtual.xhtml');
            function resolveSingle(cfi: string): EpubCfiResolvedTarget {
                const resolver = new EpubCfiResolver(cfi, {processTextAssertions: true});
                resolver.continueResolving(new DOMParser().parseFromString(html, 'application/xhtml+xml'), url);
                return resolver.getResolvedTarget();
            }

            // /3 = the text node after the last <p>, which does not exist -> virtual LAST_CHILD.
            let original = resolveSingle('epubcfi(/2/3)');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);

            // The rebuilt CFI uses the element form (/4) of the virtual last-child step; the resolved
            // container, offset and virtual target are unchanged.
            let rebuiltCfi = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();
            expect(rebuiltCfi).toBe('epubcfi(/2/4)');

            let rebuilt = resolveSingle(rebuiltCfi);
            expect(rebuilt.parentPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);
            expect(rebuilt.parentPath!.container).toEqual(original.parentPath!.container);
            expect(rebuilt.parentPath!.offset).toBe(original.parentPath!.offset);
        });

        it('does not reproduce side bias', () => {
            let original = resolve('epubcfi(/6/8!/4/2[chapter-i]/2/2/1[;s=b])');
            expect(original.hasErrors()).toBeFalsy();
            expect(original.getSideBias()).toBe(EpubCfiSideBias.BEFORE);

            let rebuiltCfi = EpubCfiBuilder.createFromResolvedTarget(original)!.toString();
            expect(rebuiltCfi).not.toContain('s=');
            expect(resolve(rebuiltCfi).getSideBias()).toBeNull();
        });

        it('returns null when an indirection element cannot be resolved', () => {
            let target = resolve('epubcfi(/6/8!/4/2[chapter-i]/4/2/1:6)');
            // Simulate a failed indirection: the OPF local path no longer targets a real element.
            target.parentPath!.localPaths[0].virtualTarget = EpubCfiVirtualTarget.LAST_CHILD;
            expect(EpubCfiBuilder.createFromResolvedTarget(target)).toBeNull();
        });

        it('returns null when there is no parent path', () => {
            let target = new EpubCfiResolvedTarget({
                errors: [],
                parentPath: null,
                rangeStartPath: null,
                rangeEndPath: null,
                src: '',
                srcModified: false,
            });
            expect(EpubCfiBuilder.createFromResolvedTarget(target)).toBeNull();
        });

    });

    describe('text assertion configuration', () => {

        it('should allow updating options via fluent setter', () => {
            const builder = new EpubCfiBuilder();
            builder.setTextAssertionOptions({ preLength: 4, snapToWordBoundaries: true });
            expect(builder.getTextAssertionOptions()).toEqual({ preLength: 4, snapToWordBoundaries: true });

            builder.setTextAssertionOptions({ postLength: 5 });
            expect(builder.getTextAssertionOptions()).toEqual({ preLength: 4, postLength: 5, snapToWordBoundaries: true });
        });

        it('should preserve options on clone', () => {
            const builder = new EpubCfiBuilder();
            builder.setTextAssertionOptions({ preLength: 3})
            const cloned = builder.clone();
            expect(cloned.getTextAssertionOptions()).toEqual({ preLength: 3 });

            // Modify cloned, original should not be affected
            cloned.setTextAssertionOptions({ preLength: 5 });
            expect(cloned.getTextAssertionOptions()?.preLength).toBe(5);
            expect(builder.getTextAssertionOptions()?.preLength).toBe(3);
        });

        it('should generate text assertions when building paths', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="p1">Assertion testing text</p></body></html>', 'application/xhtml+xml');
            const p = doc.getElementById('p1')!;
            const textNode = p.firstChild!; // "Assertion testing text"

            const builder = new EpubCfiBuilder();
            builder.setTextAssertionOptions({
                preLength: 4,
                postLength: 4,
                snapToWordBoundaries: true
            });

            // Offset 10 is after "Assertion "
            builder.appendTerminalDomPosition(textNode, 10);

            // Check stringified output
            const cfi = builder.toString();
            // Expected assertion: Pre is "Assertion " -> snaps to "Assertion "
            // Post is "test" -> snaps to "testing"
            // Let's just check if it contains the assertion syntax with a comma
            expect(cfi).toMatch(/\[Assertion ,testing\]/);
        });
    });
});
