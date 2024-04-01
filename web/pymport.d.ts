declare module "pymport" {
  export const pymport: (module: string) => unknown
  export const proxify: (pymported: unknown) => unknown
}
