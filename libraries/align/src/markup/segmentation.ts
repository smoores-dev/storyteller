import {
  type SegmentationResult,
  segmentText,
} from "@echogarden/text-segmentation"

export async function segmentChapter(
  text: string,
  options: { primaryLocale?: Intl.Locale | null | undefined },
): Promise<SegmentationResult["sentences"]> {
  const result = await segmentText(text, {
    ...(options.primaryLocale && {
      language: options.primaryLocale.language,
    }),
    // TODO: re-enable this, only disabled until we figure out
    // why it's not working in the SEA!
    enableEastAsianPostprocessing: false,
  })

  return result.sentences
}
