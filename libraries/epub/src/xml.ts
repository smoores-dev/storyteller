import xmldom, {
  type Document,
  type CharacterData,
  type Element,
  type Node,
  type Text,
  type DocumentType,
} from "@xmldom/xmldom"
import { customAlphabet } from "nanoid"

// XML IDs can't start with numbers or symbols. Only use characters for simplicity
export const xmlId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  22,
)

const { DOMParser } = xmldom

export const { XMLSerializer } = xmldom

export function isElement(n: Node): n is Element {
  return n.nodeType === 1
}

export function isText(n: Node): n is CharacterData {
  return n.nodeType === 3
}

export function isCdata(n: Node): n is CharacterData {
  return n.nodeType === 4
}

export function isComment(n: Node): n is CharacterData {
  return n.nodeType === 8
}

/**
 * `namespaceURI` is readonly in the type definitions, but xmldom keeps it as a
 * plain field, so it can be written. The cast is unsound, which is why it lives
 * here and nowhere else.
 */
type NamespaceWritable = { namespaceURI: string | null }

function setNamespace(element: Element, namespace: string) {
  ;(element as unknown as NamespaceWritable).namespaceURI = namespace
}

/**
 * Give every element in `node`'s subtree the namespace its position implies,
 * without overwriting any element that already has one.
 *
 * @privateremarks
 *
 * `x()` builds elements in no namespace. That serializes correctly, because a
 * child in no namespace inherits the enclosing default namespace on the way
 * out, but in memory the elements report `namespaceURI === null` and so are
 * invisible to namespace-aware queries such as `getElementsByTagNameNS`.
 * Calling this after inserting a node makes the tree report the namespace its
 * position implies.
 */
export function adoptNamespaces(node: Element): void {
  const { parentNode } = node
  const inherited =
    parentNode && isElement(parentNode) ? parentNode.namespaceURI : null

  if (inherited && !node.namespaceURI) {
    setNamespace(node, inherited)
  }

  for (const child of Array.from(node.children)) {
    adoptNamespaces(child)
  }
}

/**
 * Declare `uri` as the default namespace of `element` and bring the elements
 * already under it in line with that declaration.
 *
 * xmldom records a namespace declaration without applying it to the tree, so a
 * document read without `xmlns` stays in no namespace in memory even once the
 * declaration is added. Namespace-aware lookups cannot see any of it until the
 * subtree is fixed up, and the document element has no element parent for
 * `adoptNamespaces` to inherit from, so it has to be bound explicitly.
 */
export function declareDefaultNamespace(element: Element, uri: string): void {
  element.setAttributeNS(NS.xmlns, "xmlns", uri)
  setNamespace(element, uri)
  adoptNamespaces(element)
}

/**
 * Insert `child` into `parent`, then adopt its namespace.
 *
 * If `reference` is omitted, appends child to parent.
 */
export function insert<T extends Node>(
  parent: Element,
  child: T,
  reference?: Node | null,
): T {
  parent.insertBefore(child, reference ?? null)

  if (isElement(child)) adoptNamespaces(child)

  return child
}

/**
 * Replace `oldChild` with `newChild` in `parent`, then adopt the new child's
 * namespace.
 */
export function replace<T extends Node>(
  parent: Element,
  newChild: T,
  oldChild: Node,
): T {
  parent.replaceChild(newChild, oldChild)

  if (isElement(newChild)) adoptNamespaces(newChild)

  return newChild
}

/**
 * Given an XHTML document, return the body element.
 */
export function getXhtmlBody(document: Document): Element {
  const html = document.documentElement
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = html.getElementsByTagName("body").item(0)
  if (!body) throw new Error("Invalid XHTML document: No body element")

  return body
}

/**
 * Given an Element, find the first child matching
 * the provided namespace, name and optional filter.
 */
export function findXmlChildByNameNS(
  namespaceUri: string | null,
  name: string,
  element: Element,
  filter?: (node: Element) => boolean,
): Element | undefined {
  for (const child of Array.from(element.children)) {
    if (
      (!namespaceUri || namespaceUri === child.namespaceURI) &&
      name === child.localName &&
      (!filter || filter(child))
    ) {
      return child
    }
  }

  return undefined
}

/**
 * Given an Element, find the first child matching
 * the provided name and optional filter.
 */
export function findXmlChildByName(
  name: string,
  element: Element,
  filter?: (node: Element) => boolean,
): Element | undefined {
  return findXmlChildByNameNS(null, name, element, filter)
}

/**
 * Given an Element, find the first descendant matching
 * the provided name and optional filter.
 *
 * Will perform a breadth first search for the element, returning
 * the highest element in the tree matching the name and filter.
 */
export function findXmlDescendantByNameNS(
  namespaceUri: string | null,
  name: string,
  element: Element,
  filter?: (node: Element) => boolean,
): Element | undefined {
  const queue = Array.from(element.children)

  while (queue.length > 0) {
    const candidate = queue.shift()
    if (!candidate) continue
    if (
      (!namespaceUri || candidate.namespaceURI === namespaceUri) &&
      candidate.localName === name &&
      (!filter || filter(candidate))
    ) {
      return candidate
    }
    queue.push(...Array.from(candidate.children))
  }

  return undefined
}

