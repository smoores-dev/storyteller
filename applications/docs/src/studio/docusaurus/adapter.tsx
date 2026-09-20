import admonitions from "@docusaurus/mdx-loader/lib/remark/admonitions"
import details from "@docusaurus/mdx-loader/lib/remark/details"
import codeCompat from "@docusaurus/mdx-loader/lib/remark/mdx1Compat/codeCompatPlugin"
import remarkComment from "@slorber/remark-comment"
import MDXComponents from "@theme/MDXComponents"
import TabItem from "@theme/TabItem"
import Tabs from "@theme/Tabs"
import React, { type ReactNode } from "react"
import remarkEmoji from "remark-emoji"

import type { StudioAdapter } from "../core/ui/Preview"

function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <article>
      <div className="theme-doc-markdown markdown">{children}</div>
    </article>
  )
}

export const docusaurusAdapter: StudioAdapter = {
  pipeline: {
    remark: [[admonitions, true], remarkEmoji, details, remarkComment],
    remarkLast: [codeCompat],
    rehype: [],
  },
  components: {
    ...MDXComponents,
    Tabs,
    TabItem,
  } as StudioAdapter["components"],
  PreviewFrame,
}
