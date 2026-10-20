import { z } from "zod"

import { UriFragment } from "@storyteller-platform/uri-fragment"

import { isAudioFile } from "@/audio.ts"

export const DeviceObjectSchema = z.object({
  id: z.url(),
  name: z.string(),
})

export const UriReferenceSchema = z.stringFormat("uri-reference", (val) =>
  URL.canParse(val, "epub:///"),
)

export const ProgressionDocumentSchema = z
  .object({
    title: z.string().optional(),
    modified: z.iso.datetime(),
    device: DeviceObjectSchema,
    progression: z.number().min(0).max(1),
    references: z.array(UriReferenceSchema).nonempty(),
  })
  .superRefine((value, ctx) => {
    const { references } = value

    let charRef = false
    let tRef = false

    for (let i = 0; i < references.length; i++) {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const ref = references[i]!
      const url = new URL(ref, "epub:///")
      const { pathname, hash } = url
      const fragment = new UriFragment(hash)

      if (isAudioFile(pathname)) {
        if (
          fragment.identifier?.kind === "media" &&
          fragment.identifier.media.temporal
        ) {
          if (tRef) {
            ctx.addIssue({
              code: "custom",
              path: ["references", i],
              message:
                "Only one reference to an audio file with a media URI fragment is allowed.",
            })
          } else {
            tRef = true
          }
        } else {
          ctx.addIssue({
            code: "custom",
            path: ["references", i],
            message:
              "References to audio files must include a media URI fragment specifying a time.",
          })
        }
      }

      if (fragment.identifier?.kind === "char") {
        if (charRef) {
          ctx.addIssue({
            code: "custom",
            path: ["references", i],
            message:
              "Only one reference to an XHTML file with a character position URI fragment is allowed.",
          })
        } else {
          charRef = true
        }
      }
    }
  })

export type ProgressionDocument = z.infer<typeof ProgressionDocumentSchema>
