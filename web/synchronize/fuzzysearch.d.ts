import { PyObject } from "pymport/proxified"

interface PyObject<Record extends Record<string, unknown>> {
  get(prop: keyof Record): {
    toJS(): Record[keyof Record]
  }
}

interface SubscriptablePyObject<
  Item extends Item<string, unknown>,
  Record extends Record<string, unknown> = unknown,
> extends PyObject<Item> {
  item(index: number): PyObject<Item> | undefined
}

type PyCallable<Args extends unknown[], Result> = {
  call(...args: Args): Result
}

export type Module = {
  get(
    property: "find_near_matches",
  ): PyCallable<
    [needle: string, haystack: string, opts: { max_l_dist?: number }],
    SubscriptablePyObject<{ start: number; end: number }>
  >
  get(property: string): unknown
}
