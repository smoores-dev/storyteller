import { type UnknownRow } from "kysely"

import { isPlainObject } from "./json"

export function camelCaseRows<T>(arr: T[]): T[] {
  return arr.map((row) => mapRow(row))
}

function mapRow<T>(row: T): T {
  return Object.keys(row as Record<string, unknown>).reduce<UnknownRow>(
    (obj, key) => {
      let value = (row as Record<string, unknown>)[key]

      if (Array.isArray(value)) {
        value = value.map((it) => (canMap(it) ? mapRow(it) : it))
      } else if (canMap(value)) {
        value = mapRow(value)
      }

      obj[camelCase(key)] = value
      return obj
    },
    {},
  ) as T
}

function canMap(obj: unknown): obj is Record<string, unknown> {
  return isPlainObject(obj)
}

const camelCase = memoize((str: string): string => {
  if (str.length === 0) {
    return str
  }

  let out = str[0]!

  for (let i = 1, l = str.length; i < l; ++i) {
    const char = str[i]!
    const prevChar = str[i - 1]

    if (char !== "_") {
      if (prevChar === "_") {
        out += char.toUpperCase()
      } else {
        out += char
      }
    }
  }

  return out
})

function memoize(func: StringMapper): StringMapper {
  const cache = new Map<string, string>()

  return (str: string) => {
    let mapped = cache.get(str)

    if (!mapped) {
      mapped = func(str)
      cache.set(str, mapped)
    }

    return mapped
  }
}

type StringMapper = (str: string) => string
