import { type EpubIdentifier } from "@storyteller/epub"

export interface ParsedIdentifier {
  scheme: string
  value: string
}

const SCHEME_ALIASES: Record<string, string> = {
  amazon: "asin",
  amzn: "asin",
  "mobi-asin": "asin",
  asin: "asin",
  audible: "audible",
  audible_asin: "audible",
  doi: "doi",
}

const SKIP_SCHEMES = new Set(["uuid", "calibre", "uid", "urn"])

// non exhaustive list of ONIX codelist 5 codes we care about
const ONIX_CODES: Record<string, string> = {
  "02": "isbn-10",
  "15": "isbn-13",
  "06": "doi",
}

const ISBN13 = /^97[89]\d{10}$/

function normalizeIsbn(value: string): { scheme: string; value: string } {
  // tolerate a urn:isbn: / isbn: prefix on the value (e.g. when the ONIX
  // identifier-type branch is applied to a urn:isbn: value)
  const digits = value
    .replace(/^urn:isbn:/i, "")
    .replace(/^isbn:/i, "")
    .replace(/[-\s]/g, "")
  if (digits.length === 13) return { scheme: "isbn-13", value: digits }
  if (digits.length === 10) return { scheme: "isbn-10", value: digits }
  return { scheme: "isbn", value: digits }
}

export function parseRawIdentifier(raw: {
  value: string
  identifierType?: string | undefined
  scheme?: string | undefined
}): ParsedIdentifier | null {
  const text = raw.value.trim()
  if (!text) return null

  // ONIX refinement: identifier-type is a codelist value, value is the bare id
  const onixScheme = raw.identifierType
    ? ONIX_CODES[raw.identifierType.trim()]
    : undefined
  if (onixScheme) {
    if (onixScheme.startsWith("isbn")) return normalizeIsbn(text)
    return { scheme: onixScheme, value: text }
  }

  // legacy opf:scheme attribute (eg opf:scheme="ISBN")
  if (raw.scheme) {
    const token = raw.scheme.trim().toLowerCase()
    if (token === "isbn") return normalizeIsbn(text)
    const alias = SCHEME_ALIASES[token]
    if (alias) return { scheme: alias, value: text }
    if (!SKIP_SCHEMES.has(token) && !token.includes(":")) {
      return { scheme: token, value: text }
    }
  }

  const withoutUrn = text.replace(/^urn:/i, "")

  const colon = withoutUrn.indexOf(":")
  if (colon > 0) {
    const token = withoutUrn.slice(0, colon).trim().toLowerCase()
    const rest = withoutUrn.slice(colon + 1).trim()
    if (rest) {
      if (SKIP_SCHEMES.has(token)) return null
      if (token === "isbn") return normalizeIsbn(rest)
      const alias = SCHEME_ALIASES[token]
      if (alias) return { scheme: alias, value: rest }
      return { scheme: token, value: rest }
    }
  }

  // bare ISBN-13 by shape (e.g. Calibre's EbookISBN / print-source ISBN)
  const digits = text.replace(/[-\s]/g, "")
  if (ISBN13.test(digits)) return { scheme: "isbn-13", value: digits }

  return null
}

function schemeToOnix(scheme: string): { code: string } | null {
  if (scheme === "doi") return { code: "06" }
  return null
}

export function identifierToEpub(row: {
  kind: string | null
  name: string
  value: string
}): EpubIdentifier {
  const scheme = row.kind ?? row.name.toLowerCase()

  // ISBNs are written as proper URNs (urn:isbn:), the form the spec examples
  // use, alongside the ONIX identifier-type refinement. Vendor schemes have no
  // registered URN namespace, so they stay as a plain scheme:value.
  if (scheme === "isbn-13" || scheme === "isbn-10") {
    return {
      value: `urn:isbn:${row.value}`,
      identifierType: scheme === "isbn-13" ? "15" : "02",
      scheme: "onix:codelist5",
    }
  }

  const onix = schemeToOnix(scheme)
  if (onix) {
    return {
      value: row.value,
      identifierType: onix.code,
      scheme: "onix:codelist5",
    }
  }

  return {
    value: `${scheme}:${row.value}`,
  }
}
