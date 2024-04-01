declare module "pymport" {
  export const pymport: (module: string) => unknown
  export const proxify: (pymported: unknown) => unknown

  export type PyObject<R> =
    R extends PyDict<unknown>
      ? R
      : R extends Record<string, unknown>
        ? {
            get<P extends keyof R>(prop: P): PyObject<R[P]>
          }
        : R extends Array<infer I>
          ? PyList<I>
          : R extends (...args: infer Args) => infer Result
            ? PyCallable<Args, Result>
            : {
                toJS(): R
              }

  export interface PyDict<R extends Record<string, unknown>> {
    item<P extends keyof R>(property: P): PyObject<R[P]>
    toJS(): JsObject<R>
  }

  type JsObject<P> =
    P extends PyDict<infer R>
      ? { [Key in keyof R]: JsObject<R[Key]> }
      : P extends PyList<infer I>
        ? Array<JsObject<I>>
        : P extends PyObject<infer R>
          ? R extends Record<string, unknown>
            ? R
            : P
          : P extends Array<infer I>
            ? Array<JsObject<I>>
            : P extends Record<string, unknown>
              ? { [Key in keyof P]: JsObject<P[Key]> }
              : P

  export interface PyList<Item extends Record<string, unknown>> {
    item(index: number): PyObject<Item> | undefined
    toJS(): JsObject<Item>[]
  }

  export type PyCallable<Args extends unknown[], Result> = {
    call(...args: Args): PyObject<Result>
  }
}
