import {describe, expect, it} from 'vitest';
import {NodeType} from '../common/definitions/NodeType.js';
import {DomUtils} from '../common/DomUtils.js';
import {EpubCfiOffsetType} from '../model/offset/EpubCfiOffsetType.js';
import {IEpubCfiCharacterOffsetNode} from '../model/offset/IEpubCfiCharacterOffsetNode.js';
import {EpubCfiBuilderHelper} from './EpubCfiBuilderHelper.js';
import {IEpubCfiBuilderTextAssertionOptions} from './IEpubCfiBuilderTextAssertionOptions.js';
import {all, one, parseDocument} from '../testing/dom.js';
// @ts-ignore
import testXhtml from './test-data/example-doc.xhtml?raw';

describe('EpubCfiBuilderHelper', () => {
    describe('buildLocalPathToElement', () => {
        it('should report the path from HTML root down to element', () => {
            const doc = parseDocument(testXhtml);

            let localPath = EpubCfiBuilderHelper.buildLocalPathToElement(doc.getElementById('title')!, false);

            expect(localPath.indirection).toBeFalsy();
            expect(localPath.steps.length).toBe(6);

            let steps = localPath.steps;
            expect(steps[0].stepValue).toBe(4);
            expect(steps[1].stepValue).toBe(2);
            expect(steps[2].stepValue).toBe(2);
            expect(steps[3].stepValue).toBe(2);
            expect(steps[4].stepValue).toBe(2);
            expect(steps[5].stepValue).toBe(2);

            expect(steps[0].assertion).toBeNull();
            expect(steps[1].assertion).toBeNull();
            expect(steps[2].assertion).toBeNull();
            expect(steps[3].assertion).toBeNull();
            expect(steps[4].assertion).toBeNull();
            expect(steps[5].assertion).toEqual({
                values: ['title'],
                parameters: [],
            });
        });
    });

    describe('appendTerminalLocalPath', () => {
        it('should create local path to elements', () => {
            const doc = parseDocument(testXhtml);
            let paragraphElement = doc.getElementById('paragraph-1')!;

            let pathNode = EpubCfiBuilderHelper.appendTerminalLocalPath(paragraphElement.parentNode!, DomUtils.getNodeIndex(paragraphElement));
            let localPathNode = pathNode.localPaths[0];

            let steps = localPathNode.steps;
            expect(steps.length).toBe(3);
            expect(steps[0].stepValue).toBe(4);
            expect(steps[1].stepValue).toBe(2);
            expect(steps[2].stepValue).toBe(4);

            expect(steps[0].assertion).toBeNull();
            expect(steps[1].assertion).toBeNull();
            expect(steps[2].assertion).toEqual({
                values: ['paragraph-1'],
                parameters: [],
            });
            expect(pathNode.offset).toBeNull();
        });

        it('should create local path to text and set offset', () => {
            const doc = parseDocument(testXhtml);
            let paragraphElement = doc.getElementById('paragraph-1')!;
            expect(paragraphElement.childNodes[2].nodeType).toBe(NodeType.TEXT_NODE);

            let pathNode = EpubCfiBuilderHelper.appendTerminalLocalPath(paragraphElement, 2);
            let localPathNode = pathNode.localPaths[0];

            let steps = localPathNode.steps;
            expect(steps.length).toBe(4);
            expect(steps[0].stepValue).toBe(4);
            expect(steps[1].stepValue).toBe(2);
            expect(steps[2].stepValue).toBe(4);
            expect(steps[3].stepValue).toBe(3);

            let offset = pathNode.offset as IEpubCfiCharacterOffsetNode;
            expect(offset.type).toBe(EpubCfiOffsetType.CHARACTER);
            expect(offset.characterOffset).toBe(0);
        });

        it('should create local path to text and set offset', () => {
            const doc = parseDocument(testXhtml);
            let paragraphElement = doc.getElementById('paragraph-1')!;
            let textNode = paragraphElement.childNodes[2];
            expect(textNode.nodeType).toBe(NodeType.TEXT_NODE);

            let pathNode = EpubCfiBuilderHelper.appendTerminalLocalPath(textNode, 4);
            let localPathNode = pathNode.localPaths[0];

            let steps = localPathNode.steps;
            expect(steps.length).toBe(4);
            expect(steps[0].stepValue).toBe(4);
            expect(steps[1].stepValue).toBe(2);
            expect(steps[2].stepValue).toBe(4);
            expect(steps[3].stepValue).toBe(3);

            let offset = pathNode.offset as IEpubCfiCharacterOffsetNode;
            expect(offset.type).toBe(EpubCfiOffsetType.CHARACTER);
            expect(offset.characterOffset).toBe(4);
        });
    });

    describe('getTextContextAroundNode', () => {
        it('should correctly gather text crossing inline elements and snap to words', () => {
            const doc = parseDocument('<body><div><p>This is an <b>example</b> text for assertions.</p></div></body>');
            let p = one(doc, 'p');
            let textNode = p.childNodes[2]!; // " text for assertions."

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 5,
                postLength: 5,
                snapToWordBoundaries: true,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 1, options);
            expect(result).toEqual(['example ', 'text']);
        });

        it('should gather exact text when snapToWordBoundaries is false', () => {
            const doc = parseDocument('<body><div><p>This is an <b>example</b> text for assertions.</p></div></body>');
            let p = one(doc, 'p');
            let textNode = p.childNodes[2]!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 5,
                postLength: 5,
                snapToWordBoundaries: false,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 1, options);
            expect(result).toEqual(['mple ', 'text']);
        });

        it('should return null when pre and post lengths are 0', () => {
            const doc = parseDocument('<body><p>Some text</p></body>');
            let textNode = one(doc, 'p')!.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 0,
                postLength: 0,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 4, options);
            expect(result).toBeNull();
        });

        it('should return null when options are omitted', () => {
            const doc = parseDocument('<body><p>Some text</p></body>');
            let textNode = one(doc, 'p')!.firstChild!;

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 4, undefined);
            expect(result).toBeNull();
        });

        it('should gathering text at block element boundaries', () => {
            const doc = parseDocument('<body><div><p>Para one.</p><p>Para two.</p></div></body>');
            let p = all(doc, 'p')[1]!;
            let textNode = p.firstChild!; // "Para two."

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 20,
                postLength: 20,
                snapToWordBoundaries: false,
            };

            // Offset 5 is after "Para "
            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 5, options);
            // Post should gather "two." (length 4).
            expect(result).toEqual(['Para one.Para ', 'two.']);
        });

        it('should limit expansion to wordBoundaryMaxExpansion when snapping', () => {
            const doc = parseDocument('<body><p>Thisisaverylongstringwithoutanyspacesinit.</p></body>');
            let textNode = one(doc, 'p')!.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 4,
                postLength: 4,
                snapToWordBoundaries: true,
                wordBoundaryMaxExpansion: 5,
            };

            // Offset 20 is after "Thisisaverylongstrin"
            // "Thisisaverylongstrin" (20) + "gwithoutanyspacesinit." (22)
            // Pre target: "trin"
            // Snap expansion backwards max 5 chars: "longs" -> "longstrin" (length 9)
            // Post target: "gwit"
            // Snap expansion forwards max 5 chars: "houta" -> "gwithouta" (length 9)

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 20, options);
            expect(result).toEqual(['longstrin', 'gwithouta']);
        });

        it('should handle metadata elements correctly', () => {
            const doc = parseDocument('<body><div><span>text before</span><script>const x = 1;</script><p>text</p><style>.a {}</style><p>text after</p></div></body>');
            let p = one(doc, 'p');
            let textNode = p.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 20,
                postLength: 20,
                snapToWordBoundaries: false,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 2, options);
            expect(result).toEqual(['te', 'xt']);
        });

        it('should handle edge cases where text is exactly at the boundary', () => {
            const doc = parseDocument('<body><p>  Leading space and trailing  </p></body>');
            let textNode = one(doc, 'p')!.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 5,
                postLength: 5,
                snapToWordBoundaries: true,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 2, options);
            // offset 2 is after "  "
            // Pre is "  " (2 chars). Snap expansion doesn't go further because block boundary.
            // Post is "Leadi" (5 chars). Next char is "n", next is "g", next is " ". So expands to "Leading" (excludes the space)
            // Note: After normalization, "  " becomes empty string for pre context.
            expect(result).toEqual(['', 'Leading']);
        });

        it('should normalize whitespace in assertions (collapse and trim)', () => {
            const doc = parseDocument('<body><p>   Lots \n of \t space   </p></body>');
            let textNode = one(doc, 'p')!.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 15,
                postLength: 15,
                snapToWordBoundaries: false,
            };

            // offset 10 is after "   Lots \n "
            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 10, options);
            // Pre text raw: "   Lots \n " -> normalized to "Lots "
            // Post text raw: "of \t space   " -> normalized to "of space"
            expect(result).toEqual(['Lots ', 'of space']);
        });

        it('should correctly collapse whitespace if the offset is in between whitespaces', () => {
            const doc = parseDocument('<body><div><p>This is an <b>example</b> text \n for assertions.</p></div></body>');
            let p = one(doc, 'p');
            let textNode = p.childNodes[2]!; // " text \n for assertions."
            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 5,
                postLength: 5,
                snapToWordBoundaries: true,
            };
            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 6, options);
            expect(result).toEqual(['text ', 'for']);
        });
    });
});
