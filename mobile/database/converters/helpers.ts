function isStringIso8601(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(date)
}

function isStringJson(value: string): boolean {
  try {
    const result = JSON.parse(value)
    return result && typeof result === "object"
  } catch {
    return false
  }
}

function isStringArray(value: string): boolean {
  try {
    const result = JSON.parse(value)
    return result && Array.isArray(result)
  } catch {
    return false
  }
}

function isStringBoolean(value: string): boolean {
  return value === "true" || value === "false"
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

function isBigInt(value: unknown): value is bigint {
  return typeof value === "bigint"
}

const safeParse = (
  json: string,
  onError?: (message: string, exception: unknown) => void,
) => {
  try {
    return JSON.parse(json)
  } catch (e) {
    onError?.(`Failed to parse value: ${json}`, e)
    return undefined
  }
}

export {
  isBigInt,
  isStringArray,
  isStringBoolean,
  isStringIso8601,
  isStringJson,
  isUint8Array,
  safeParse,
}
