import merge from "lodash.merge"

export function extendDeep<T extends object>(
  base: T,
  extension: Partial<T> | undefined,
): T {
  return merge(base, extension) as T
}
