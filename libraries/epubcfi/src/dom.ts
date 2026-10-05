/**
 * The DOM this library operates on.
 *
 * epubcfi is only ever used against documents parsed by `@storyteller-platform/epub`,
 * which is built on `@xmldom/xmldom`. Everything DOM-typed comes from here so that the
 * rest of the package never reaches for `lib.dom` globals.
 */
export type {
    CharacterData,
    Document,
    DocumentFragment,
    Element,
    Node,
    Text
} from '@xmldom/xmldom';
