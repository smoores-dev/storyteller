/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */

export function entries<
  const T extends Record<string, unknown>,
  const KeepUndefined extends boolean = false,
>(
  obj: T,
  keepUndefined?: KeepUndefined,
): T extends T ? Entries<T, KeepUndefined> : never {
  const newObj = Object.entries(obj)

  if (keepUndefined) {
    return newObj as any
  }

  return newObj.filter(([_, v]) => v !== undefined) as any
}

export type Entries<
  T extends Record<string, unknown>,
  KeepUndefined extends boolean = false,
  ValueFilter = undefined,
  AcceptedKeys extends keyof T = ValueFilter extends undefined
    ? keyof T
    : keyof T extends infer Keys extends keyof T
      ? Keys extends Keys
        ? ValueFilter extends T[Keys]
          ? keyof T
          : never
        : never
      : never,
> = {
  [K in AcceptedKeys]-?: [
    ValueFilter extends undefined
      ? KeepUndefined extends true
        ? T[K]
        : NonNullable<T[K]>
      : T[K] extends ValueFilter
        ? T[K]
        : never,
  ]
}[AcceptedKeys][]

export type AcceptedKeys<
  T,
  ValueFilter = undefined,
> = ValueFilter extends undefined
  ? keyof T
  : keyof T extends infer Keys extends keyof T
    ? Keys extends Keys
      ? T[Keys] extends ValueFilter
        ? keyof T
        : never
      : never
    : never

export function fromEntries<const T extends [PropertyKey, any][]>(
  entries: T,
): { [K in T[number][0]]: Extract<T[number], [K, any]>[1] } {
  return Object.fromEntries(entries) as any
}

export function keys<const T extends Record<string, any>>(
  obj: T,
): T extends T ? (keyof T)[] : never {
  return Object.keys(obj) as any
}
