import z from "zod"

export const ImageColorSchemaV2 = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
  fraction: z.optional(
    z.number().meta({
      description:
        "The mask-weighted fraction of pixels covered by this color, 0-1.",
    }),
  ),
  chroma: z.optional(
    z.number().meta({
      description: "The oklab chroma of this color, normalized to 0-1.",
    }),
  ),
})

export const ImageSchemaV2 = z.object({
  sha256: z.string().meta({
    description:
      "The hash of the original image bytes. Addresses the image at `/api/v2/images/{sha256}`, which is immutable and safe to cache forever.",
  }),
  width: z.number().meta({
    description:
      "The width of the original image in pixels. Resized variants preserve the aspect ratio, so this is the ratio to lay out against.",
  }),
  height: z.number().meta({
    description: "The height of the original image in pixels.",
  }),
  blurhash: z.nullish(
    z.string().meta({
      description: "A blurhash placeholder to show while the image loads.",
    }),
  ),
  colors: z.nullish(
    z.array(ImageColorSchemaV2).meta({
      description: "The prominent colors in this image, most prominent first.",
    }),
  ),
})
