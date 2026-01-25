type DrainOuterGeneric<T> = [T] extends [unknown] ? T : never

type ShallowRecord<K extends PropertyKey, T> = DrainOuterGeneric<{
  [P in K]: T
}>

function getTag(value: unknown): string {
  if (value == null) {
    return value === undefined ? "[object Undefined]" : "[object Null]"
  }

  return toString.call(value)
}

function isString(obj: unknown): obj is string {
  return typeof obj === "string"
}

export function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  if (!isObject(obj) || getTag(obj) !== "[object Object]") {
    return false
  }

  if (Object.getPrototypeOf(obj) === null) {
    return true
  }

  let proto = obj
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto)
  }

  return Object.getPrototypeOf(obj) === proto
}

function isObject(obj: unknown): obj is ShallowRecord<string, unknown> {
  return typeof obj === "object" && obj !== null
}

export function parseArray<T>(arr: T[]): T[] {
  const target = new Array(arr.length)
  for (let i = 0; i < arr.length; ++i) {
    target[i] = parse(arr[i]) as T
  }

  return target
}

function parse(obj: unknown): unknown {
  if (isString(obj)) {
    return parseString(obj)
  }

  if (Array.isArray(obj)) {
    return parseArray(obj)
  }

  if (isPlainObject(obj)) {
    return parseObject(obj)
  }

  return obj
}

function parseString(str: string): unknown {
  if (maybeJson(str)) {
    try {
      return parse(JSON.parse(str))
    } catch {
      // this catch block is intentionally empty.
    }
  }

  return str
}

function maybeJson(value: string): boolean {
  return value.match(/^[[{]/) != null
}

function parseObject(obj: Record<string, unknown>): Record<string, unknown> {
  const target = {} as Record<string, unknown>

  for (const key in obj) {
    target[key] = parse(obj[key])
  }

  return target
}
