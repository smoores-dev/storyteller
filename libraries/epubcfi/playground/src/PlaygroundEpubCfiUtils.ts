import {EpubCfiBuilder, EpubCfiParser, EpubCfiResolver, EpubCfiStringifier} from 'colibrio-epubcfi';
import DiffMatchPatch from 'diff-match-patch';
import {IEpubCfiCustomTextAssertionMatcherParams} from '../../src/index.js';

export class PlaygroundEpubCfiUtils {
    static getDomRangeForEpubCfi(
        epubCfi: string,
        opfDocument: Document,
        opfUrl: URL,
        contentDocument: Document,
        matchThreshold: number,
    ): Range | null {
        // Parse the EPUBCFI into an object model
        const epubCfiRootNode = EpubCfiParser.parse(epubCfi);

        // Create the EpubCfiResolver, responsible for mapping the EPUB CFI to the DOM.
        const epubCfiResolver = new EpubCfiResolver(epubCfiRootNode, {
            processTextAssertions: true,
            textAssertionSearchDistance: 10000,
            customTextAssertionMatcher: (params: IEpubCfiCustomTextAssertionMatcherParams): number => {
                const dmp = new DiffMatchPatch();
                dmp.Match_Distance = 10000;
                dmp.Match_Threshold = matchThreshold;

                const pre = params.pre.slice(-16);
                const post = params.post.slice(0, 16);

                const matchIndex = dmp.match_main(params.normalizedText, pre + post, params.idealMatchIndex);

                if (matchIndex >= 0) {
                    return matchIndex + pre.length;
                }
                return -1;
            }
        });

        // Start resolving from the OPF document
        const indirectionResult = epubCfiResolver.continueResolving(opfDocument, opfUrl);
        if (!indirectionResult) {
            const resolvedTarget = epubCfiResolver.getResolvedTarget();

            const resolverErrors = resolvedTarget.getResolverErrors().map(error => error.type);
            const parserErrors = resolvedTarget.getParserErrors().map(error => `${error.type} at offset ${error.srcOffset}`);

            console.error('Failed to resolve EPUB CFI');
            if (resolvedTarget.isTargetingOpfDocument()) {
                console.error('- EPUB CFI targets OPF document. Indirection to content document missing or failed.');
            }
            console.error('- Parser errors:', parserErrors);
            console.error('- Resolver errors', resolverErrors);
            return null;
        }

        // indirectionResult.element should now point to the spine `<itemref>` element.
        if (indirectionResult.element.localName !== 'itemref') {
            console.error('Indirection element is not an <itermref> element: ', indirectionResult.element);
            return null;
        }
        const idrefAttributeValue = indirectionResult.element.getAttribute('idref');
        if (!idrefAttributeValue) {
            console.error('Indirection element has no idref attribute', indirectionResult.element);
            return null;
        }
        // Lets get the manifest `<item>` element`
        const manifestItemElement = opfDocument.getElementById(idrefAttributeValue);
        const contentDocumentHref = manifestItemElement?.getAttribute('href');
        if (!contentDocumentHref) {
            console.error('Manifest item does not exist or has no href attribute', manifestItemElement);
            return null;
        }

        const contentDocumentUrl = new URL(contentDocumentHref, opfUrl);

        // In a real EPUB implementation, we would fetch the target content document here from `contentDocumentUrl`.
        // In this demo, we have only one content document which is already loaded.
        // Continue resolving from the content document
        epubCfiResolver.continueResolving(contentDocument, contentDocumentUrl);

        if(epubCfiResolver.getResolvedTarget().getResolverErrors().length) {
            console.error('getDomRangeForEpubCfi(): TextAssertion failed.', epubCfiResolver.getResolvedTarget().getResolverErrors());
            return null;
        }

        return epubCfiResolver.getResolvedTarget().createDomRange();

    }

    static getEpubCfiForDomRange(range: Range, opfItemRefElement: Element): string {

        // EpubCfiBuilder is used for building an EPUB CFI from a DOM position or DOM Range
        const epubCfiBuilder = new EpubCfiBuilder();
        epubCfiBuilder.setTextAssertionOptions({
            preLength: 10,
            postLength: 10,
            snapToWordBoundaries: true,
            wordBoundaryMaxExpansion: 16,
        });

        // Start by appending the local path to the related spine `<itemref>` element in the OPF document
        epubCfiBuilder.appendLocalPathTo(opfItemRefElement);

        // Finish building the EPUB CFI by appending the selected DOM range within the content document.
        epubCfiBuilder.appendTerminalDomRange(range);

        // Now we can get the object model representation of the EPUB CFI.
        const epubCfiRootNode = epubCfiBuilder.getEpubCfiRootNode();

        // Finally, we use the EpubCfiStringifier to get the EPUB CFI string representation.
        return EpubCfiStringifier.stringifyRootNode(epubCfiRootNode);
    }
}
