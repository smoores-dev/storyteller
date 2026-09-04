import { type Kind, MediaType } from "@storyteller-platform/media-types"

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

type AcceptSpec = {
  mediaTypes: string[]
  extensions: string[]
}

function acceptFor(...kinds: Kind[]): AcceptSpec {
  const types = kinds.flatMap((kind) => MediaType.ofKind(kind))
  return {
    mediaTypes: [
      ...(kinds.includes("audio") ? ["audio/*"] : []),
      ...types.flatMap((type) => [type.mime, ...type.aliases]),
    ],
    extensions: types.flatMap((type) => type.extensions),
  }
}

function tokens(spec: AcceptSpec): string[] {
  return [...spec.mediaTypes, ...spec.extensions]
}

function bareExtensions(spec: AcceptSpec): string[] {
  return spec.extensions.map((extension) => extension.slice(1))
}

const epub = acceptFor("ebook")
const audioOnly = acceptFor("audio")
const audio = acceptFor("audio", "archive")
const book = acceptFor("ebook", "audio", "archive")

// uppy `restrictions.allowedFileTypes`. null means no restriction.
export const epubFileTypes = isIos ? epub.mediaTypes : tokens(epub)

export const audioFileTypes = isIos ? null : tokens(audio)

export const bookFileTypes = isIos ? null : tokens(book)

// native `<input accept>` filters. undefined means "offer everything", which is
// the only setting that lets ios reach an m4b.
export const epubAccept = isIos
  ? epub.mediaTypes.join(",")
  : epub.extensions.join(",")

export const audioAccept = isIos ? undefined : tokens(audio).join(",")

export const audioOnlyAccept = tokens(audioOnly).join(",")

export const bookAccept = tokens(book).join(",")

// tauri's dialog filters want bare extensions, without the leading dot
export const epubDialogExtensions = bareExtensions(epub)

export const audioDialogExtensions = bareExtensions(audio)

export const bookDialogExtensions = bareExtensions(book)

export function matchesAccept(nameOrPath: string, accept: string): boolean {
  const extension = extensionOfPath(nameOrPath)
  const mediaType = MediaType.fromPath(nameOrPath)
  const names = mediaType ? [mediaType.mime, ...mediaType.aliases] : []

  return accept.split(",").some((raw) => {
    const token = raw.trim().toLowerCase()
    if (token === "") return false
    if (token === "*/*") return true
    if (token.startsWith(".")) return token === extension
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1)
      return names.some((name) => name.startsWith(prefix))
    }
    const wanted = MediaType.fromMime(token)
    return wanted !== null && wanted === mediaType
  })
}

function extensionOfPath(nameOrPath: string): string {
  const base = nameOrPath.slice(
    Math.max(nameOrPath.lastIndexOf("/"), nameOrPath.lastIndexOf("\\")) + 1,
  )
  const dot = base.lastIndexOf(".")
  return dot <= 0 ? "" : base.slice(dot).toLowerCase()
}
