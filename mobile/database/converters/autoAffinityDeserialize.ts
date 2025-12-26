import {
  isStringArray,
  isStringBoolean,
  isStringIso8601,
  isStringJson,
  safeParse,
} from "./helpers"

export type ValidTypes =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "null"
  | "blob"
  | "datetime"
  | "array"
  | "none"

function deserializeRow<R>(
  row: R,
  typeMapping: Map<string, ValidTypes>,
  prefix?: string,
  onError?: (message: string, exception: unknown) => void,
) {
  typeIntrospection([row], typeMapping, prefix)

  if (typeof row !== "object" || row === null) return row
  for (const key in row) {
    const value = row[key]

    type Value = (R & object)[Extract<keyof R, string>]

    if (value === null || value === undefined) {
      continue
    }

    const type = typeMapping.get(`${prefix ?? ""}${key}`)

    if (type === "datetime") {
      row[key] = new Date(value as string | number) as Value
    } else if (type === "boolean") {
      row[key] = (value === "true" ? true : false) as Value
    } else if (type === "null") {
      row[key] = null as Value
    } else if (type === "array") {
      row[key] = safeParse(value as string, onError)
      // TODO: recursively deserialize arrays
    } else if (type === "object") {
      row[key] = safeParse(value as string, onError)
      deserializeRow(row[key], typeMapping, `${prefix ?? ""}${key}.`, onError)
    } else if (type === "number") {
      row[key] = Number(value) as Value
    } else if (type === "string") {
      row[key] = String(value) as Value
    } else if (type === "blob") {
      row[key] = value as Value
    } else if (type === "none") {
      row[key] = value
    } else {
      throw new Error("unknown type: " + type)
    }
  }

  return row
}

function deserialize<R>(
  rows: R[],
  onError?: (message: string, exception: unknown) => void,
): R[] {
  const typeMapping = new Map<string, ValidTypes>()
  const processed = rows.map((row) => {
    return deserializeRow(row, typeMapping, undefined, onError)
  })

  return processed
}

// Reverse SQLite affinity mapping.
// https://www.sqlite.org/datatype3.html#affinity_name_examples
function typeIntrospection<R>(
  rows: R[],
  typeMapping: Map<string, ValidTypes>,
  prefix?: string,
): Map<string, ValidTypes> {
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    for (const [rawKey, value] of Object.entries(row)) {
      const key = `${prefix ?? ""}${rawKey}`
      if (typeMapping.has(key)) continue

      if (value === null || value === undefined) {
        continue // wait for a non-null value to determine type
      }

      const valueType = typeof value

      switch (valueType) {
        case "string":
          if (isStringIso8601(value as string)) {
            typeMapping.set(key, "datetime")
          } else if (isStringBoolean(value as string)) {
            typeMapping.set(key, "boolean")
          } else if (isStringArray(value as string)) {
            typeMapping.set(key, "array")
          } else if (isStringJson(value as string)) {
            typeMapping.set(key, "object")
          } else {
            typeMapping.set(key, "string")
          }
          break
        default:
          typeMapping.set(key, "none")
      }
    }
  }

  return typeMapping
}

export { deserialize }
