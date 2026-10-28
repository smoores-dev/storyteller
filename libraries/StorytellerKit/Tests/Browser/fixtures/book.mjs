// Adapt serializable test content to Foliate's book interface. EPUB parsing is
// deliberately bypassed; parser tests should open real files instead.
export function makeBook({ sections: sources, dir = "ltr", metadata = {} }) {
  if (!sources.length)
    throw new Error("A fixture book needs at least one section")
  if (new Set(sources.map(({ id }) => id)).size !== sources.length)
    throw new Error("Fixture section IDs must be unique")
  const sections = sources.map(({ id, html, linear }) => {
    let url
    // Relative assets resolve against the harness server, not the blob URL.
    const document = new DOMParser().parseFromString(html, "text/html")
    if (!document.querySelector("base")) {
      const base = document.createElement("base")
      base.href = new URL(id, location.origin).href
      document.head.prepend(base)
    }
    const source = "<!doctype html>" + document.documentElement.outerHTML
    return {
      id,
      linear,
      size: source.length,
      load() {
        url ??= URL.createObjectURL(new Blob([source], { type: "text/html" }))
        return url
      },
      unload() {
        if (url) URL.revokeObjectURL(url)
        url = undefined
      },
    }
  })
  return {
    dir,
    metadata: { title: "Browser test book", language: "en", ...metadata },
    sections,
    resolveHref(href) {
      const [path, fragment] = href.split("#")
      const index = sections.findIndex((section) => section.id === path)
      if (index < 0) throw new Error(`Unknown fixture section: ${path}`)
      return {
        index,
        anchor: (doc) =>
          fragment ? doc.getElementById(decodeURIComponent(fragment)) : 0,
      }
    },
    splitTOCHref: (href) => href.split("#"),
    getTOCFragment: (doc, id) => doc.getElementById(decodeURIComponent(id)),
  }
}
