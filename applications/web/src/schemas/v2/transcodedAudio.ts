import z from "zod"

export const TranscodedAudioFileSchemaV2 = z.object({
  name: z.string().meta({
    description: "The file's name inside the book's transcoded audio folder.",
  }),
  duration: z.number().nullable().meta({
    description: "Length in seconds, null when the file could not be probed.",
  }),
  present: z.boolean().meta({
    description:
      "False for files the latest alignment report references that are no longer on disk.",
  }),
})

export const TranscodedAudioFilesSchemaV2 = z.array(TranscodedAudioFileSchemaV2)

export type TranscodedAudioFile = z.infer<typeof TranscodedAudioFileSchemaV2>
