import type { ExclusionVerdict, SpineZone } from "./exclusions.ts"

export type ExclusionRule = {
  source: "landmark" | "content-type" | "guide" | "filename"
  match: string
  verdict: ExclusionVerdict
  zones?: SpineZone[]
  division?: boolean
}

const STRUCTURAL_TYPES = [
  "cover",
  "titlepage",
  "halftitlepage",
  "toc",
  "toc-brief",
  "landmarks",
  "page-list",
  "loi",
  "lot",
  "loa",
  "lov",
  "index",
  "glossary",
  "bibliography",
  "copyright-page",
  "colophon",
  "contributors",
  "seriespage",
  "imprint",
  "imprimatur",
  "errata",
  "revision-history",
  "other-credits",
  "footnote",
  "footnotes",
  "endnote",
  "endnotes",
  "rearnote",
  "rearnotes",
]

const SOMETIMES_NARRATED_TYPES = [
  "dedication",
  "epigraph",
  "acknowledgments",
  "acknowledgements",
  "foreword",
  "preface",
  "introduction",
  "appendix",
  "afterword",
  "preamble",
  "abstract",
]

const NARRATED_TYPES = [
  "chapter",
  "part",
  "volume",
  "division",
  "prologue",
  "epilogue",
  "conclusion",
]

function types(
  source: "landmark" | "content-type",
  values: string[],
  verdict: ExclusionVerdict,
): ExclusionRule[] {
  return values.map((match) => ({ source, match, verdict }))
}

function divisions(source: "landmark" | "content-type"): ExclusionRule[] {
  return [
    { source, match: "frontmatter", verdict: "review", division: true },
    { source, match: "bodymatter", verdict: "include", division: true },
    { source, match: "backmatter", verdict: "review", division: true },
  ]
}

function guide(match: string, verdict: ExclusionVerdict): ExclusionRule {
  return { source: "guide", match, verdict }
}

function filename(
  match: string,
  verdict: ExclusionVerdict,
  zones: SpineZone[] = ["front", "back"],
): ExclusionRule {
  return { source: "filename", match, verdict, zones }
}

export const EXCLUSION_RULES: ExclusionRule[] = [
  ...types("landmark", STRUCTURAL_TYPES, "exclude"),
  ...types("landmark", SOMETIMES_NARRATED_TYPES, "review"),
  ...types("landmark", NARRATED_TYPES, "include"),
  ...divisions("landmark"),

  ...types("content-type", STRUCTURAL_TYPES, "exclude"),
  ...types("content-type", SOMETIMES_NARRATED_TYPES, "review"),
  ...types("content-type", NARRATED_TYPES, "include"),
  ...divisions("content-type"),

  guide("cover", "exclude"),
  guide("title-page", "exclude"),
  guide("toc", "exclude"),
  guide("index", "exclude"),
  guide("glossary", "exclude"),
  guide("bibliography", "exclude"),
  guide("colophon", "exclude"),
  guide("copyright-page", "exclude"),
  guide("loi", "exclude"),
  guide("lot", "exclude"),
  guide("notes", "exclude"),
  guide("acknowledgements", "review"),
  guide("dedication", "review"),
  guide("epigraph", "review"),
  guide("foreword", "review"),
  guide("preface", "review"),

  filename("cover", "exclude"),
  filename("titlepage", "exclude"),
  filename("title page", "exclude"),
  filename("halftitle", "exclude"),
  filename("half title", "exclude"),
  filename("copyright", "exclude"),
  filename("toc", "exclude"),
  filename("contents", "exclude"),
  filename("index", "exclude", ["back"]),
  filename("glossary", "exclude"),
  filename("bibliography", "exclude"),
  filename("colophon", "exclude"),
  filename("praise", "exclude"),
  filename("map", "exclude"),
  filename("maps", "exclude"),
  filename("about the author", "exclude"),
  filename("about author", "exclude"),
  filename("author bio", "exclude"),
  filename("about the publisher", "exclude"),
  filename("about publisher", "exclude"),
  filename("also by", "exclude"),
  filename("alsoby", "exclude"),
  filename("backad", "exclude"),
  filename("torad", "exclude"),
  filename("newsletter", "exclude"),
  filename("signup", "exclude"),
  filename("sign up", "exclude"),
  filename("next reads", "exclude"),
  filename("discover page", "exclude"),
  filename("teaser", "exclude", ["back"]),
  filename("excerpt", "exclude", ["back"]),
  filename("preview", "exclude", ["back"]),
  filename("credits", "exclude", ["back"]),
  filename("contributors", "exclude"),
  filename("series", "exclude", ["back"]),
  filename("imprint", "exclude"),
  filename("legal", "exclude"),
  filename("notice", "exclude", ["front"]),
  filename("endnotes", "exclude", ["back"]),
  filename("footnotes", "exclude", ["back"]),
  filename("loi", "exclude"),
  filename("lot", "exclude"),
  filename("lof", "exclude"),
  filename("dedication", "review"),
  filename("epigraph", "review"),
  filename("acknowledgments", "review"),
  filename("acknowledgements", "review"),
  filename("acknowledgment", "review"),
  filename("acknowledgement", "review"),
  filename("ack", "review"),
  filename("acks", "review"),
  filename("appendix", "review"),
  filename("foreword", "review"),
  filename("preface", "review"),
  filename("introduction", "review"),
  filename("intro", "review"),
  filename("afterword", "review"),
  filename("extract", "review", ["back"]),
]

export const FILENAME_TEMPLATES = [/^index[-_]?\d*[-_]split[-_]\d+$/i]
