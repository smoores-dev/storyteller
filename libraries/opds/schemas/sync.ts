import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"

import $RefParser from "@apidevtools/json-schema-ref-parser"
import { ParserOptions } from "@apidevtools/json-schema-ref-parser/dist/lib/options"
import { type JSONSchema, compile } from "json-schema-to-typescript"

const HERE = dirname(fileURLToPath(import.meta.url))
const VENDOR = join(HERE, "vendor")
const TYPES = join(HERE, "..", "types")

/** the only hand-maintained input: entry-point schemas */
const ROOTS = {
  feed: "https://specs.opds.io/schema/feed.schema.json",
  authentication: "https://drafts.opds.io/schema/authentication.schema.json",
  progression: "https://drafts.opds.io/schema/progression.schema.json",
} as const

/** a schema document keyed by the URL it was fetched from */
type Docs = Map<string, Record<string, unknown>>

const stripHash = (url: string): string => url.replace(/#.*$/, "")

/**
 * fetch json with retry
 */
const fetchJson = async (url: string): Promise<Record<string, unknown>> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return JSON.parse(await res.text()) as Record<string, unknown>
    } catch (error) {
      lastError = error
      await setTimeout(250 * (attempt + 1))
    }
  }
  throw new Error(`fetch ${url} failed: ${String(lastError)}`)
}

/** rewrites every non-fragment `$ref` in place to an absolute URL */
const normalizeRefs = (node: unknown, baseUrl: string): void => {
  if (Array.isArray(node)) {
    for (const v of node) normalizeRefs(v, baseUrl)
    return
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$ref" && typeof v === "string" && !v.startsWith("#")) {
        obj[k] = new URL(v, baseUrl).toString()
      } else {
        normalizeRefs(v, baseUrl)
      }
    }
  }
}

/**
 * drops keys sitting next to a `$ref` (draft-07 ignores them). without this,
 * a `{ description, $ref }` dereferences to a different object identity than a
 * bare `{ $ref }` to the same URL, so json2ts emits duplicate named types.
 * applied only to the type-generation copy; the vendored files stay pristine.
 */
const bareRefs = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const v of node) bareRefs(v)
    return
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>
    if (typeof obj.$ref === "string") {
      for (const k of Object.keys(obj)) if (k !== "$ref") delete obj[k]
      return
    }
    for (const v of Object.values(obj)) bareRefs(v)
  }
}

/**
 * loosens a typed `additionalProperties` (eg `{ $ref: subcollection }`) to
 * `true` wherever it sits alongside named `properties`. json2ts would otherwise
 * emit `[k: string]: CoreCollectionModel`, an index signature the sibling
 * properties don't satisfy (TS2411). applied only to the type-generation copy;
 * AJV still enforces the real constraint from the pristine vendored files.
 */
const loosenTypedAdditionalProps = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const v of node) loosenTypedAdditionalProps(v)
    return
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>
    const ap = obj.additionalProperties
    if (obj.properties && ap !== null && typeof ap === "object") {
      obj.additionalProperties = true
    }
    for (const v of Object.values(obj)) loosenTypedAdditionalProps(v)
  }
}

const collectRefs = (node: unknown, acc: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, acc)
    return
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") acc.add(v)
      else collectRefs(v, acc)
    }
  }
}

const vendorPathFor = (url: string): string => {
  const u = new URL(url)
  return join(VENDOR, u.host, u.pathname)
}

const writeVendor = async (docs: Docs): Promise<void> => {
  await rm(VENDOR, { recursive: true, force: true })
  for (const [url, json] of docs) {
    const p = vendorPathFor(url)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, `${JSON.stringify(json, null, 2)}\n`)
  }
}

const importPathFor = (url: string): string => {
  const rel = relative(HERE, vendorPathFor(url)).split(sep).join("/")
  return rel.startsWith(".") ? rel : `./${rel}`
}

/** writes registry.generated.ts: a static import of every vendored schema so a
 * bundler can inline them for the live `./validate/ajv` export */
const writeRegistry = async (docs: Docs): Promise<void> => {
  const urls = [...docs.keys()].sort()
  const imports = urls.map(
    (url, i) =>
      `import schema${i} from "${importPathFor(url)}" with { type: "json" }`,
  )
  const list = urls.map((_, i) => `  schema${i},`).join("\n")
  const body = [
    "// GENERATED by schemas/sync.ts. do not edit.",
    "/* eslint-disable */",
    'import type { AnySchemaObject } from "ajv"',
    "",
    ...imports,
    "",
    `export const allSchemas: AnySchemaObject[] = [\n${list}\n]`,
    "",
  ].join("\n")
  await writeFile(join(HERE, "registry.generated.ts"), body)
}

/** writes roots.generated.ts: logical name -> root schema $id (the AJV key) */
const writeRoots = async (docs: Docs): Promise<void> => {
  const entries = Object.entries(ROOTS).map(([name, url]) => {
    const id = (docs.get(stripHash(url))?.$id as string | undefined) ?? url
    return `  ${name}: ${JSON.stringify(id)},`
  })
  const body = [
    "// GENERATED by schemas/sync.ts. do not edit.",
    "export const roots = {",
    ...entries,
    "} as const",
    "",
  ].join("\n")
  await writeFile(join(HERE, "roots.generated.ts"), body)
}

/**
 * json-schema-to-typescript emits `{ [k: string]: unknown } & T` for nodes that
 * mix an open object with a concrete `T` (string/tuple), an unsatisfiable
 * intersection (eg `published`, availability `since`/`until`, `images`). the
 * open-object half carries no information, so we drop it.
 */
