export const CONTENT_SECTIONING = [
  "address",
  "article",
  "aside",
  "footer",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hgroup",
  "main",
  "nav",
  "section",
  "search",
]

export const TEXT_CONTENT = [
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "hr",
  "li",
  "menu",
  "ol",
  "p",
  "pre",
  "ul",
]

export const TABLE_PARTS = [
  "table",
  "thead",
  "th",
  "tbody",
  "tr",
  "td",
  "colgroup",
  "caption",
  "tfoot",
]

export const BLOCKS = [...TEXT_CONTENT, ...CONTENT_SECTIONING, ...TABLE_PARTS]
