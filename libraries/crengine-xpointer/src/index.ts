export { resolveXPointer } from "./resolveXPointer.ts"
export {
  resolveChapterXPointer,
  buildChapterXPointer,
  chapterIndexOf,
} from "./chapters.ts"
export type { ChapterOptions } from "./chapters.ts"
export { crengineView } from "./view.ts"
export type { CrengineView, CrengineViewOptions } from "./view.ts"
export type { CrengineStyleSheet } from "./cascade.ts"
export type { XPointerPosition } from "./resolveXPointer.ts"
export { buildXPointer } from "./buildXPointer.ts"
export type { XPointerOptions } from "./buildXPointer.ts"
export { parseXPointerSteps } from "./parseXPointerSteps.ts"
export type {
  XPointerChildStep,
  XPointerElementStep,
  XPointerOffsetStep,
  XPointerStep,
  XPointerTextStep,
} from "./steps.ts"
export { XPointerError } from "./XPointerError.ts"

// Re-exported so consumers do not need to depend on @xmldom/xmldom themselves.
export type {
  CharacterData,
  Document,
  DocumentFragment,
  Element,
  Node,
  Text,
} from "./dom.ts"
