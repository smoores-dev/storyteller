declare module "cldr-segmentation" {
  export const sentenceSplit: (
    input: string,
    suppressions?: unknown,
  ) => string[]
  export const wordSplit: (input: string) => string[]
  export const suppressions: {
    all: unknown
    de: unknown
    en: unknown
    es: unknown
    fr: unknown
    it: unknown
    pt: unknown
    ru: unknown
    tr: unknown
  }
}
