import type { MDXContent } from "mdx/types"
import React, {
  Component,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  type StudioConfig,
  type StudioLocation,
  buildLocationSearch,
  dirname,
  isMarkdownFile,
  joinPath,
  markdownFormat,
  resolveAssetRepoPath,
} from "../config"
import type { LineRange } from "../diff/lines"
import { titleOf } from "../frontmatter"
import {
  type CompileFailure,
  type SitePipeline,
  compileMarkdown,
} from "../mdx/compile"
import {
  SOURCE_LINE_ATTRIBUTE,
  SOURCE_LINE_END_ATTRIBUTE,
} from "../mdx/plugins/sourceLines"
import { resolveCodeImports } from "../mdx/resolveImports"

import { ASSET_SCHEME, withAssetResolution } from "./assets"
import { useDebounced } from "./hooks"

export interface StudioAdapter {
  pipeline: SitePipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, ComponentType<any>>
  PreviewFrame: ComponentType<{ children: ReactNode }>
}

interface PreviewProps {
  source: string
  file: string
  config: StudioConfig
  adapter: StudioAdapter
  location: StudioLocation
  onNavigate: (file: string) => void
  loadFile?: (file: string) => Promise<string | null>
  highlight?: LineRange[]
  knownFiles?: Set<string>
  onError?: (failure: CompileFailure | null) => void
  debounceMs?: number
  className?: string
}

class RenderBoundary extends Component<
  { resetKey: unknown; children: ReactNode; onError: (error: Error) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  componentDidUpdate(previous: { resetKey: unknown }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

export function useStudioComponents(adapter: StudioAdapter) {
  return useMemo(
    () => ({
      ...adapter.components,
      img: withAssetResolution(adapter.components.img ?? "img"),
    }),
    [adapter],
  )
}

export function Preview({
  source,
  file,
  config,
  adapter,
  location,
  onNavigate,
  loadFile,
  highlight,
  knownFiles,
  onError,
  debounceMs = 250,
  className,
}: PreviewProps) {
  const debouncedSource = useDebounced(source, debounceMs)
  const [Content, setContent] = useState<MDXContent | null>(null)
  const [failure, setFailure] = useState<CompileFailure | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [importedComponents, setImportedComponents] = useState<
    Record<string, unknown>
  >({})
  const components = useStudioComponents(adapter)
  const container = useRef<HTMLDivElement>(null)
  const compileId = useRef(0)

  const allComponents = useMemo(
    () => ({ ...components, ...importedComponents }),
    [components, importedComponents],
  )

  useEffect(() => {
    const id = ++compileId.current
    const format = markdownFormat(file)
    const resolveAsset = (url: string) => {
      const repoPath = resolveAssetRepoPath(config, file, url)
      return repoPath ? `${ASSET_SCHEME}${repoPath}` : null
    }
    const resolveLink = (url: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#")) return null
      const [path, hash] = url.split("#")
      if (!path || !isMarkdownFile(path) || path.startsWith("/")) return null
      const candidates = [
        joinPath(dirname(file), path),
        joinPath(file.split("/")[0] ?? "", path),
      ]
      const target =
        candidates.find((candidate) => knownFiles?.has(candidate)) ??
        candidates[0]!
      const search = buildLocationSearch({ ...location, file: target }, config)
      return `${config.editPath}${search}${hash ? `#${hash}` : ""}`
    }

    compileMarkdown(
      debouncedSource,
      { format, resolveAsset, resolveLink },
      adapter.pipeline,
    ).then(async (result) => {
      if (id !== compileId.current) return

      if (result.ok === false) {
        setFailure(result)
        onError?.(result)
        return
      }

      let resolved: Record<string, unknown> = {}

      if (result.codeImports.length > 0 && loadFile) {
        resolved = await resolveCodeImports(result.codeImports, file, loadFile)

        if (id !== compileId.current) return
      }

      setContent(() => result.Content)
      setImportedComponents(resolved)
      setFailure(null)
      setRuntimeError(null)
      onError?.(null)
    })
  }, [
    debouncedSource,
    file,
    config,
    adapter,
    location,
    onError,
    knownFiles,
    loadFile,
  ])

  useEffect(() => {
    const root = container.current
    if (!root) return
    const marked = root.querySelectorAll(`[${SOURCE_LINE_ATTRIBUTE}]`)
    for (const element of Array.from(marked)) {
      const start = Number(element.getAttribute(SOURCE_LINE_ATTRIBUTE))
      const end = Number(
        element.getAttribute(SOURCE_LINE_END_ATTRIBUTE) ?? start,
      )
      const hit =
        highlight?.some((range) => range.start <= end && range.end >= start) ??
        false
      element.classList.toggle("studio-changed", hit)
    }
  }, [highlight, Content])

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a")
    if (!anchor) return
    const href = anchor.getAttribute("href")
    if (!href?.startsWith(config.editPath)) return
    const url = new URL(href, window.location.origin)
    const target = url.searchParams.get("file")
    if (!target) return
    event.preventDefault()
    onNavigate(target)
  }

  const title = titleOf(source, file)
  const hasHeading = /^#\s+/m.test(source)

  return (
    <div ref={container} className={className} onClick={onClick}>
      {(failure || runtimeError) && (
        <div className="studio-preview-error" role="alert">
          {failure
            ? `${failure.line ? `line ${failure.line}: ` : ""}${failure.message}`
            : runtimeError}
        </div>
      )}
      <adapter.PreviewFrame>
        {!hasHeading && <h1>{title}</h1>}
        {Content && (
          <RenderBoundary
            resetKey={Content}
            onError={(error) => setRuntimeError(error.message)}
          >
            <Content components={allComponents} />
          </RenderBoundary>
        )}
      </adapter.PreviewFrame>
    </div>
  )
}
