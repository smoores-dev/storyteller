import {
  type CompletionSource,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import {
  HighlightStyle,
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import { lintGutter, lintKeymap } from "@codemirror/lint"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { EditorState, type Extension } from "@codemirror/state"
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "bold", color: "var(--studio-primary)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  {
    tag: tags.link,
    color: "var(--studio-primary)",
    textDecoration: "underline",
  },
  { tag: tags.url, color: "var(--studio-primary)" },
  { tag: tags.monospace, color: "var(--studio-muted)" },
  { tag: tags.quote, color: "var(--studio-muted)" },
  { tag: tags.meta, color: "var(--studio-faint)" },
  { tag: tags.processingInstruction, color: "var(--studio-faint)" },
  { tag: tags.contentSeparator, color: "var(--studio-faint)" },
])

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "transparent",
    color: "var(--studio-ink)",
  },
  ".cm-scroller": {
    fontFamily: "var(--studio-font-mono, ui-monospace, monospace)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--studio-ink)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--studio-raised)",
    color: "var(--studio-faint)",
    borderRight: "1px solid var(--studio-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--studio-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--studio-hover)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--studio-ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--studio-primary-soft)",
    opacity: "0.4",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--studio-raised)",
    color: "var(--studio-ink)",
    border: "1px solid var(--studio-line)",
    borderRadius: "6px",
    fontFamily: "inherit",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "inherit",
    fontSize: "13px",
    maxHeight: "280px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "4px 8px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--studio-primary)",
    color: "var(--studio-on-primary)",
  },
  ".cm-completionDetail": {
    opacity: "0.7",
    marginLeft: "8px",
    fontStyle: "normal",
  },
  ".cm-snippetField": { backgroundColor: "var(--studio-hover)" },
  ".cm-tooltip-lint": { fontFamily: "inherit", fontSize: "13px" },
  ".cm-diagnostic": { padding: "4px 8px" },
})

export function editorSetup(
  completionSources: CompletionSource[],
  ...extras: Extension[]
): Extension[] {
  return [
    lineNumbers(),
    lintGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(markdownHighlight),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    theme,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    autocompletion({ icons: false, override: completionSources }),
    ...extras,
  ]
}
