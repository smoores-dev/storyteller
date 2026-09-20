import { evaluate } from "@mdx-js/mdx"
import type { MDXContent } from "mdx/types"
import * as runtime from "react/jsx-runtime"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import remarkDirective from "remark-directive"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { Pluggable, PluggableList } from "unified"

import { remarkHeadingIds } from "./plugins/headingIds"
import { rehypeSourceLines } from "./plugins/sourceLines"
import { type CodeImport, remarkStripEsm } from "./plugins/stripEsm"
import { rehypeStudioUrls } from "./plugins/studioUrls"

export interface SitePipeline {
  remark: PluggableList
  remarkLast: PluggableList
  rehype: PluggableList
}

export interface CompileContext {
  format: "md" | "mdx"
  resolveAsset: (url: string) => string | null
  resolveLink: (url: string) => string | null
}

export interface CompileSuccess {
  ok: true
  Content: MDXContent
  codeImports: CodeImport[]
}

export interface CompileFailure {
  ok: false
  message: string
  line: number | null
  column: number | null
}

export type CompileResult = CompileSuccess | CompileFailure

const MD_PASS_THROUGH = [
  "mdxFlowExpression",
  "mdxJsxFlowElement",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "mdxjsEsm",
]

export async function compileMarkdown(
  source: string,
  context: CompileContext,
  site: SitePipeline,
): Promise<CompileResult> {
  const codeImports: CodeImport[] = []

  const remarkPlugins: PluggableList = [
    [remarkFrontmatter, ["yaml"]],
    remarkDirective,
    ...site.remark,
    remarkHeadingIds,
    remarkGfm,
    remarkMath,
    [remarkStripEsm, { resolveAsset: context.resolveAsset, codeImports }],
    ...site.remarkLast,
  ]
  const rawHtml: Pluggable = [rehypeRaw, { passThrough: MD_PASS_THROUGH }]
  const rehypePlugins: PluggableList = [
    ...(context.format === "md" ? [rawHtml] : []),
    ...site.rehype,
    [
      rehypeStudioUrls,
      { resolveAsset: context.resolveAsset, resolveLink: context.resolveLink },
    ],
    rehypeSourceLines,
    rehypeKatex,
  ]
  try {
    const mod = await evaluate(source, {
      ...runtime,
      format: context.format,
      remarkPlugins,
      rehypePlugins,
      development: false,
    })
    return { ok: true, Content: mod.default, codeImports }
  } catch (error) {
    const err = error as {
      message?: string
      reason?: string
      line?: number | null
      column?: number | null
      place?: {
        line?: number
        column?: number
        start?: { line: number; column: number }
      }
    }
    const place = err.place
    const line = err.line ?? place?.line ?? place?.start?.line ?? null
    const column = err.column ?? place?.column ?? place?.start?.column ?? null
    return {
      ok: false,
      message: err.reason ?? err.message ?? String(error),
      line,
      column,
    }
  }
}
