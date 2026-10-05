import {NodeType} from './definitions/NodeType.js';

export class DomUtils {

    /**
     * Checks if an element is a metadata element that can also have body contents.
     */
    static isMetadataElementWithContent(element: Element): boolean {
        switch (element.localName) {
            case 'script':
            case 'style':
            case 'title':
                return true;
        }
        return false;
    }


    static isDocument(node: any): node is Document {
        return node && node.nodeType === NodeType.DOCUMENT_NODE;
    }

    static isDocumentFragment(node: any): node is DocumentFragment {
        return node && node.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE;
    }

    static isElement(node: any): node is Element {
        return node && node.nodeType === NodeType.ELEMENT_NODE;
    }


    static isTextNode(node: any): node is Text {
        return node && (node.nodeType === NodeType.TEXT_NODE || node.nodeType === NodeType.CDATA_SECTION_NODE);
    }

    /**
     * Get the offset of the node inside its parent.
     *
     * @param node
     */
    static getNodeIndex(node: Node): number {
        let index = 0;

        let currentNode: Node | null = node;

        while ((currentNode = currentNode.previousSibling)) {
            index++;
        }
        return index;
    }

    static getElementIndex(element: Element): number {
        let index = 0;

        while ((element = element.previousElementSibling!)) {
            index++;
        }
        return index;
    }

}