/**
 * Given an Element, find the first descendant matching
 * the provided name and optional filter.
 *
 * Will perform a breadth first search for the element, returning
 * the highest element in the tree matching the name and filter.
 */
export function findXmlDescendantByName(
  name: string,
  element: Element,
  filter?: (node: Element) => boolean,
): Element | undefined {
  return findXmlDescendantByNameNS(null, name, element, filter)
}

/**
 * Given an XHTML document, add a `link` element to the
 * `head` of the document.
 */
export function addLinkToXhtmlHead(
  document: Document,
  link: { rel: string; href: string; type: string },
) {
  const html = document.documentElement
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const head = html.getElementsByTagName("head").item(0)
  if (!head) throw new Error("Invalid XHTML document: no head element")

  const linkEl = document.createElement("link")
  linkEl.setAttribute("rel", link.rel)
  linkEl.setAttribute("href", link.href)
  linkEl.setAttribute("type", link.type)

  head.appendChild(linkEl)
}

export type XmlDiagnostic = {
  /* "error" == recoverable, still parsed, "fatalError" == non-recoverable */
  level: "warning" | "error" | "fatalError"
  message: string
  line?: number | undefined
  column?: number | undefined
}

export function parse(
  xml: string,
  mediaType: string,
  onError?: (diagnostic: XmlDiagnostic) => void,
): Document {
  // A byte order mark ahead of the XML declaration is legal in a file, but once
  // the file has been decoded into a string the mark occupies offset 0, and
  // xmldom then rejects the declaration for not being at the start.
  const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml

  return new DOMParser({
    onError: (level, message) => {
      onError?.({
        level,
        message,
      })
    },
  }).parseFromString(source, mediaType)
}

export function serialize(
  doc: Node,
  options?: { validate?: boolean | undefined },
): string {
  const serialized = new XMLSerializer().serializeToString(doc)
  if (options?.validate) {
    new DOMParser({
      onError: (level, message) => {
        if (level === "error" || level === "fatalError") {
          throw new Error(message)
        }
      },
    }).parseFromString(serialized, "text/xml")
  }
  return serialized
}

const xmlDoc = new DOMParser({ onError: () => {} }).parseFromString(
  "<root/>",
  "text/xml",
)

export const NS = {
  xmlns: "http://www.w3.org/2000/xmlns/",
  xml: "http://www.w3.org/XML/1998/namespace",
  xhtml: "http://www.w3.org/1999/xhtml",
  opf: "http://www.idpf.org/2007/opf",
  dc: "http://purl.org/dc/elements/1.1/",
  epub: "http://www.idpf.org/2007/ops",
}

const nsPrefixes = Object.keys(NS) as (keyof typeof NS)[]

export function x(
  name: string,

  attributes?: Record<string, string | undefined> | null,
  ...children: Array<Node | string | null | undefined>
): Element {
  if (name === "xmlns" || name.startsWith("xmlns:")) {
    throw new Error(`Invalid element name ${name}`)
  }

  const nameNs = nsPrefixes.find((prefix) => name.startsWith(`${prefix}:`))

  const element = nameNs
    ? xmlDoc.createElementNS(NS[nameNs], name)
    : xmlDoc.createElement(name)

  for (const [attrName, value] of Object.entries(attributes ?? {})) {
    if (value === undefined) continue

    const attrNs =
      attrName === "xmlns"
        ? "xmlns"
        : nsPrefixes.find((prefix) => attrName.startsWith(`${prefix}:`))

    if (attrNs) {
      element.setAttributeNS(NS[attrNs], attrName, value)
    } else {
      element.setAttribute(attrName, value)
    }
  }

  // An `xmlns` attribute declares this element's own default namespace, but
  // xmldom does not bind it the way the DOM requires. Without this the element
  // reports `namespaceURI === null`, so `adoptNamespaces` re-declares over the
  // top of it: the output carries two `xmlns` attributes, which fails to parse
  // (`Attribute xmlns redefined`), and the element lands in the wrong namespace.
  const defaultNamespace = (attributes ?? {})["xmlns"]
  if (defaultNamespace !== undefined) {
    setNamespace(element, defaultNamespace)
  }

  for (const child of children) {
    if (child == null) continue
    if (typeof child === "string") {
      element.appendChild(xmlDoc.createTextNode(child))
    } else {
      element.appendChild(child)
    }
  }

  return element
}

export function text(data: string): Text {
  return xmlDoc.createTextNode(data)
}

export function createDocument(
  namespaceUri: string | null,
  qualifiedName: string,
  docType?: DocumentType | null,
): Document {
  return xmlDoc.implementation.createDocument(
    namespaceUri,
    qualifiedName,
    docType,
  )
}

export function createDocumentType(
  qualifiedName: string,
  publicId?: string,
  systemId?: string,
): DocumentType {
  return xmlDoc.implementation.createDocumentType(
    qualifiedName,
    publicId,
    systemId,
  )
}
