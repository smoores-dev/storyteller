import z from "zod"

export const ReadiumLocationsSchema = z.object({
  fragments: z.array(z.string()).optional(),
  progression: z.number().optional(),
  position: z.number().optional(),
  totalProgression: z.number().optional(),
  cssSelector: z.string().optional(),
  partialCfi: z.string().optional(),
  domRange: z
    .object({
      start: z.object({
        cssSelector: z.string(),
        textNodeIndex: z.number(),
        charOffset: z.number().optional(),
      }),
      end: z
        .object({
          cssSelector: z.string(),
          textNodeIndex: z.number(),
          charOffset: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
})

export const ReadiumLocatorSchema = z.object({
  href: z.string(),
  type: z.string(),
  title: z.string().optional(),
  locations: ReadiumLocationsSchema.optional(),
  text: z
    .object({
      after: z.string().optional(),
      before: z.string().optional(),
      highlight: z.string().optional(),
    })
    .optional(),
})
