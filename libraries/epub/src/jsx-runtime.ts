/**
 * A JSX runtime that builds XML DOM nodes.
 *
 * Enable it per project with `jsx: "react-jsx"` and
 * `jsxImportSource: "@storyteller-platform/epub"`.
 *
 * Everything is built through {@link x}, so namespaces behave exactly as they do
 * when calling `x()` directly: a `dc:` prefix resolves to the Dublin Core
 * namespace, and an `xmlns` attribute binds the namespace it declares instead of
 * being emitted as an extra attribute.
 */

import { type Element as DomElement, type Node } from "@xmldom/xmldom"

import { x } from "./xml.ts"

/** Anything a JSX expression may place in a child position. */
export type JsxChild =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | JsxChild[]

/** Anything a JSX attribute may evaluate to. */
export type JsxAttr = string | number | boolean | null | undefined

type JsxProps = { children?: JsxChild | undefined; key?: unknown } & Record<
  string,
  JsxAttr
>

/**
 * Groups children without contributing an element.
 *
 * The result is a plain array of children, which {@link flatten} splices into
 * the parent.
 */
export function Fragment(props: {
  children?: JsxChild | undefined
}): Array<Node | string> {
  return flatten(props.children)
}

function flatten(child: JsxChild | undefined): Array<Node | string> {
  if (child === null || child === undefined || typeof child === "boolean") {
    return []
  }
  if (Array.isArray(child)) {
    return child.flatMap((c) => flatten(c))
  }
  if (typeof child === "number") {
    return [String(child)]
  }
  return [child]
}

/**
 * Attribute values follow XML, not HTML: `null`, `undefined` and `false` leave
 * the attribute off entirely, `true` writes an empty value, and numbers are
 * stringified.
 */
function attributeValue(value: Exclude<JsxAttr, null | undefined>): string {
  // Only `true` reaches here; `false` is dropped by the caller.
  if (typeof value === "boolean") return ""
  return String(value)
}

function isFragment(type: string | typeof Fragment): type is typeof Fragment {
  return type === Fragment
}

function build(
  type: string | typeof Fragment,
  props: JsxProps | null | undefined,
): DomElement {
  const { children, key: _key, ...attributes } = props ?? {}

  if (isFragment(type)) {
    return Fragment({ children }) as unknown as DomElement
  }

  const attrs: Record<string, string> = {}
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue
    attrs[name] = attributeValue(value)
  }

  return x(type, attrs, ...flatten(children))
}

export function jsx(
  type: string | typeof Fragment,
  props?: JsxProps | null,
  _key?: unknown,
): DomElement {
  return build(type, props)
}

export function jsxs(
  type: string | typeof Fragment,
  props?: JsxProps | null,
  _key?: unknown,
): DomElement {
  return build(type, props)
}

export function jsxDEV(
  type: string | typeof Fragment,
  props?: JsxProps | null,
  _key?: unknown,
): DomElement {
  return build(type, props)
}

// Required to be a namespace for jsx-runtime
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = DomElement

  export interface ElementChildrenAttribute {
    children: JsxChild
  }

  export interface IntrinsicElements {
    [name: string]: Record<string, JsxChild>
  }
}
