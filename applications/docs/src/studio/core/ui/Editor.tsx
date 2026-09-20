import { Compartment, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"

import { type BlameRange, blameGutter } from "../editor/blame"
import { type LinkContext, linkCompletion } from "../editor/linkCompletion"
import { type LintContext, forceLinting, studioLinter } from "../editor/lint"
import { editorSetup } from "../editor/setup"
import { slashCompletion } from "../editor/slashMenu"
import { type SnippetAction, snippetsFor } from "../editor/snippets"

export interface EditorHandle {
  view: () => EditorView | null
  insertAtCursor: (text: string) => void
  scrollToLine: (line: number) => void
  focus: () => void
}

interface EditorProps {
  value: string
  format: "md" | "mdx"
  onChange: (value: string) => void
  onImageFiles: (files: File[]) => void
  onAction: (action: SnippetAction) => void
  lintContext: LintContext | null
  linkContext: LinkContext | null
  readOnly?: boolean
  blame?: BlameRange[] | null
}

function imageFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return []
  return Array.from(transfer.files).filter((file) =>
    file.type.startsWith("image/"),
  )
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    value,
    format,
    onChange,
    onImageFiles,
    onAction,
    lintContext,
    linkContext,
    readOnly = false,
    blame = null,
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onImageFilesRef = useRef(onImageFiles)
  const onActionRef = useRef(onAction)
  const formatRef = useRef(format)
  const lintRef = useRef(lintContext)
  const linkRef = useRef(linkContext)
  const readOnlyCompartment = useRef(new Compartment())
  const blameCompartment = useRef(new Compartment())
  onChangeRef.current = onChange
  onImageFilesRef.current = onImageFiles
  onActionRef.current = onAction
  formatRef.current = format
  linkRef.current = linkContext

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...editorSetup([
          slashCompletion(
            () => snippetsFor(formatRef.current),
            (action) => onActionRef.current(action),
          ),
          linkCompletion(() => linkRef.current),
        ]),
        studioLinter(() => lintRef.current),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        blameCompartment.current.of(blame ? blameGutter(blame) : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged)
            onChangeRef.current(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          paste: (event) => {
            const files = imageFiles(event.clipboardData)
            if (files.length === 0) return false
            event.preventDefault()
            onImageFilesRef.current(files)
            return true
          },
          drop: (event) => {
            const files = imageFiles(event.dataTransfer)
            if (files.length === 0) return false
            event.preventDefault()
            onImageFilesRef.current(files)
            return true
          },
        }),
      ],
    })
    const instance = new EditorView({ state, parent: host.current })
    view.current = instance
    return () => {
      instance.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instance = view.current
    if (!instance) return
    const current = instance.state.doc.toString()
    if (current === value) return
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    })
  }, [readOnly])

  useEffect(() => {
    view.current?.dispatch({
      effects: blameCompartment.current.reconfigure(
        blame ? blameGutter(blame) : [],
      ),
    })
  }, [blame])

  useEffect(() => {
    lintRef.current = lintContext
    if (view.current) forceLinting(view.current)
  }, [lintContext])

  useImperativeHandle(ref, () => ({
    view: () => view.current,
    insertAtCursor: (text) => {
      const instance = view.current
      if (!instance) return
      const { from, to } = instance.state.selection.main
      instance.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      })
      instance.focus()
    },
    scrollToLine: (line) => {
      const instance = view.current
      if (!instance) return
      const clamped = Math.max(1, Math.min(line, instance.state.doc.lines))
      const position = instance.state.doc.line(clamped).from
      instance.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      })
      instance.focus()
    },
    focus: () => view.current?.focus(),
  }))

  return <div ref={host} className="studio-editor-host min-h-0 flex-1" />
})
