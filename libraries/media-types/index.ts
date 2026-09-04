import { extname } from "@storyteller-platform/path"

import { type Kind, type MediaTypeRow, TABLE } from "./table.ts"

export { type Kind, MEDIA_KINDS } from "./table.ts"

type Table = typeof TABLE

export type Mime = keyof Table

export type MediaTypeName = Table[Mime]["name"]

type MimeOfKind<K extends Kind> = {
  [M in Mime]: Table[M]["kind"] extends K ? M : never
}[Mime]

class Row<M extends Mime = Mime> {
  readonly mime: M
  readonly name: Table[M]["name"]
  readonly kind: Table[M]["kind"]
  readonly extensions: readonly string[]
  readonly extension: string | null
  readonly aliases: readonly string[]
  readonly cover: boolean

  constructor(mime: M, row: MediaTypeRow) {
    this.mime = mime
    this.name = row.name as Table[M]["name"]
    this.kind = row.kind as Table[M]["kind"]
    this.extensions = row.extensions
    this.extension = row.extensions[0] ?? null
    this.aliases = row.aliases
    this.cover = row.cover === true
  }

  is<K extends Kind>(kind: K): this is Row<Extract<M, MimeOfKind<K>>> {
    return this.kind === kind
  }

  toString(): M {
    return this.mime
  }
}

export type MediaType<M extends Mime = Mime> = Row<M>

const rows = Object.fromEntries(
  Object.entries(TABLE).map(([mime, row]) => [
    mime,
    new Row(mime as Mime, row),
  ]),
) as { readonly [M in Mime]: Row<M> }

const all = Object.values(rows) as readonly Row[]

const byName = Object.fromEntries(all.map((row) => [row.name, row])) as {
  readonly [M in Mime as Table[M]["name"]]: Row<M>
}

export const MediaType = {
  ...byName,

  all,

  fromMime(value: string): MediaType | null {
    const essence = (value.split(";")[0] ?? "").trim().toLowerCase()
    if (essence === "") return null
    if (essence in rows) return rows[essence as Mime]
    return all.find((row) => row.aliases.includes(essence)) ?? null
  },

  fromExtension(extension: string): MediaType | null {
    const lowered = extension.toLowerCase()
    const dotted = lowered.startsWith(".") ? lowered : `.${lowered}`
    return all.find((row) => row.extensions.includes(dotted)) ?? null
  },

  /**
   * Reads the extension off the basename, so a dotfile like ".mp3" has none.
   * Use fromExtension when you are holding a bare extension.
   */
  fromPath(nameOrPath: string): MediaType | null {
    const extension = extname(nameOrPath)
    return extension === "" ? null : MediaType.fromExtension(extension)
  },

  ofKind<K extends Kind>(kind: K): readonly MediaType<MimeOfKind<K>>[] {
    return all.filter((row) => row.kind === kind) as MediaType<MimeOfKind<K>>[]
  },
}
