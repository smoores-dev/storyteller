export function deepEquals<T>(obj1: T, obj2: T): boolean {
  if (obj1 === obj2) {
    return true
  }

  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false
  }

  const keys1 = Object.keys(obj1) as (keyof T)[]
  const keys2 = Object.keys(obj2) as (keyof T)[]

  if (keys1.length !== keys2.length) {
    return false
  }

  for (const key of keys1) {
    if (
      !Object.prototype.hasOwnProperty.call(obj2, key) ||
      !deepEquals(obj1[key], obj2[key])
    ) {
      return false
    }
  }

  return true
}
