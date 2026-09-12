// Node-side declarations for values exchanged with the JavaScript harness.
// This file is never served to or executed by the browser.
export type FoliateView = HTMLElement & {
  renderer: HTMLElement & {
    scrollToAnchor(
      anchor: unknown,
      select?: boolean,
      smooth?: boolean,
    ): Promise<void>
  }
}

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}
export interface Geometry {
  area: number
  visibleArea: number
  ratio: number
  rects: Rect[]
  clip: Rect
}
export interface Measurement extends Geometry {
  id: string
}
export interface BookDefinition {
  sections: { id: string; html: string }[]
  dir?: "ltr" | "rtl"
  metadata?: { title?: string; language?: string }
}
export interface OpenOptions {
  book: BookDefinition
  href?: string
  width?: number
  height?: number
}
export interface ReaderSnapshot {
  sectionIndex: number | null
  messages: { name: string; body: Record<string, unknown>; at: number }[]
  relocations: {
    reason: string | null
    sectionIndex: number
    page: number
    at: number
  }[]
  page: number | null
  start: number | null
  size: number | null
}
interface ReaderHarness {
  open(options: OpenOptions): Promise<void>
  // Native-facing navigation, followed by layout settlement.
  navigate(href: string): Promise<void>
  // Direct Foliate navigation: await completion without waiting for fonts/layout.
  goTo(href: string, options?: { smooth?: boolean }): Promise<void>
  document(): Document
  fullyVisibleElementIds(): string[]
  setReflowAnchor(sectionIndex: number, id: string): void
  measure(id: string): Measurement
  geometry(range: Range): Geometry
  visibleTextRange(): Range
  settled(): Promise<void>
  afterRelocation(mark: number, reason: string): Promise<void>
  clearHighlight(): void
  highlight(id: string, seek?: boolean): Promise<void>
  reflow(options: {
    css?: string
    height?: number
    width?: number
  }): Promise<void>
  turnPage(direction?: "next" | "prev"): Promise<unknown>
  snapshot(): ReaderSnapshot
}
declare global {
  interface Window {
    reader: ReaderHarness
  }
}
