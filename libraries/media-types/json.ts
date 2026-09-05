import { type Kind, MEDIA_KINDS, TABLE } from "./table.ts"

export const TABLE_JSON_VERSION = 1

export interface MediaTypeJson {
  readonly mime: string
  readonly name: string
  readonly kind: Kind
  readonly extensions: readonly string[]
  readonly aliases: readonly string[]
  readonly cover: boolean
}

export interface TableJson {
  readonly version: number
  readonly kinds: readonly Kind[]
  readonly mediaTypes: readonly MediaTypeJson[]
}

export function buildTableJson(): TableJson {
  return {
    version: TABLE_JSON_VERSION,
    kinds: MEDIA_KINDS,
    mediaTypes: Object.entries(TABLE).map(([mime, row]) => ({
      mime,
      name: row.name,
      kind: row.kind,
      extensions: row.extensions,
      aliases: row.aliases,
      cover: "cover" in row && row.cover,
    })),
  }
}

export function serializeTableJson(): string {
  return `${JSON.stringify(buildTableJson(), null, 2)}\n`
}
