import z from "zod"

import { IDENTIFIER_KINDS } from "@/database/identifiers"
import { COVER_ORIGINS } from "@/database/images"
import { toIsoDateString } from "@/dates"
import { ALIGNMENT_GRADES } from "@/fields"
import { ICON_IDS } from "@/icons/icon-registry"
import { JOB_STATUSES } from "@/jobEvents"
import { marcRelators } from "@/metadata/marcRelators"
import { uuidv4 } from "@/schemas/uuid"

import { ImageSchemaV2 } from "./image"
import { ReadiumLocatorSchema } from "./position"

export const BookIdParamsSchemaV2 = z.object({
  bookId: uuidv4.meta({
    description: "The UUID of the book.",
  }),
})

export const BookAuthorSchemaV2 = z.object({
  uuid: uuidv4,
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string().meta({
    description: "The author's name.",
  }),
  fileAs: z.string().meta({
    description:
      "The author's name, normalized for sorting. This is often incorrect and set to just the author's name.",
  }),
})

export const BookCreatorSchemaV2 = z.object({
  ...BookAuthorSchemaV2.shape,
  role: z.nullish(z.string()).meta({
    description:
      "This creator's role in creating this book. Should be a MARC relator term.",
  }),
})

export const BookSeriesSchemaV2 = z.object({
  uuid: uuidv4,
  name: z.string(),
  featured: z.boolean().meta({
    description:
      "Whether this is the primary series that this book should be considered part of.",
  }),
  position: z.number().meta({
    description: "This book's position in the series. Can be a fraction.",
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const BookTagSchemaV2 = z.object({
  uuid: uuidv4,
  name: z.string(),
  icon: z.nullish(z.enum(ICON_IDS)),
  color: z.nullish(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const BookCollectionSchemaV2 = z.object({
  uuid: uuidv4,
  name: z.string(),
  description: z.nullish(z.string()),
  public: z.boolean().meta({
    description: "Whether the collection is visible to all users by default.",
  }),
  icon: z.nullish(z.enum(ICON_IDS)),
  color: z.nullish(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const BookIdentifiersV2 = z.object({
  uuid: uuidv4,
  kind: z.nullish(z.enum(IDENTIFIER_KINDS)),
  name: z.string(),
  urlTemplate: z.nullish(z.string()),
  // can be null if the identifier is not associated with an external source, eg ISBN
  externalSourceUuid: uuidv4.nullish(),
  value: z.string(),
})

export const BookExternalDataV2 = z.object({
  uuid: uuidv4,
  rating: z.nullish(z.number()),
  fetchedAt: z.string().meta({
    description:
      "The date and time that this data was last synced from the external source.",
  }),
  sourceUuid: uuidv4,
  sourceName: z.string().meta({
    description: "The name of the external source that this data comes from.",
  }),
  sourceColor: z.nullish(
    z.string().meta({
      description: "The color to represent this external source with.",
    }),
  ),
  sourceUrl: z.nullish(
    z.url().meta({
      description: "The base URL for this external source.",
    }),
  ),
  sourceRatingIcon: z.nullish(
    z.string().meta({
      description:
        "The name of the icon to use to represent this source's rating scale.",
    }),
  ),
  sourceRatingMin: z.nullish(z.number()),
  sourceRatingMax: z.nullish(z.number()),
})

export const JsColorSchemaV2 = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
})

const bookCoverShapeV2 = {
  cover: z.nullish(ImageSchemaV2),
  coverOrigin: z.enum(COVER_ORIGINS).meta({
    description:
      "Where this format's cover came from. `cleared` means the user removed it and it should not be re-extracted.",
  }),
}

export const BookSchemaV2 = z.object({
  uuid: z
    .uuid()
    .meta({ description: "A unique ID for this book, created by Storyteller" }),
  title: z.string(),
  subtitle: z.nullish(z.string()),
  description: z.nullish(z.string()),
  createdAt: z.string().meta({
    description:
      "The date and time that this book was added to this Storyteller instance.",
  }),
  updatedAt: z.string().meta({
    description:
      "The date and time that this book was last updated in this Storyteller instance.",
  }),
  alignedAt: z.nullish(
    z.string().meta({
      description:
        "The date and time that this book was last aligned by Storyteller.",
    }),
  ),
  alignedByStorytellerVersion: z.nullish(
    z.string().meta({
      description: "The version of Storyteller last used to align this book.",
      example: "v2.14.17",
    }),
  ),
  alignedWith: z.nullish(
    z.string().meta({
      description:
        "The transcription engine and model used to produce the transcriptions the last time this book was aligned.",
      example: "whisper.cpp:tiny.en",
    }),
  ),
  assetsDir: z.nullish(
    z.string().meta({
      description:
        "The path to the folder that stores the assets for this book.",
    }),
  ),
  duration: z.nullish(
    z.number().positive().meta({
      example: 40121.688,
      description:
        "User-provided audiobook duration. Takes precedence (in the UI) over the automatically calculated duration from the audiobook file(s).",
    }),
  ),
  pageCount: z.nullish(
    z.int().positive().meta({
      example: 313,
      description:
        "User-provided page count. Takes precedence over the automatically detected page count from the EPUB file.",
    }),
  ),
  language: z.nullish(
    z.string().meta({
      description: "The BCP-47 language code for this book.",
    }),
  ),
  publicationDate: z.nullish(
    z.coerce.date().meta({
      description: "The date that this book was first published.",
    }),
  ),
  releaseDate: z.nullish(
    z.coerce.date().meta({
      description: "The date that this book's audio recording was released.",
    }),
  ),
  rating: z.nullish(
    z.number().meta({
      deprecated: true,
      description:
        "Critic or crowd-sourced ratings from a third party. Deprecated in favor of external sources.",
    }),
  ),
  authors: z.array(BookAuthorSchemaV2),
  narrators: z.array(BookAuthorSchemaV2),
  creators: z.array(BookCreatorSchemaV2),
  series: z.array(BookSeriesSchemaV2),
  tags: z.array(BookTagSchemaV2),
  collections: z.array(BookCollectionSchemaV2),
  identifiers: z.array(BookIdentifiersV2),
  externalData: z.array(BookExternalDataV2),
  status: z.nullish(
    z
      .object({
        uuid: uuidv4,
        name: z.string(),
        label: z.nullish(z.string()),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .meta({
        description: "The current user's reading status for this book.",
      }),
  ),
  position: z.nullish(
    z
      .object({
        uuid: uuidv4,
        locator: ReadiumLocatorSchema,
        timestamp: z.number(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .meta({
        description: "The current user's position in this book.",
      }),
  ),
  userBookRating: z.nullish(
    z.object({
      rating: z.nullish(z.number().min(0).max(5)),
      review: z.nullish(z.string()),
      dimensions: z.nullish(z.record(z.string(), z.number())),
    }),
  ),
  alignmentSummary: z.nullish(
    z.object({
      grade: z.enum(ALIGNMENT_GRADES),
      score: z.nullish(z.number()),
      confidence: z.nullish(z.number()),
      sentenceCoverage: z.nullish(z.number()),
      audioCoverage: z.nullish(z.number()),
      failedChapters: z.nullish(z.number()),
      unalignedAudio: z.nullish(z.number()),
      previousGrade: z.nullish(z.enum(ALIGNMENT_GRADES)),
    }),
  ),
  ebook: z.nullish(
    z.object({
      uuid: uuidv4,
      filepath: z.string().meta({
        description: "The path to the EPUB file on the server.",
      }),
      missing: z.boolean().meta({
        description:
          "Whether the file scanner is unable to find the EPUB file.",
      }),
      ...bookCoverShapeV2,
      isEpub2: z.boolean(),
      fingerprint: z.nullish(z.string()),
      pageCount: z.nullish(z.number().positive()),
      fileSize: z.nullish(z.number().positive()),
      createdAt: z.string(),
      updatedAt: z.string(),
      identifiers: z.nullish(z.array(BookIdentifiersV2)),
    }),
  ),
  audiobook: z.nullish(
    z.object({
      uuid: uuidv4,
      filepath: z.string().meta({
        description:
          "The path to the folder containing the audiobook files on the server.",
      }),
      missing: z.boolean().meta({
        description:
          "Whether the file scanner is unable to find the audiobook files.",
      }),
      ...bookCoverShapeV2,
      fingerprint: z.nullish(z.string()),
      duration: z.nullish(
        z.number().positive().meta({
          description: "The audiobook's total duration in seconds.",
        }),
      ),
      fileSize: z.nullish(z.number().positive()),
      createdAt: z.string(),
      updatedAt: z.string(),
      identifiers: z.nullish(z.array(BookIdentifiersV2)),
    }),
  ),
  readaloud: z.nullish(
    z.object({
      uuid: uuidv4,
      filepath: z.nullish(
        z.string().meta({
          description: "The path to the EPUB file on the server.",
        }),
      ),
      missing: z.boolean().meta({
        description:
          "Whether the file scanner is unable to find the EPUB file.",
      }),
      ...bookCoverShapeV2,
      isEpub2: z.boolean(),
      fingerprint: z.nullish(z.string()),
      pageCount: z.nullish(z.number().positive()),
      duration: z.nullish(
        z.number().positive().meta({
          description: "The audiobook's total duration in seconds.",
        }),
      ),
      fileSize: z.nullish(z.number().positive()),
      createdAt: z.string(),
      updatedAt: z.string(),
      identifiers: z.nullish(z.array(BookIdentifiersV2)),
    }),
  ),
  processingJob: z.nullish(
    z.object({
      uuid: uuidv4,
      bookUuid: uuidv4,
      type: z.enum(["book_align"]),
      status: z.enum(JOB_STATUSES),
      stage: z.nullish(
        z.enum(["SPLIT_TRACKS", "TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"]),
      ),
      progress: z.number(),
      position: z.number(),
      error: z.nullish(z.string()),
      startedAt: z.nullish(z.string()),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
})

const CreatorRelationRequestSchemaV2 = z.object({
  uuid: uuidv4.optional(),
  name: z.string().meta({
    description: "The creator's name.",
  }),
  fileAs: z.string().meta({
    description:
      "The creator's name, normalized for sorting. This is often incorrect and set to just the author's name.",
  }),
  role: z.nullish(z.enum(marcRelators.map(({ value }) => value))).meta({
    description:
      "This creator's role in creating this book. Should be a [MARC relator code](https://www.loc.gov/marc/relators/relacode.html).",
  }),
})

const SeriesRelationRequestSchemaV2 = z.object({
  uuid: uuidv4.optional(),
  name: z.string(),
  featured: z.boolean().optional().meta({
    description:
      "Whether this is the primary series that this book should be considered part of.",
  }),
  position: z.nullish(z.number()),
})

const IdentifierRelationRequestSchemaV2 = z.object({
  uuid: uuidv4.optional(),
  value: z.string(),
  identifierTypeUuid: uuidv4,
  ebookUuid: z.nullish(uuidv4),
  audiobookUuid: z.nullish(uuidv4),
  readaloudUuid: z.nullish(uuidv4),
})

const BookUpdateValuesSchemaV2 = z.object({
  ...BookSchemaV2.omit({
    createdAt: true,
    updatedAt: true,
    uuid: true,
    externalData: true,
  }).shape,
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  duration: z.number().positive().nullable().optional(),
  publicationDate: z.string().nullable().optional().meta({
    description: "The date that this book was first published.",
  }),
  releaseDate: z.string().nullable().optional().meta({
    description: "The date that this book's audio recording was released.",
  }),
  coverColorsOverride: z.array(JsColorSchemaV2).nullable().optional(),
  status: uuidv4.optional().meta({
    description: "The current user's reading status for this book.",
  }),
  userBookRating: z
    .object({
      rating: z.nullish(z.number().min(0).max(5)),
      review: z.nullish(z.string()),
      dimensions: z.nullish(z.string()),
    })
    .nullable()
    .optional(),
  tags: z.array(z.string()).optional(),
  creators: z.array(CreatorRelationRequestSchemaV2).optional(),
  narrators: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
  series: z.array(SeriesRelationRequestSchemaV2).optional(),
  collections: z.array(uuidv4).optional(),
  identifiers: z.array(IdentifierRelationRequestSchemaV2).optional(),
  textCover: z.file().optional(),
  audioCover: z.file().optional(),
})

export const BookUpdateRequestSchemaV2 = z
  .object({
    ...BookUpdateValuesSchemaV2.shape,
    // do allow uuid, but don't mandate it
    fields: z.array(
      z.union([BookUpdateValuesSchemaV2.keyof(), z.literal("uuid")]),
    ),
    userId: uuidv4,
  })
  .superRefine((data, ctx) => {
    const { fields } = data
    const mask = new Set(fields)

    if (mask.has("title") && !data.title) {
      ctx.addIssue({
        code: "invalid_type",
        expected: "string",
      })
    }

    if (mask.has("status") && !data.status) {
      ctx.addIssue({
        code: "invalid_type",
        // UUID?
        expected: "string",
      })
    }

    if (data.userBookRating) {
      const { rating, review } = data.userBookRating
      if (rating == null && review == null) {
        ctx.addIssue({
          code: "custom",
          message: "Either rating or review must be provided",
        })
      }
    }

    if (
      mask.has("publicationDate") &&
      data.publicationDate &&
      !toIsoDateString(data.publicationDate)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["publicationDate"],
        message: `"${data.publicationDate}" is not a valid publication date. Use a year, YYYY-MM-DD, or a full ISO timestamp.`,
      })
    }

    if (
      mask.has("releaseDate") &&
      data.releaseDate &&
      !toIsoDateString(data.releaseDate)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["releaseDate"],
        message: `"${data.releaseDate}" is not a valid release date. Use a year, YYYY-MM-DD, or a full ISO timestamp.`,
      })
    }
  })
  .transform((data) => {
    const mask = new Set(data.fields)
    const creators = [...(data.creators ?? [])]
    if (mask.has("narrators")) {
      creators.push(
        ...(data.narrators ?? []).map((name) => ({
          name,
          fileAs: name,
          role: "nrt" as const,
        })),
      )
    }
    if (mask.has("authors")) {
      creators.push(
        ...(data.authors ?? []).map((name) => ({
          name,
          fileAs: name,
          role: "aut" as const,
        })),
      )
    }

    return {
      updates: {
        // Enforced in superRefine
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ...(mask.has("title") && { title: data.title! }),
        ...(mask.has("subtitle") && { subtitle: data.subtitle }),
        ...(mask.has("language") && { language: data.language }),
        ...(mask.has("description") && { description: data.description }),
        ...(mask.has("publicationDate") && {
          publicationDate: data.publicationDate
            ? toIsoDateString(data.publicationDate)
            : null,
        }),
        ...(mask.has("releaseDate") && {
          releaseDate: data.releaseDate
            ? toIsoDateString(data.releaseDate)
            : null,
        }),
        ...(mask.has("pageCount") && { pageCount: data.pageCount }),
        ...(mask.has("duration") && { duration: data.duration }),
        ...(mask.has("coverColorsOverride") && {
          coverColorsOverride:
            data.coverColorsOverride && data.coverColorsOverride.length > 0
              ? JSON.stringify(data.coverColorsOverride)
              : null,
        }),
      },
      relations: {
        ...(mask.has("creators") && { creators }),
        ...(mask.has("series") && { series: data.series }),
        ...(mask.has("collections") && { collections: data.collections }),
        ...(mask.has("tags") && { tags: data.tags }),
        ...(mask.has("status") && {
          // Enforced in superRefine
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          status: { statusUuid: data.status!, userId: data.userId },
        }),
        ...(mask.has("userBookRating") && {
          userBookRating: data.userBookRating
            ? { ...data.userBookRating, userId: data.userId }
            : { userId: data.userId },
        }),
        ...(mask.has("identifiers") && { identifiers: data.identifiers }),
      },
      files: {
        textCover: data.textCover,
        audioCover: data.audioCover,
      },
    }
  })
