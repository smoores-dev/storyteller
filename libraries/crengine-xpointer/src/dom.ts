/**
 * The DOM this library operates on.
 *
 * crengine "xpointers" are only ever used against documents parsed by
 * `@storyteller-platform/epub`, which is built on `@xmldom/xmldom`. Everything
 * DOM-typed comes from here so that the rest of the package never reaches for
 * `lib.dom` globals, and so consumers do not need to depend on `@xmldom/xmldom`
 * themselves to name the types.
 */
export type {
  CharacterData,
  Document,
  DocumentFragment,
  Element,
  Node,
  Text,
} from "@xmldom/xmldom"
