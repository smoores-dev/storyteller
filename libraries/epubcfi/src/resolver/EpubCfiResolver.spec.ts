import {describe, expect, it} from 'vitest';
import {DomUtils} from '../common/DomUtils.js';
import {EpubCfiIntendedTargetType} from './EpubCfiIntendedTargetType.js';
import {EpubCfiResolvedTarget} from './EpubCfiResolvedTarget.js';
import {EpubCfiResolver} from './EpubCfiResolver.js';
import {EpubCfiSideBias} from './EpubCfiSideBias.js';
import {EpubCfiVirtualTarget} from './EpubCfiVirtualTarget.js';
import {EpubCfiResolverErrorType} from './EpubCfiResolverErrorType.js';
// @ts-ignore
import testOpf from './test-data/testBookOpf.xml?raw';
// @ts-ignore
import testChapter1 from './test-data/testChapter1.xhtml?raw';
// @ts-ignore
import testChapter2 from './test-data/testChapter2.xhtml?raw';

describe('EpubCfiResolver', () => {

    function resolveEpubCfi(epubcfi: string): EpubCfiResolvedTarget {
        let resolver = new EpubCfiResolver(epubcfi, { processTextAssertions: true });

        let domParser = new DOMParser();
        let currentDocument = domParser.parseFromString(testOpf, 'application/xml');
        let currentDocUrl = new URL('com.colibrio://something/testBookOpf.xml');

        let indirectionResult = resolver.continueResolving(currentDocument, currentDocUrl);

        expect(indirectionResult).not.toBeNull();

        expect(indirectionResult?.documentUrl.toString()).toBe('com.colibrio://something/testBookOpf.xml');
        expect(indirectionResult?.element.localName).toBe('itemref');
        expect(indirectionResult?.element.getAttribute('idref')).toBe('chapter-001');

        let chapterDoc = domParser.parseFromString(testChapter1, 'application/xhtml+xml');

        indirectionResult = resolver.continueResolving(chapterDoc, new URL('com.colibrio://something/testChapter1.xhtml'));

        expect(indirectionResult).toBeNull();
        return resolver.getResolvedTarget();
    }

    it('should resolve to a text location within the example EPUB', () => {
        // let resolver = new EpubCfiResolver(xmlDocument, 'testBookOpf.xml');
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/2/2/1[;s=b])');

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isDomRange()).toBeFalsy();
        expect(resolvedTarget.hasRangePaths()).toBeFalsy();
        expect(resolvedTarget.getSideBias()).toBe(EpubCfiSideBias.BEFORE);
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.getTargetElement()).toBeNull();

        let parentPath = resolvedTarget.parentPath!;

        expect(parentPath.intendedTargetType).toBe(EpubCfiIntendedTargetType.TEXT);
        expect(parentPath.documentUrl.toString()).toBe('com.colibrio://something/testChapter1.xhtml');
        expect(DomUtils.isTextNode(parentPath.container)).toBeTruthy();
        expect(DomUtils.isTextNode(parentPath.getTargetNode())).toBeTruthy();
        expect(parentPath.offset).toBe(0);
        expect(parentPath.textAssertionFailed).toBeFalsy();
        expect(parentPath.container.parentNode!.nodeName).toBe('h2');
        expect((parentPath.container as Text).data).toBe('CHAPTER I');

        expect(parentPath.isMissingXmlIdAssertions()).toBeFalsy();

        let range = resolvedTarget.createDomRange()!;
        expect(range.collapsed).toBeTruthy();
        expect(range.startContainer).toBe(parentPath.container);
        expect(range.startOffset).toBe(parentPath.offset);
        range.detach();
    });

    it('should resolve to a text location within the example EPUB using the async api', () => {
        // let resolver = new EpubCfiResolver(xmlDocument, 'testBookOpf.xml');
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2/2/2/1[;s=b])');

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.hasWarnings()).toBeTruthy();
        expect(resolvedTarget.isMissingXmlIdAssertions()).toBeTruthy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isDomRange()).toBeFalsy();
        expect(resolvedTarget.hasRangePaths()).toBeFalsy();
        expect(resolvedTarget.getSideBias()).toBe(EpubCfiSideBias.BEFORE);
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.getTargetElement()).toBeNull();

        let parentPath = resolvedTarget.parentPath!;

        expect(parentPath.intendedTargetType).toBe(EpubCfiIntendedTargetType.TEXT);
        expect(parentPath.documentUrl.toString()).toBe('com.colibrio://something/testChapter1.xhtml');
        expect(DomUtils.isTextNode(parentPath.container)).toBeTruthy();
        expect(DomUtils.isTextNode(parentPath.getTargetNode())).toBeTruthy();
        expect(parentPath.offset).toBe(0);
        expect(parentPath.textAssertionFailed).toBeFalsy();
        expect(parentPath.container.parentNode!.nodeName).toBe('h2');
        expect((parentPath.container as Text).data).toBe('CHAPTER I');

        let range = resolvedTarget.createDomRange()!;
        expect(range.collapsed).toBeTruthy();
        expect(range.startContainer).toBe(parentPath.container);
        expect(range.startOffset).toBe(parentPath.offset);
        range.detach();
    });

    it('should resolve to a text location and match exact text assertion', () => {
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/2/2/1:3[CHA,PTER I])');

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        let parentPath = resolvedTarget.parentPath!;
        expect(parentPath.textAssertionFailed).toBeFalsy();
        expect(parentPath.offset).toBe(3);
    });

    it('should set textAssertionFailed on assertion mismatch', () => {
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/2/2/1:3[WRONG,TEXT])');

        expect(resolvedTarget.hasErrors()).toBeTruthy();
        let parentPath = resolvedTarget.parentPath!;
        expect(parentPath.textAssertionFailed).toBeTruthy();
        let errors = parentPath.getResolverErrors();
        expect(errors.some(e => e.type === EpubCfiResolverErrorType.TEXT_ASSERTION_FAILED)).toBeTruthy();
        expect(parentPath.offset).toBe(3); // offset should be kept
    });

    it('should try text assertion even if element/text steps failed to resolve', () => {
        // /6/8!/4/2[chapter-i]/8/2/1:3, but we don't have step /8 in chapter-i (which stops at /4).
        // so stepsResolved should become false for the element path, but character assertion will still try to find "CHAPTER I" within the nearest container.
        // E.g. targeting a non-existent child but providing an assertion.
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/8/2/1:3[CHA,PTER I])');
        
        expect(resolvedTarget.hasErrors()).toBeTruthy(); // steps didn't resolve
        expect(resolvedTarget.isEveryStepResolved()).toBeFalsy();
        
        let parentPath = resolvedTarget.parentPath!;
        expect(parentPath.textAssertionFailed).toBeFalsy(); // Text assertion recovered the offset to CHAPTER I
    });

    it('should fallback to whole document match if configured', () => {

        // Target CHAPTER I, but use assertion that matches "Lorem ipsum".
        let resolver = new EpubCfiResolver('epubcfi(/6/8!/4/2[chapter-i]/2/2/1:3[Lorem ,ipsum])', { processTextAssertions: true });

        let domParser = new DOMParser();
        let currentDocument = domParser.parseFromString(testOpf, 'application/xml');
        let currentDocUrl = new URL('com.colibrio://something/testBookOpf.xml');

        resolver.continueResolving(currentDocument, currentDocUrl);
        let chapterDoc = domParser.parseFromString(testChapter1, 'application/xhtml+xml');
        resolver.continueResolving(chapterDoc, new URL('com.colibrio://something/testChapter1.xhtml'));

        let resolvedTarget = resolver.getResolvedTarget();
        expect(resolvedTarget.hasErrors()).toBeFalsy();
        let parentPath = resolvedTarget.parentPath!;
        expect(parentPath.textAssertionFailed).toBeFalsy();
        expect((parentPath.container as Text).data).toContain('Lorem ipsum');
    });

    it('should resolve text assertion to closest match and prefer forward match on tie', () => {
        let domParser = new DOMParser();
        let testDoc = domParser.parseFromString(`
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head><title>Test</title></head>
            <body><p>apple banana orange banana apple</p></body>
            </html>
        `, 'application/xhtml+xml');

        // text content: "apple banana orange banana apple"
        // length: 32
        // match 1 (apple): indices 0-5, split point for [app,le] is 3.
        // match 2 (apple): indices 27-32, split point for [app,le] is 30.
        
        // Exact middle between 3 and 30 is (3+30)/2 = 16.5
        // Distance from 16 to 3 is 13. Distance from 16 to 30 is 14. Closest is 3.
        let resolver = new EpubCfiResolver('epubcfi(/4/2/1:16[app,le])', { processTextAssertions: true });
        resolver.continueResolving(testDoc, new URL('com.colibrio://test.xhtml'));
        let resolvedTarget = resolver.getResolvedTarget();

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.parentPath!.textAssertionFailed).toBeFalsy();
        expect(resolvedTarget.parentPath!.repairedWithTextAssertion).toBeTruthy();
        expect(resolvedTarget.parentPath!.offset).toBe(3);

        // Distance from 17 to 3 is 14. Distance from 17 to 30 is 13. Closest is 30.
        let resolver2 = new EpubCfiResolver('epubcfi(/4/2/1:17[app,le])', { processTextAssertions: true });
        resolver2.continueResolving(testDoc, new URL('com.colibrio://test.xhtml'));
        let resolvedTarget2 = resolver2.getResolvedTarget();
        expect(resolvedTarget2.hasErrors()).toBeFalsy();
        expect(resolvedTarget2.parentPath!.textAssertionFailed).toBeFalsy();
        expect(resolvedTarget.parentPath!.repairedWithTextAssertion).toBeTruthy();
        expect(resolvedTarget2.parentPath!.offset).toBe(30);

        // Now what if they are equidistant? Let's use indices 3 and 29. Wait, "apple" is 5 chars, so split is 3 and 27+3=30.
        // Difference is 27. Middle is 16.5. Let's create a string where distance is perfectly equal.
        // "apple banana xxxxx banana apple" -> 0 to 5, 26 to 31. Split 3 and 29. Diff 26. Mid 16.
        let testDocTie = domParser.parseFromString(`
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head><title>Test</title></head>
            <body><p>apple banana xxxxx banana apple</p></body>
            </html>
        `, 'application/xhtml+xml');
        // match 1 split: 3. match 2 split: 29.
        // Target offset 16. Distance to 3 = 13. Distance to 29 = 13.
        // Tie breaker should pick the forward match (29).
        let resolverTie = new EpubCfiResolver('epubcfi(/4/2/1:16[app,le])', { processTextAssertions: true });
        resolverTie.continueResolving(testDocTie, new URL('com.colibrio://test.xhtml'));
        let resolvedTargetTie = resolverTie.getResolvedTarget();
        expect(resolvedTargetTie.hasErrors()).toBeFalsy();
        expect(resolvedTargetTie.parentPath!.textAssertionFailed).toBeFalsy();
        expect(resolvedTargetTie.parentPath!.offset).toBe(29);
    });

    it('should resolve to an element range within the example EPUB', () => {
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/2,/0,/4)');

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isDomRange()).toBeTruthy();
        expect(resolvedTarget.hasRangePaths()).toBeTruthy();
        expect(resolvedTarget.getSideBias()).toBeNull();
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.rangeStartPath!.virtualTarget).toBe(EpubCfiVirtualTarget.FIRST_CHILD);
        expect(resolvedTarget.rangeEndPath!.virtualTarget).toBe(EpubCfiVirtualTarget.LAST_CHILD);

        let range = resolvedTarget.createDomRange()!;
        expect(range).not.toBeNull();
        expect(range.collapsed).toBeFalsy();

        let startContainer = range.startContainer as Element;
        let endContainer = range.endContainer as Element;
        expect(startContainer.nodeName).toBe('div');
        expect(endContainer.nodeName).toBe('div');
        expect(startContainer.getAttribute('class')).toBe('chapter-title-wrap');
        expect(endContainer.getAttribute('class')).toBe('chapter-title-wrap');
        expect(range.startOffset).toBe(0);
        expect(range.endOffset).toBe(endContainer.childNodes.length);
        range.detach();
    });

    it('should resolve to a text range in the example EPUB', () => {
        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/4/2[chapter-i]/4/2/1,:6,:11)');
        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isDomRange()).toBeTruthy();
        expect(resolvedTarget.hasRangePaths()).toBeTruthy();
        expect(resolvedTarget.getSideBias()).toBeNull();
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.hasElementOffsets()).toBeFalsy();
        expect(resolvedTarget.rangeStartPath!.virtualTarget).toBeNull();
        expect(resolvedTarget.rangeEndPath!.virtualTarget).toBeNull();
        expect(resolvedTarget.rangeStartPath!.intendedTargetType).toBe(EpubCfiIntendedTargetType.TEXT);
        expect(resolvedTarget.rangeEndPath!.intendedTargetType).toBe(EpubCfiIntendedTargetType.TEXT);

        let range = resolvedTarget.createDomRange()!;
        expect(range.toString()).toBe('ipsum');
        range.detach();
    });

    it('should give an invalid target if not redirected from OPF', () => {
        let resolver = new EpubCfiResolver('epubcfi(/6/8)');

        let parser = new DOMParser();
        let currentDocument = parser.parseFromString(testOpf, 'application/xml');
        let currentDocUrl = new URL('com.colibrio://something/testBookOpf.xml');

        let indirectionResult = resolver.continueResolving(currentDocument, currentDocUrl);
        expect(indirectionResult).toBeNull();

        let resolvedTarget = resolver.getResolvedTarget();

        expect(resolvedTarget.hasErrors()).toBeTruthy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeTruthy();
        expect(resolvedTarget.isDomRange()).toBeFalsy();
        expect(resolvedTarget.createDomRange()).toBeNull();
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.hasElementOffsets()).toBeFalsy();

        let targetElement = resolvedTarget.getTargetElement()!;
        expect(targetElement.nodeName).toBe('itemref');
    });

    it('should resolve epubcfi(/6/8!) and epubcfi(/6/8!/0) to content document', () => {

        let resolvedTarget = resolveEpubCfi('epubcfi(/6/8!)');

        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.hasElementOffsets()).toBeFalsy();
        let range = resolvedTarget.createDomRange()!;
        expect((range.startContainer.childNodes[range.startOffset] as Element).localName).toBe('html');

        resolvedTarget = resolveEpubCfi('epubcfi(/6/8!/0)');
        expect(resolvedTarget.hasErrors()).toBeFalsy();
        expect(resolvedTarget.isTargetingOpfDocument()).toBeFalsy();
        expect(resolvedTarget.isOwnedBySingleDocument()).toBeTruthy();
        expect(resolvedTarget.hasElementOffsets()).toBeFalsy();
        range = resolvedTarget.createDomRange()!;
        expect((range.startContainer as Element).localName).toBe('html');
    });

    it('should resolve epubcfi(/6,/8!/4/2[chapter-i],/10!/4/2[chapter-ii]/4) to a range partially covering 2 documents', () => {
        let resolver = new EpubCfiResolver('epubcfi(/6,/8!/4/2[chapter-i],/10!/4/2[chapter-ii]/4)');

        let parser = new DOMParser();
        let currentDocument = parser.parseFromString(testOpf, 'application/xml');
        let currentDocUrl = new URL('com.colibrio://something/testBookOpf.xml');

        let indirectionResult = resolver.continueResolving(currentDocument, currentDocUrl);

        expect(indirectionResult).not.toBeNull();

        expect(indirectionResult?.documentUrl.toString()).toBe('com.colibrio://something/testBookOpf.xml');
        expect(indirectionResult?.element.localName).toBe('itemref');
        expect(indirectionResult?.element.getAttribute('idref')).toBe('chapter-001');

        // Check that Both start and end document itemref has been reached
        const resolvedTarget = resolver.getResolvedTarget();

        expect(resolvedTarget.parentPath).not.toBeNull();
        expect(resolvedTarget.rangeStartPath).not.toBeNull();
        expect(resolvedTarget.rangeEndPath).not.toBeNull();

        expect(resolvedTarget.parentPath!.indirectionsResolved).toBe(true);
        expect(resolvedTarget.rangeStartPath!.indirectionsResolved).toBe(false);
        expect(resolvedTarget.rangeEndPath!.indirectionsResolved).toBe(false);

        const startPathElement = resolvedTarget.rangeStartPath!.getTargetElement();
        expect(startPathElement?.localName).toBe('itemref');
        expect(startPathElement?.getAttribute('idref')).toBe('chapter-001');

        const endPathElement = resolvedTarget.rangeEndPath!.getTargetElement();
        expect(endPathElement?.localName).toBe('itemref');
        expect(endPathElement?.getAttribute('idref')).toBe('chapter-002');

        const chapterDoc = parser.parseFromString(testChapter1, 'application/xhtml+xml');

        indirectionResult = resolver.continueResolving(chapterDoc, new URL('com.colibrio://something/testChapter1.xhtml'));

        expect(resolvedTarget.rangeStartPath!.indirectionsResolved).toBe(true);
        expect(resolvedTarget.rangeEndPath!.indirectionsResolved).toBe(false);

        expect(indirectionResult?.documentUrl.toString()).toBe('com.colibrio://something/testBookOpf.xml');
        expect(indirectionResult?.element.localName).toBe('itemref');
        expect(indirectionResult?.element.getAttribute('idref')).toBe('chapter-002');

        const chapter2Doc = parser.parseFromString(testChapter2, 'application/xhtml+xml');

        indirectionResult = resolver.continueResolving(chapter2Doc, new URL('com.colibrio://something/testChapter2.xhtml'));

        expect(indirectionResult).toBeNull();

        expect(resolvedTarget.rangeEndPath!.indirectionsResolved).toBe(true);

        expect(resolvedTarget.isDomRange()).toBe(false);
        expect(resolvedTarget.rangeStartPath?.getTargetElement()?.id).toBe('chapter-i');
        expect(resolvedTarget.rangeEndPath?.getTargetElement()?.parentElement?.id).toBe('chapter-ii');

    });

    it('should process the range start offset/side-bias even when the range end path finishes first', () => {
        // The start path has an indirection (it resolves into chapter 1) plus a character offset
        // and a side bias, while the end path (/10) stays in the OPF and therefore finishes first.
        let resolver = new EpubCfiResolver('epubcfi(/6,/8!/4/2[chapter-i]/2/2/1:3[;s=b],/10)', { processTextAssertions: true });

        let parser = new DOMParser();
        let opfDoc = parser.parseFromString(testOpf, 'application/xml');
        let indirectionResult = resolver.continueResolving(opfDoc, new URL('com.colibrio://something/testBookOpf.xml'));

        const resolvedTarget = resolver.getResolvedTarget();

        // Sanity: end path finishes in the OPF, start path still needs the chapter document.
        expect(resolvedTarget.rangeStartPath!.indirectionsResolved).toBe(false);
        expect(resolvedTarget.rangeEndPath!.indirectionsResolved).toBe(true);
        expect(indirectionResult?.element.getAttribute('idref')).toBe('chapter-001');

        let chapterDoc = parser.parseFromString(testChapter1, 'application/xhtml+xml');
        indirectionResult = resolver.continueResolving(chapterDoc, new URL('com.colibrio://something/testChapter1.xhtml'));
        expect(indirectionResult).toBeNull();

        let rangeStartPath = resolvedTarget.rangeStartPath!;
        expect(rangeStartPath.intendedTargetType).toBe(EpubCfiIntendedTargetType.TEXT);

        // The following only hold if the start offset/side-bias was actually processed.
        expect(DomUtils.isTextNode(rangeStartPath.container)).toBeTruthy();
        expect((rangeStartPath.container as Text).data).toBe('CHAPTER I');
        expect(rangeStartPath.offset).toBe(3);
        expect(rangeStartPath.sideBias).toBe(EpubCfiSideBias.BEFORE);
    });

    it('should resolve epubcfi(/6,/8!/4/2[chapter-i],/10) so that endRange is finished first', () => {
        let resolver = new EpubCfiResolver('epubcfi(/6,/8!/4/2[chapter-i],/10)');

        let parser = new DOMParser();
        let currentDocument = parser.parseFromString(testOpf, 'application/xml');
        let currentDocUrl = new URL('com.colibrio://something/testBookOpf.xml');

        let indirectionResult = resolver.continueResolving(currentDocument, currentDocUrl);
        expect(indirectionResult).not.toBeNull();

        // Check that Both start and end document itemref has been reached
        const resolvedTarget = resolver.getResolvedTarget();

        expect(resolvedTarget.parentPath).not.toBeNull();
        expect(resolvedTarget.rangeStartPath).not.toBeNull();
        expect(resolvedTarget.rangeEndPath).not.toBeNull();

        expect(resolvedTarget.parentPath!.indirectionsResolved).toBe(true);
        expect(resolvedTarget.rangeStartPath!.indirectionsResolved).toBe(false);
        expect(resolvedTarget.rangeEndPath!.indirectionsResolved).toBe(true);
    });

});
