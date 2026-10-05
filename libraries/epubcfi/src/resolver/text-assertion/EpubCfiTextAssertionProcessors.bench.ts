import {bench, describe} from 'vitest';
import {EpubCfiBuilder} from '../../builder/EpubCfiBuilder.js';
import {EpubCfiParser} from '../../parser/EpubCfiParser.js';
import {EpubCfiResolver} from '../EpubCfiResolver.js';

const words = [
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
    'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
    'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
    'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
    'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate', 'velit',
    'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat',
    'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt',
    'mollit', 'anim', 'id', 'est', 'laborum'
];

export function generateLoremIpsumCorpus(pCount: number, totalChars: number): Document {
    const charsPerP = Math.floor(totalChars / pCount);
    const doc = document.implementation.createHTMLDocument();
    
    let wordIndex = 0;
    
    for (let i = 0; i < pCount; i++) {
        const p = doc.createElement('p');
        let text = '';
        while (text.length < charsPerP) {
            const word = words[wordIndex % words.length] + wordIndex.toString(36);
            wordIndex++;
            const toAdd = text.length === 0 ? word : ' ' + word;
            if (text.length + toAdd.length > charsPerP) {
                text += toAdd.substring(0, charsPerP - text.length);
            } else {
                text += toAdd;
            }
        }
        p.textContent = text;
        doc.body.appendChild(p);
    }
    
    return doc;
}

export function buildTestEpubCfi(doc: Document, targetGlobalOffset: number, distance: number, includeAssertion: boolean = true): string {
    const builder = new EpubCfiBuilder();
    if (includeAssertion) {
        builder.setTextAssertionOptions({
            preLength: 10,
            postLength: 10,
            snapToWordBoundaries: false
        });
    }

    const target = findTargetByGlobalOffset(doc, targetGlobalOffset);
    builder.appendTerminalDomPosition(target.node, target.offset);
    const targetCfiFragment = builder.toString();

    let shiftedCfiFragment: string;

    if (distance === 0) {
        shiftedCfiFragment = targetCfiFragment;
    } else {
        const shifted = findTargetByGlobalOffset(doc, targetGlobalOffset - distance);
        const shiftedBuilder = new EpubCfiBuilder();
        shiftedBuilder.appendTerminalDomPosition(shifted.node, shifted.offset);
        const shiftedBaseFragment = shiftedBuilder.toString();

        if (includeAssertion) {
            const assertionMatch = targetCfiFragment.match(/(\[.*\])\)$/);
            const assertion = assertionMatch ? assertionMatch[1] : '';
            shiftedCfiFragment = shiftedBaseFragment.replace(/\)$/, assertion + ')');
        } else {
            shiftedCfiFragment = shiftedBaseFragment;
        }
    }

    return shiftedCfiFragment;
}

function findTargetByGlobalOffset(doc: Document, globalOffset: number): { node: Text, offset: number } {
    let current = 0;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        if (current + textNode.length > globalOffset) {
            return { node: textNode, offset: globalOffset - current };
        }
        current += textNode.length;
    }
    throw new Error('Global offset out of bounds');
}

function setupDocumentAndTarget(pCount: number, totalChars: number, targetGlobalOffset: number) {
    const doc = generateLoremIpsumCorpus(pCount, totalChars);
    return {doc, targetGlobalOffset};
}

describe('EpubCfiTextAssertionProcessors Benchmark', () => {

    const distances = [0, 100, 1000, 9900];

    describe('Small Document (800 nodes, 50k chars)', () => {
        const setup = setupDocumentAndTarget(800, 50000, 25000);
        const doc = setup.doc;
        const cfiNoAssertion = buildTestEpubCfi(doc, setup.targetGlobalOffset, 0, false);
        const cfiMap: Map<number, string> = new Map();
        
        for (const distance of distances) {
            cfiMap.set(distance, buildTestEpubCfi(doc, setup.targetGlobalOffset, distance, true));
        }

        bench(`Baseline (No Assertion), CFI: ${cfiNoAssertion}`, () => {
            const rootNode = EpubCfiParser.parse(cfiNoAssertion);
            new EpubCfiResolver(rootNode).continueResolving(doc, new URL('dummy://dummy'));
        });

        for (const distance of distances) {
            bench(`TextAssertionProcessor - Distance ${distance}, CFI: ${cfiMap.get(distance)!}`, () => {
                const rootNode = EpubCfiParser.parse(cfiMap.get(distance)!);
                new EpubCfiResolver(rootNode, { 
                    processTextAssertions: true,
                }).continueResolving(doc, new URL('dummy://dummy'));
            });
        }
    });

    describe('Large Document (8000 nodes, 500k chars)', () => {
        const setup = setupDocumentAndTarget(8000, 500000, 250000);
        const doc = setup.doc;
        const cfiNoAssertion = buildTestEpubCfi(doc, setup.targetGlobalOffset, 0, false);
        const cfiMap: Map<number, string> = new Map();
        
        for (const distance of distances) {
            cfiMap.set(distance, buildTestEpubCfi(doc, setup.targetGlobalOffset, distance, true));
        }

        bench(`Baseline (No Assertion), CFI: ${cfiNoAssertion}`, () => {
            const rootNode = EpubCfiParser.parse(cfiNoAssertion);
            new EpubCfiResolver(rootNode).continueResolving(doc, new URL('dummy://dummy'));
        });

        for (const distance of distances) {
            bench(`TextAssertionProcessor - Distance ${distance}, CFI: ${cfiMap.get(distance)!}`, () => {
                const rootNode = EpubCfiParser.parse(cfiMap.get(distance)!);
                new EpubCfiResolver(rootNode, {
                    processTextAssertions: true,
                }).continueResolving(doc, new URL('dummy://dummy'));
            });
        }

    });
});
