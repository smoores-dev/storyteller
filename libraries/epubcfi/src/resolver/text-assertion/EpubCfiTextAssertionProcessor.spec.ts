import {describe, expect, it} from 'vitest';
import {EpubCfiTextAssertionProcessor} from './EpubCfiTextAssertionProcessor.js';
import {EpubCfiResolvedPath} from '../EpubCfiResolvedPath.js';

describe('EpubCfiTextAssertionProcessor', () => {


    it('should find text assertion backwards', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Before target</span><span> The </span><span>target</span><span>` + 'a'.repeat(600) + `</span><span>Start here</span>`;
        const startNode = div.childNodes[3].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 5000 });
        
        processor.processTextAssertion(path, 'The ', 'target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container).toBe(div.childNodes[2].firstChild);
        expect(path.offset).toBe(0);
    });

    it('should fail when max distance is reached without finding text', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>This is some text. </span><span>` + `a`.repeat(2000) + `</span><span> Target is here</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });
        processor.processTextAssertion(path, 'Target ', 'is here');
        
        expect(path.textAssertionFailed).toBe(true);
    });

    it('should normalize whitespace correctly across multiple nodes', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Some \n \t  text</span><span>  to \n normalize</span>`;
        const startNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 2000 });
        
        processor.processTextAssertion(path, 'Some text ', 'to normalize');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container).toBe(div.childNodes[1].firstChild);
        expect(path.offset).toBe(2);
    });

    it('should handle pre starting with a space correctly', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Before target</span><span> The </span><span>target</span>`;
        const startNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 5000 });
        
        processor.processTextAssertion(path, ' The', ' target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container).toBe(div.childNodes[1].firstChild);
        expect(path.offset).toBe(4);
    });

    it('should handle match exactly spanning the chunk boundary', () => {
        const div = document.createElement('div');
        
        for (let i = 0; i < 5; i++) {
            const span = document.createElement('span');
            span.textContent = 'a'.repeat(100);
            div.appendChild(span);
        }
        
        // This makes the 6th span have the remaining characters so the target crosses 500 boundary
        const span6 = document.createElement('span');
        span6.textContent = 'b'.repeat(96) + 'The ';
        div.appendChild(span6);

        const span7 = document.createElement('span');
        span7.textContent = 'target' + 'c'.repeat(94);
        div.appendChild(span7);

        const startNode = div.childNodes[0].firstChild as Text;
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 2000 });
        
        processor.processTextAssertion(path, 'The ', 'target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container).toBe(span7.firstChild);
        expect(path.offset).toBe(0);
    });

    it('should pick the closest match when multiple identical targets exist', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>the target</span><span>` + 'a'.repeat(100) + `</span><span>the target</span><span>` + 'b'.repeat(100) + `</span><span>the target</span>`;
        
        const startNode = div.childNodes[2].firstChild as Text; // the middle 'the target'
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 5,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });
        
        processor.processTextAssertion(path, 'the ', 'target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.container).toBe(div.childNodes[2].firstChild);
        expect(path.offset).toBe(4); // Should resolve to the middle one, offset 4 (after 'the ')
    });

    it('should not mutate path if assertion string is empty', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>test text</span>`;
        const textNode = div.firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 3,
            createResolverError: () => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });
        
        // Empty strings
        processor.processTextAssertion(path, '', '');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(false);
        expect(path.offset).toBe(3); // Unchanged
    });

    it('should process text assertion even if container is not a text node', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>test target text</span>`;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: div, // container is the div element
            offset: 0,
            createResolverError: () => {},
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });
        
        processor.processTextAssertion(path, 'test ', 'target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.container).toBe(div.childNodes[0].firstChild);
        expect(path.offset).toBe(5);
    });
    it('should fail when document boundaries are reached without finding text', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Small document.</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => {},
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 10000 });
        
        processor.processTextAssertion(path, 'Target ', 'is missing');
        
        expect(path.textAssertionFailed).toBe(true);
        expect(path.repairedWithTextAssertion).toBe(false);
    });

    it('should not find match if it is within a fetched node but beyond max distance (forward)', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Start</span><span>` + `a`.repeat(1000) + `Target is here</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 5,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 500 });
        processor.processTextAssertion(path, 'Target ', 'is here');
        
        expect(path.textAssertionFailed).toBe(true);
    });

    it('should not find match if it is within a fetched node but beyond max distance (backward)', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Target is here` + `a`.repeat(1000) + `</span><span>End</span>`;
        const textNode = div.childNodes[1].firstChild as Text;
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 500 });
        processor.processTextAssertion(path, 'Target ', 'is here');
        
        expect(path.textAssertionFailed).toBe(true);
    });

    it('should skip characters at the start of initial node if path.offset exceeds maxDistance', () => {
        const div = document.createElement('div');
        // If maxDistance is 10, offset is 20, it should skip the first 10 characters ('0123456789')
        div.innerHTML = `<span>0123456789abcdefghij Target is here</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 20,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 10 });
        // The ideal index is around the ' Target' string. The text before the target is 'abcdefghij'.
        processor.processTextAssertion(path, 'fghij ', 'Targ');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.container).toBe(textNode);
        expect(path.offset).toBe(21);
    });

    it('should use customTextAssertionMatcher and succeed when it returns a valid index', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Small document with some text.</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        let receivedParams: any = null;
        const customMatcher = (params: any) => {
            receivedParams = params;
            return 6; 
        };
        
        const processor = new EpubCfiTextAssertionProcessor({ 
            textAssertionSearchDistance: 10000,
            customTextAssertionMatcher: customMatcher
        });
        
        processor.processTextAssertion(path, 'Target ', 'is missing');
        
        expect(receivedParams).not.toBeNull();
        expect(receivedParams.pre).toBe('Target ');
        expect(receivedParams.post).toBe('is missing');
        expect(receivedParams.normalizedText).toBe('Small document with some text.');
        expect(receivedParams.idealMatchIndex).toBe(0);
        expect(receivedParams.resolvedPath).toBe(path);

        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container).toBe(textNode);
        expect(path.offset).toBe(6); 
    });

    it('should use customTextAssertionMatcher and bypass failure when it returns -2', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Small document.</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ 
            textAssertionSearchDistance: 10000,
            customTextAssertionMatcher: () => -2
        });
        
        processor.processTextAssertion(path, 'Target ', 'is missing');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
    });

    it('should use customTextAssertionMatcher and fail when it returns -1', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Small document.</span>`;
        const textNode = div.childNodes[0].firstChild as Text;
        
        let errorCreated = false;

        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 0,
            createResolverError: (_err: any) => { errorCreated = true; }
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ 
            textAssertionSearchDistance: 10000,
            customTextAssertionMatcher: () => -1
        });
        
        processor.processTextAssertion(path, 'Target ', 'is missing');
        
        expect(path.textAssertionFailed).toBe(true);
        expect(errorCreated).toBe(true);
    });

    it('should calculate idealMatchIndex correctly and pass right parameters to custom matcher', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>prev node </span><span>target node </span><span>next node</span>`;
        const textNode = div.childNodes[1].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: textNode,
            offset: 7,
            createResolverError: (_err: any) => {}
        } as any);

        let receivedParams: any = null;
        const customMatcher = (params: any) => {
            receivedParams = params;
            return 17; 
        };
        
        const processor = new EpubCfiTextAssertionProcessor({ 
            textAssertionSearchDistance: 10000,
            customTextAssertionMatcher: customMatcher
        });
        
        processor.processTextAssertion(path, 'Missing ', 'text');
        
        expect(receivedParams).not.toBeNull();
        expect(receivedParams.pre).toBe('Missing ');
        expect(receivedParams.post).toBe('text');
        expect(receivedParams.normalizedText).toBe('prev node target node next node');
        expect(receivedParams.idealMatchIndex).toBe(17); 
        expect(receivedParams.resolvedPath).toBe(path);

        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(false);
        expect(path.container).toBe(textNode);
        expect(path.offset).toBe(7);
    });

    it('should handle an empty pre assertion correctly when container is an element', () => {
        const div = document.createElement('div');
        div.innerHTML = `<p id="sibling-specs">This specification, EPUB Canonical Fragment Identifier (epubcfi), defines a standardized method for referencing arbitrary content within an EPUB® Publication through the use of fragment identifiers. </p>`;
        const pNode = div.childNodes[0] as Element;

        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: false,
            container: pNode,
            offset: 10,
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });

        processor.processTextAssertion(path, '', 'This specification,');

        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(true);
        expect(path.container.nodeType).toBe(Node.TEXT_NODE);
        expect(path.offset).toBe(0); // 'This specification,' starts at 0
    });

    it('should not update container and offset if match is ideal and position is valid', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Before   target</span>`;
        const startNode = div.childNodes[0].firstChild as Text;
        
        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 9,  // Pointing to 't' in 'target'. 'Before   target' -> 'Before target'. 'target' starts at index 7 in normalized string.
                        // But in original string, 'target' starts at 9.
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });
        
        processor.processTextAssertion(path, 'Before ', 'target');
        
        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(false); // It shouldn't have repaired it
        expect(path.container).toBe(startNode);
        expect(path.offset).toBe(9);
    });

    it('should not update container if assertion starts after whitespace and offset is inside whitespaces', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Before   target</span>`;
        const startNode = div.childNodes[0].firstChild as Text;

        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 7,  // Pointing to second whitespace between words. 'Before   target' -> 'Before target'. 'target' starts at index 7 in normalized string.
                        // But in original string, 'target' starts at 9.
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });

        processor.processTextAssertion(path, 'Before ', 'target');

        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(false); // It shouldn't have repaired it
        expect(path.container).toBe(startNode);
        expect(path.offset).toBe(7);
    });

    it('should not modify the path if pointing to end of word, start of whitespace', () => {
        const div = document.createElement('div');
        div.innerHTML = `<span>Before   target</span>`;
        const startNode = div.childNodes[0].firstChild as Text;

        const path = new EpubCfiResolvedPath({} as any, {
            stepsResolved: true,
            container: startNode,
            offset: 6,  // Pointing to first whitespace between words. 'Before   target' -> 'Before target'.
                        // First whitespace starts at index 6 in normalized string and in the original string.
            createResolverError: (_err: any) => {}
        } as any);

        const processor = new EpubCfiTextAssertionProcessor({ textAssertionSearchDistance: 1000 });

        processor.processTextAssertion(path, 'Before', ' target');

        expect(path.textAssertionFailed).toBe(false);
        expect(path.repairedWithTextAssertion).toBe(false); // It shouldn't have repaired it
        expect(path.container).toBe(startNode);
        expect(path.offset).toBe(6);
    });

});
