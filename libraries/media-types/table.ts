export const MEDIA_KINDS = [
  "audio",
  "image",
  "ebook",
  "archive",
  "package",
  "manifest",
  "font",
  "data",
] as const
export type Kind = (typeof MEDIA_KINDS)[number]

export interface MediaTypeRow {
  readonly name: string
  readonly kind: Kind
  readonly extensions: readonly string[]
  readonly aliases: readonly string[]
  readonly cover?: true
}

export const TABLE = {
  "audio/mpeg": {
    name: "MPEG_AUDIO",
    kind: "audio",
    extensions: [".mp3"],
    aliases: [],
  },
  "audio/mp4": {
    name: "MP4_AUDIO",
    kind: "audio",
    extensions: [".mp4", ".m4a", ".m4b"],
    aliases: ["video/mp4", "application/mp4"],
  },
  "audio/aac": {
    name: "AAC_AUDIO",
    kind: "audio",
    extensions: [".aac"],
    aliases: [],
  },
  "audio/ogg": {
    name: "OGG_AUDIO",
    kind: "audio",
    extensions: [".ogg", ".oga", ".mogg"],
    aliases: [],
  },
  "audio/opus": {
    name: "OPUS_AUDIO",
    kind: "audio",
    extensions: [".opus"],
    aliases: [],
  },
  "audio/wav": {
    name: "WAV_AUDIO",
    kind: "audio",
    extensions: [".wav"],
    aliases: [],
  },
  "audio/aiff": {
    name: "AIFF_AUDIO",
    kind: "audio",
    extensions: [".aiff"],
    aliases: [],
  },
  "audio/flac": {
    name: "FLAC_AUDIO",
    kind: "audio",
    extensions: [".flac"],
    aliases: [],
  },
  "audio/x-alac": {
    name: "ALAC_AUDIO",
    kind: "audio",
    extensions: [".alac"],
    aliases: [],
  },
  "audio/webm": {
    name: "WEBM_AUDIO",
    kind: "audio",
    extensions: [".weba"],
    aliases: [],
  },

  "image/jpeg": {
    name: "JPEG",
    kind: "image",
    extensions: [".jpeg", ".jpg"],
    aliases: [],
    cover: true,
  },
  "image/png": {
    name: "PNG",
    kind: "image",
    extensions: [".png"],
    aliases: [],
    cover: true,
  },
  "image/webp": {
    name: "WEBP",
    kind: "image",
    extensions: [".webp"],
    aliases: [],
    cover: true,
  },
  "image/avif": {
    name: "AVIF",
    kind: "image",
    extensions: [".avif"],
    aliases: [],
    cover: true,
  },
  "image/svg+xml": {
    name: "SVG",
    kind: "image",
    extensions: [".svg"],
    aliases: [],
    cover: true,
  },
  "image/gif": {
    name: "GIF",
    kind: "image",
    extensions: [".gif"],
    aliases: [],
  },
  "image/tiff": {
    name: "TIFF",
    kind: "image",
    extensions: [".tiff", ".tif"],
    aliases: [],
  },
  "image/bmp": {
    name: "BMP",
    kind: "image",
    extensions: [".bmp"],
    aliases: [],
  },
  "image/heif": {
    name: "HEIF",
    kind: "image",
    extensions: [".heif"],
    aliases: [],
  },
  "image/heic": {
    name: "HEIC",
    kind: "image",
    extensions: [".heic"],
    aliases: [],
  },
  "image/jp2": {
    name: "JP2",
    kind: "image",
    extensions: [".jp2"],
    aliases: [],
  },

  "application/epub+zip": {
    name: "EPUB",
    kind: "ebook",
    extensions: [".epub"],
    aliases: ["image/epub", "application/epub"],
  },

  "application/zip": {
    name: "ZIP",
    kind: "archive",
    extensions: [".zip"],
    aliases: [],
  },

  "application/audiobook+zip": {
    name: "AUDIOBOOK_PACKAGE",
    kind: "package",
    extensions: [".audiobook"],
    aliases: [],
  },
  "application/webpub+zip": {
    name: "WEBPUB_PACKAGE",
    kind: "package",
    extensions: [".webpub"],
    aliases: [],
  },
  "application/guided-navigation+zip": {
    name: "GUIDED_NAVIGATION_PACKAGE",
    kind: "package",
    extensions: [".gnp"],
    aliases: [],
  },

  "application/audiobook+json": {
    name: "AUDIOBOOK_MANIFEST",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/webpub+json": {
    name: "WEBPUB_MANIFEST",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/guided-navigation+json": {
    name: "GUIDED_NAVIGATION",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/opds+json": {
    name: "OPDS",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/opds-publication+json": {
    name: "OPDS_PUBLICATION",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/opds-authentication+json": {
    name: "OPDS_AUTHENTICATION",
    kind: "manifest",
    extensions: [],
    aliases: [],
  },
  "application/opds-progression+json": {
    name: "OPDS_PROGRESSION",
    kind: "data",
    extensions: [],
    aliases: [],
  },
  "application/atom+xml": {
    name: "ATOM",
    kind: "manifest",
    extensions: [".atom"],
    aliases: [],
  },

  "font/ttf": {
    name: "TTF",
    kind: "font",
    extensions: [".ttf"],
    aliases: [
      "application/font-sfnt",
      "application/x-font-truetype",
      "application/x-font-ttf",
      "font/sfnt",
    ],
  },
  "font/otf": {
    name: "OTF",
    kind: "font",
    extensions: [".otf"],
    aliases: [
      "application/vnd.ms-opentype",
      "application/x-font-opentype",
      "application/x-font-otf",
    ],
  },
  "font/woff": {
    name: "WOFF",
    kind: "font",
    extensions: [".woff"],
    aliases: ["application/font-woff", "application/x-font-woff"],
  },
  "font/woff2": {
    name: "WOFF2",
    kind: "font",
    extensions: [".woff2"],
    aliases: ["application/font-woff2"],
  },
  "font/collection": {
    name: "FONT_COLLECTION",
    kind: "font",
    extensions: [".ttc", ".otc"],
    aliases: [],
  },

  "application/smil+xml": {
    name: "SMIL",
    kind: "data",
    extensions: [".smil"],
    aliases: [],
  },
  "application/xhtml+xml": {
    name: "XHTML",
    kind: "data",
    extensions: [".xhtml"],
    aliases: ["application/vnd.adobe-page-template+xml"],
  },
  "application/json": {
    name: "JSON",
    kind: "data",
    extensions: [".json"],
    aliases: [],
  },
  "application/vnd.sqlite3": {
    name: "SQLITE",
    kind: "data",
    extensions: [".sqlite", ".db"],
    aliases: [],
  },
  "text/event-stream": {
    name: "EVENT_STREAM",
    kind: "data",
    extensions: [],
    aliases: [],
  },
  "application/octet-stream": {
    name: "OCTET_STREAM",
    kind: "data",
    extensions: [],
    aliases: [],
  },
  "text/html": {
    name: "HTML",
    kind: "data",
    extensions: [".html"],
    aliases: [],
  },
  "text/css": {
    name: "CSS",
    kind: "data",
    extensions: [".css"],
    aliases: [],
  },
  "text/javascript": {
    name: "JAVASCRIPT",
    kind: "data",
    extensions: [".js", ".mjs"],
    aliases: ["application/javascript", "application/x-javascript"],
  },
  "text/plain": {
    name: "PLAIN_TEXT",
    kind: "data",
    extensions: [".txt"],
    aliases: [],
  },
  "application/oebps-package+xml": {
    name: "OPF",
    kind: "data",
    extensions: [".opf"],
    aliases: [],
  },
  "application/x-dtbncx+xml": {
    name: "NCX",
    kind: "data",
    extensions: [".ncx"],
    aliases: [],
  },
  "application/pls+xml": {
    name: "PLS",
    kind: "data",
    extensions: [".pls"],
    aliases: [],
  },
  "application/opensearchdescription+xml": {
    name: "OPENSEARCH_DESCRIPTION",
    kind: "data",
    extensions: [".osdd"],
    aliases: [],
  },
} as const satisfies Record<string, MediaTypeRow>
