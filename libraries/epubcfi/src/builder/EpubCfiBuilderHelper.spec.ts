import {describe, expect, it} from 'vitest';
import {NodeType} from '../common/definitions/NodeType.js';
import {DomUtils} from '../common/DomUtils.js';
import {EpubCfiOffsetType} from '../model/offset/EpubCfiOffsetType.js';
import {IEpubCfiCharacterOffsetNode} from '../model/offset/IEpubCfiCharacterOffsetNode.js';
import {EpubCfiBuilderHelper} from './EpubCfiBuilderHelper.js';
import {IEpubCfiBuilderTextAssertionOptions} from './IEpubCfiBuilderTextAssertionOptions.js';
// @ts-ignore
import testXhtml from './test-data/example-doc.xhtml?raw';

describe('EpubCfiBuilderHelper', () => {
    describe('buildLocalPathToElement', () => {
        it('should report the path from HTML root down to element', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');

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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');
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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');
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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');
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

    describe('appendTerminalDomRange', () => {
        it('should create range path to a container element', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');
            let paragraphElement = doc.getElementById('paragraph-2')!;

            let range = doc.createRange();
            range.selectNode(paragraphElement);

            let rootNode = EpubCfiBuilderHelper.appendTerminalDomRange(range);

            let parentLocalPath = rootNode.parentPath!.localPaths[0];
            expect(parentLocalPath.steps.length).toBe(2);
            expect(parentLocalPath.steps[0].stepValue).toBe(4);
            expect(parentLocalPath.steps[1].stepValue).toBe(2);
            expect(parentLocalPath.indirection).toBeFalsy();
            expect(rootNode.parentPath!.offset).toBeNull();

            let rangeStartLocalPath = rootNode.rangeStartPath!.localPaths[0];
            expect(rangeStartLocalPath.steps.length).toBe(1);
            expect(rangeStartLocalPath.steps[0].stepValue).toBe(6);
            expect(rangeStartLocalPath.steps[0].assertion).toEqual({
                values: ['paragraph-2'],
                parameters: [],
            });

            let rangeEndLocalPath = rootNode.rangeEndPath!.localPaths[0];
            expect(rangeEndLocalPath.steps.length).toBe(1);
            expect(rangeEndLocalPath.steps[0].stepValue).toBe(7);
            expect(rootNode.rangeEndPath!.offset).toEqual({
                type: EpubCfiOffsetType.CHARACTER,
                characterOffset: 0,
                assertion: null,
            } as IEpubCfiCharacterOffsetNode);
        });

        it('should create range path to a character range within Text', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString(testXhtml, 'application/xhtml+xml');
            let paragraphElement = doc.getElementById('paragraph-2')!;

            let textNode = paragraphElement.childNodes[0];
            expect(textNode.nodeType).toBe(NodeType.TEXT_NODE);

            let range = doc.createRange();
            range.setStart(textNode, 4);
            range.setEnd(textNode, 9);

            expect(range.toString()).toBe('graph');

            let rootNode = EpubCfiBuilderHelper.appendTerminalDomRange(range);

            let parentLocalPath = rootNode.parentPath!.localPaths[0];
            expect(parentLocalPath.steps.length).toBe(4);
            expect(parentLocalPath.steps[0].stepValue).toBe(4);
            expect(parentLocalPath.steps[1].stepValue).toBe(2);
            expect(parentLocalPath.steps[2].stepValue).toBe(6);
            expect(parentLocalPath.steps[3].stepValue).toBe(1);
            expect(parentLocalPath.indirection).toBeFalsy();
            expect(rootNode.parentPath!.offset).toBeNull();

            expect(rootNode.rangeStartPath!.localPaths.length).toBe(0);
            expect(rootNode.rangeStartPath!.offset).toEqual({
                type: EpubCfiOffsetType.CHARACTER,
                characterOffset: 4,
                assertion: null,
            } as IEpubCfiCharacterOffsetNode);

            expect(rootNode.rangeEndPath!.localPaths.length).toBe(0);
            expect(rootNode.rangeEndPath!.offset).toEqual({
                type: EpubCfiOffsetType.CHARACTER,
                characterOffset: 9,
                assertion: null,
            } as IEpubCfiCharacterOffsetNode);
        });
    });

    describe('getTextContextAroundNode', () => {
        it('should correctly gather text crossing inline elements and snap to words', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><div><p>This is an <b>example</b> text for assertions.</p></div></body>', 'application/xhtml+xml');
            let p = doc.querySelector('p')!;
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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><div><p>This is an <b>example</b> text for assertions.</p></div></body>', 'application/xhtml+xml');
            let p = doc.querySelector('p')!;
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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><p>Some text</p></body>', 'application/xhtml+xml');
            let textNode = doc.querySelector('p')!.firstChild!;

            let options: IEpubCfiBuilderTextAssertionOptions = {
                preLength: 0,
                postLength: 0,
            };

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 4, options);
            expect(result).toBeNull();
        });

        it('should return null when options are omitted', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><p>Some text</p></body>', 'application/xhtml+xml');
            let textNode = doc.querySelector('p')!.firstChild!;

            let result = EpubCfiBuilderHelper.getTextContextAroundNode(textNode, 4, undefined);
            expect(result).toBeNull();
        });

        it('should gathering text at block element boundaries', () => {
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><div><p>Para one.</p><p>Para two.</p></div></body>', 'application/xhtml+xml');
            let p = doc.querySelectorAll('p')[1]!;
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
            const domParser = new DOMParser();
            // A long string without spaces
            const doc = domParser.parseFromString('<body><p>Thisisaverylongstringwithoutanyspacesinit.</p></body>', 'application/xhtml+xml');
            let textNode = doc.querySelector('p')!.firstChild!;

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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><div><span>text before</span><script>const x = 1;</script><p>text</p><style>.a {}</style><p>text after</p></div></body>', 'application/xhtml+xml');
            let p = doc.querySelector('p')!;
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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><p>  Leading space and trailing  </p></body>', 'application/xhtml+xml');
            let textNode = doc.querySelector('p')!.firstChild!;

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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><p>   Lots \n of \t space   </p></body>', 'application/xhtml+xml');
            let textNode = doc.querySelector('p')!.firstChild!;

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
            const domParser = new DOMParser();
            const doc = domParser.parseFromString('<body><div><p>This is an <b>example</b> text \n for assertions.</p></div></body>', 'application/xhtml+xml');
            let p = doc.querySelector('p')!;
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
