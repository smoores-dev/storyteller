export type SnippetAction = "image" | "link"

export interface StudioSnippet {
  id: string
  label: string
  detail: string
  keywords?: string[]
  template?: string
  action?: SnippetAction
  mdxOnly?: boolean
  imports?: string[]
}

export const ADMONITION_TYPES = [
  "note",
  "tip",
  "info",
  "warning",
  "danger",
] as const

export type AdmonitionType = (typeof ADMONITION_TYPES)[number]

export function admonitionTemplate(type: AdmonitionType) {
  return `:::${type}[\${1:Title}]\n\n\${2:Text}\n\n:::\n`
}

export const TABS_IMPORTS = [
  'import Tabs from "@theme/Tabs"',
  'import TabItem from "@theme/TabItem"',
]

export const SNIPPETS: StudioSnippet[] = [
  {
    id: "h2",
    label: "Heading 2",
    detail: "Section",
    keywords: ["h2", "section"],
    template: "## ${1:Heading}\n\n${2}",
  },
  {
    id: "h3",
    label: "Heading 3",
    detail: "Subsection",
    keywords: ["h3", "subsection"],
    template: "### ${1:Heading}\n\n${2}",
  },
  {
    id: "h4",
    label: "Heading 4",
    detail: "Minor heading",
    keywords: ["h4"],
    template: "#### ${1:Heading}\n\n${2}",
  },
  {
    id: "link",
    label: "Link to a page",
    detail: "Pick another docs page or a section",
    keywords: ["link", "page", "href"],
    action: "link",
  },
  {
    id: "image",
    label: "Image",
    detail: "Upload from your computer",
    keywords: ["img", "picture", "screenshot"],
    action: "image",
  },
  ...ADMONITION_TYPES.map((type) => ({
    id: `admonition-${type}`,
    label: `${type[0]!.toUpperCase()}${type.slice(1)} admonition`,
    detail: `:::${type} callout`,
    keywords: ["admonition", "callout", type],
    template: admonitionTemplate(type),
  })),
  {
    id: "code",
    label: "Code block",
    detail: "Fenced code with a language",
    keywords: ["code", "fence", "shell", "bash"],
    template: "```${1:bash}\n${2}\n```\n",
  },
  {
    id: "table",
    label: "Table",
    detail: "Two columns, two rows",
    keywords: ["table", "grid"],
    template:
      "| ${1:Column} | ${2:Column} |\n| --- | --- |\n| ${3:Cell} | ${4:Cell} |\n| ${5:Cell} | ${6:Cell} |\n",
  },
  {
    id: "bullets",
    label: "Bullet list",
    detail: "Unordered list",
    keywords: ["list", "ul", "bullet"],
    template: "- ${1:Item}\n- ${2:Item}\n",
  },
  {
    id: "numbered",
    label: "Numbered list",
    detail: "Ordered list",
    keywords: ["list", "ol", "numbered", "steps"],
    template: "1. ${1:Step}\n2. ${2:Step}\n",
  },
  {
    id: "quote",
    label: "Quote",
    detail: "Block quote",
    keywords: ["quote", "blockquote"],
    template: "> ${1:Quote}\n",
  },
  {
    id: "details",
    label: "Collapsible details",
    detail: "Expandable section",
    keywords: ["details", "summary", "collapse", "expand"],
    template:
      "<details>\n<summary>${1:Summary}</summary>\n\n${2:Content}\n\n</details>\n",
  },
  {
    id: "tabs",
    label: "Tabs",
    detail: "Tabbed content (MDX only)",
    keywords: ["tabs", "tabitem"],
    mdxOnly: true,
    imports: TABS_IMPORTS,
    template:
      '<Tabs>\n  <TabItem value="${1:first}" label="${2:First}">\n\n${3:Content}\n\n  </TabItem>\n  <TabItem value="${4:second}" label="${5:Second}">\n\n${6:Content}\n\n  </TabItem>\n</Tabs>\n',
  },
  {
    id: "hr",
    label: "Divider",
    detail: "Horizontal rule",
    keywords: ["hr", "rule", "divider", "separator"],
    template: "---\n\n${1}",
  },
]

export function snippetsFor(format: "md" | "mdx"): StudioSnippet[] {
  return SNIPPETS.filter((snippet) => format === "mdx" || !snippet.mdxOnly)
}