const ANY_OBJECT = String.raw`\{\s*\[k: string\]: unknown;?\s*\}`

// this is me resisting the urge to write a custom jsdoc to ts transformer
const patchGenerated = (ts: string): string =>
  ts
    // ( | {..any..} | {..any..} ) & string  -> string
    .replace(
      new RegExp(String.raw`\(\s*(?:\|\s*${ANY_OBJECT}\s*)+\)\s*&\s*`, "g"),
      "",
    )
    // { [k: string]: unknown }[] & [tuple]  -> [tuple]
    .replace(new RegExp(String.raw`${ANY_OBJECT}\[\]\s*&\s*`, "g"), "")
    // { [k: string]: unknown } & T  -> T
    .replace(new RegExp(String.raw`${ANY_OBJECT}\s*&\s*`, "g"), "")
    // { ...; [k: string]: Thing;} -> {...} & { [k: string]: Thing }
    .replace(
      new RegExp(String.raw`\[k: string\]: ([A-Z].*)`, "g"),
      "[k: string]: unknown",
    )

const BANNER = `/* eslint-disable */
/**
 * GENERATED by schemas/sync.ts from the OPDS/Readium JSON Schemas.
 * DO NOT EDIT BY HAND. run \`yarn schemas:sync\` to regenerate.
 */`

/**
 * really stupid but i know these object names will be generated in this order
 */
const OBJECT_NAMES = [
  "Contributor",
  "Subject",
  "Collection",
  "Periodical",
  "Issue",
  "Article",
  "Chapter",
  "Series",
  "Season",
  "StoryArc",
  "Volume",
]

const writeTypes = async (docs: Docs, opts: ParserOptions): Promise<void> => {
  // copy for typegen with $ref siblings stripped (see bareRefs)
  const typegenDocs: Docs = new Map()
  for (const [url, json] of docs) {
    const clone = structuredClone(json)
    bareRefs(clone)
    typegenDocs.set(url, clone)
  }

  const root = typegenDocs.get(stripHash(ROOTS.feed))

  let counter = 0
  if (root) {
    const ts = await compile(
      structuredClone(typegenDocs.get(stripHash(ROOTS.feed)) as JSONSchema),
      "OPDSFeed",
      {
        bannerComment: BANNER,
        additionalProperties: false,
        $refOptions: { resolve: opts.resolve },
        customName(schema, keyNameFromDefinition) {
          if (
            schema.title ===
            "Link Object for the Readium Web Publication Manifest"
          ) {
            return "Link"
          }

          if (schema.$id === "Object") {
            const name = OBJECT_NAMES[counter]
            if (!name) {
              return
            }
            counter++
            return `${name}Object`
          }
        },
      },
    )
    await writeFile(join(TYPES, "feed.ts"), patchGenerated(ts))
  }

  const progressionRoot = typegenDocs.get(stripHash(ROOTS.progression))
  if (progressionRoot) {
    const ts = await compile(progressionRoot, "Progression", {
      bannerComment: BANNER,
      additionalProperties: false,
      $refOptions: { resolve: opts.resolve },
    })
    await writeFile(join(TYPES, "progression.ts"), patchGenerated(ts))
  }

  const authenticationRoot = typegenDocs.get(stripHash(ROOTS.authentication))
  if (authenticationRoot) {
    const ts = await compile(authenticationRoot, "Authentication", {
      bannerComment: `${BANNER}\n\nimport type { Link } from "./feed.ts"`,
      additionalProperties: false,
      customName(schema, keyNameFromDefinition) {
        if (
          schema.title ===
          "Link Object for the Readium Web Publication Manifest"
        ) {
          return "Link"
        }
        return keyNameFromDefinition
      },
      $refOptions: { resolve: opts.resolve },
    })
    await writeFile(
      join(TYPES, "authentication.ts"),
      // get rid of all the other shit
      patchGenerated(ts).replace(/export interface Link(.|\n)*/, ""),
    )
  }
}

const main = async (): Promise<void> => {
  const docs = new Map<string, Record<string, unknown>>()
  const opts = {
    mutateInputSchema: true,
    resolve: {
      http: {
        read: async (file) => {
          if ("url" in file) {
            const url = file.url
            if (docs.has(url)) {
              return JSON.stringify(docs.get(url))
            }

            const json = await fetchJson(url)
            docs.set(url, json)
            return JSON.stringify(json)
          }
          return JSON.stringify(file)
        },
      },
      file: false,
    },
  } satisfies ParserOptions

  await $RefParser.dereference(structuredClone(ROOTS.feed), opts)
  await $RefParser.dereference(structuredClone(ROOTS.progression), opts)
  await $RefParser.dereference(structuredClone(ROOTS.authentication), opts)

  // basically: find all the $refs and fully qualify them with the domain of the current schema if they are not already fully qualified
  // ex
  // parent: $id: https://specs.opds.io/schemas/feed.schema.json
  // $ref: properties.schema.json
  // the ref then becomes https://specs.opds.io/schemas/properties.schema.json
  // this is easier to reason about
  for (const [url, json] of docs) {
    const idDomain = url.split("/").slice(0, -1).join("/")

    const replaced = JSON.stringify(json).replace(
      /"\$ref":"((?!(?:http|#))[^"]*)"/g,
      `"$ref": "${idDomain}/$1"`,
    )

    docs.set(url, JSON.parse(replaced))
  }

  await writeVendor(docs)
  await writeRegistry(docs)
  await writeRoots(docs)
  await writeTypes(docs, opts)
}

await main()
