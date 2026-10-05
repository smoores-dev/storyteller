import {DOMParser} from '@xmldom/xmldom';
import type {Document, Element} from '../dom.js';

const parser = new DOMParser({
    onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') {
            throw new Error(`${level}: ${message}`);
        }
    },
});

export function parseDocument(xhtml: string, mimeType: string = 'application/xhtml+xml'): Document {
    return parser.parseFromString(xhtml, mimeType);
}

/**
 * xmldom has no innerHTML. This produces what `document.createElement('div')` followed by
 * `div.innerHTML = html` used to: a detached `div` holding the parsed nodes.
 */
export function parseFragment(html: string): Element {
    const document = parseDocument(
        `<html xmlns="http://www.w3.org/1999/xhtml"><body><div>${html}</div></body></html>`,
    );
    const body = document.getElementsByTagName('body').item(0)!;
    const div = body.children[0];
    body.removeChild(div);
    return div;
}

/** xmldom has no querySelector. Fixture lookups by id go through here. */
export function byId(root: Element, id: string): Element {
    const elements = root.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].getAttribute('id') === id) {
            return elements[i];
        }
    }
    throw new Error(`No element with id '${id}'`);
}

/** xmldom has no querySelectorAll. */
export function all(root: Document | Element, tagName: string): Element[] {
    return Array.from(root.getElementsByTagName(tagName));
}

/** xmldom has no querySelector. */
export function one(root: Document | Element, tagName: string): Element {
    const elements = all(root, tagName);
    if (elements.length === 0) {
        throw new Error(`No <${tagName}> element`);
    }
    return elements[0];
}
