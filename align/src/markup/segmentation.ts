import {
  type SegmentationResult,
  segmentText,
} from "@echogarden/text-segmentation"

import { type ParsedXml } from "@storyteller-platform/epub"

import { type Mapping } from "./map.ts"
import { parseDom } from "./parseDom.ts"
import { liftText } from "./transform.ts"

export async function getXhtmlSegmentation(
  xml: ParsedXml,
  options: { primaryLocale?: Intl.Locale | null | undefined },
): Promise<{ result: SegmentationResult["sentences"]; mapping: Mapping }> {
  const root = parseDom(xml)

  const { result: text, mapping } = liftText(root)
  const result = await segmentText(text, {
    ...(options.primaryLocale && {
      language: options.primaryLocale.language,
    }),
    enableEastAsianPostprocessing: true,
  })

  return { result: result.sentences, mapping }
}
