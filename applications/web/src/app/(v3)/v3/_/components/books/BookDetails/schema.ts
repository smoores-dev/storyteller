import { z } from "zod"

const editableCreatorSchema = z.object({
  name: z.string(),
  role: z.string(),
})

const editableCollectionSchema = z.object({
  uuid: z.string(),
  name: z.string(),
})

const editableSeriesSchema = z.object({
  uuid: z.string().optional(),
  name: z.string(),
  position: z.number().nullable(),
  featured: z.boolean(),
})

function isValidLanguage(code: string): boolean {
  try {
    new Intl.Locale(code)
    return true
  } catch {
    return false
  }
}

const jsColorSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
})

export const bookFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  language: z
    .string()
    .nullable()
    .refine((v) => !v?.trim() || isValidLanguage(v.trim()), {
      message: "Not a valid language code",
    }),
  publicationDate: z.string().nullable(),
  pageCount: z.number().int().positive().nullable(),
  duration: z.number().positive().nullable(),
  authors: z.array(z.string()),
  narrators: z.array(z.string()),
  creators: z.array(editableCreatorSchema),
  tags: z.array(z.string()),
  collections: z.array(editableCollectionSchema),
  series: z.array(editableSeriesSchema),
  textCover: z.instanceof(File).nullable(),
  audioCover: z.instanceof(File).nullable(),
  coverColorsOverride: z.tuple([jsColorSchema, jsColorSchema]).nullable(),
})

export type BookFormValues = z.infer<typeof bookFormSchema>
