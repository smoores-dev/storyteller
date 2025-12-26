import { type SQLiteBindValue } from "expo-sqlite"

import { isUint8Array } from "./helpers"

export const serialize = (parameters: unknown[]): SQLiteBindValue[] => {
  return parameters.map((parameter) => {
    if (typeof parameter === "string") {
      return parameter.toString()
    } else if (parameter instanceof Date) {
      return parameter.toISOString()
    } else if (typeof parameter === "number") {
      return parameter
    } else if (isUint8Array(parameter)) {
      return parameter
    } else if (parameter === null || parameter === undefined) {
      return null
    } else if (typeof parameter === "object") {
      return JSON.stringify(parameter)
    } else if (typeof parameter === "boolean") {
      return parameter ? "true" : "false" // SQLite booleans must be stored a strings.
    } else {
      throw new Error("Unknown type: " + typeof parameter)
    }
  })
}
