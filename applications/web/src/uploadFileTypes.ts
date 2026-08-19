// iOS doesn't support extension-based file types, and doesn't allow
// _any_ file types if one is specified
// iOS also doesn't know the mime type for .m4b files, so the only way
// to allow .m4bs is to allow all file types

const nav = typeof navigator != "undefined" ? navigator : null
const agent = (nav && nav.userAgent) || ""

const ie =
  /Edge\/(\d+)/.test(agent) ||
  /MSIE \d/.test(agent) ||
  /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.test(agent)

// Specifically checking for deprecated value on purpose
// eslint-disable-next-line @typescript-eslint/no-deprecated
const safari = !ie && !!nav && /Apple Computer/.test(nav.vendor)

// true for both iOS and iPadOS, including iPadOS's desktop-mode user agent
export const isIos =
  safari && (/Mobile\/\w+/.test(agent) || nav.maxTouchPoints > 2)

// uppy `restrictions.allowedFileTypes`. null means no restriction.
export const epubFileTypes = [
  "application/epub+zip",
  ...(isIos ? [] : [".epub"]),
]

export const audioFileTypes = isIos
  ? null
  : ["video/mp4", "audio/*", "application/zip", ".m4b", ".m4a", ".zip"]

export const bookFileTypes = isIos
  ? null
  : [...epubFileTypes, ...(audioFileTypes ?? [])]

// native `<input accept>` filters. undefined means "offer everything", which is
// the only setting that lets ios reach an m4b.
export const epubAccept = isIos ? "application/epub+zip" : ".epub"

export const audioAccept = isIos
  ? undefined
  : "audio/*,video/mp4,.m4b,.m4a,.zip"
