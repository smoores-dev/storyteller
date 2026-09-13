// exclusions for the alignment process
import type { EpubReader, ManifestItem } from "@storyteller-platform/epub"

export const EXCLUSION_TIERS = ["definitive", "tentative", "no"]
export type ExclusionTier = (typeof EXCLUSION_TIERS)[number]

export const EXCLUSION_VERDICTS = ["exclude", "review", "include"]
export type ExclusionVerdict = (typeof EXCLUSION_VERDICTS)[number]

export type ExclusionSignal = {
  tier: ExclusionTier
  value: string
}

export type ExclusionDecision = {
  tier: ExclusionTier
  verdict: ExclusionVerdict
  value: string
}

type SpineClassificationBase = {
  id: string
  index: number
}

export type SpineClassificationInclude = SpineClassificationBase & {
  verdict: "include"
  value: string
  decidedBy?: never
  signals?: never
  tier?: never
  zone: "front" | "body" | "back"
}

export type SpineClassificationExclude = SpineClassificationBase & {
  tier: ExclusionTier
  verdict: "exclude" | "review"
  decidedBy: ExclusionDecision
  signals: ExclusionSignal[]
}

export type SpineClassification =
  | SpineClassificationInclude
  | SpineClassificationExclude

const landmarkSignal = {
  cover: {
    tier: "definitive",
    value: "cover",
  },
  titlepage: {
    tier: "definitive",
    value: "titlepage",
  },
  toc: {
    tier: "definitive",
    value: "toc",
  },
  index: {
    tier: "definitive",
    value: "index",
  },
  loi: {
    tier: "definitive",
    value: "loi",
  },
  lot: {
    tier: "definitive",
    value: "lot",
  },
  lof: {
    tier: "definitive",
    value: "lof",
  },
  frontmatter: {
    tier: "definitive",
    value: "frontmatter",
  },
  copyright: {
    tier: "definitive",
    value: "copyright",
  },
} satisfies Record<string, ExclusionSignal>

export function excludeChapter(
  chapter: ManifestItem,
  landmarks: Landmarks,
): ExclusionSignal[] {}

export async function classifySpine(
  epub: EpubReader,
  //   manifest: Record<string, ManifestItem>,
): Promise<SpineClassification[]> {
  // first, will be cached
  const manifest = await epub.getManifest()

  const spine = await epub.getSpineItems()
  const landmarks = await epub.getLandmarks()
  console.log("AAAAAAAAAA", landmarks)

  const classifications: SpineClassification[] = []
  for (const [index, item] of spine.entries()) {
    const signals: ExclusionSignal[] = []

    console.log("item", item)

    if (landmarks) {
      for (const { title, href, children } of landmarks.children) {
        if (href !== item.href) continue
        const signal = landmarkSignal[title]
        if (signal) {
          signals.push(signal)
        }
      }
    }

    if (signals.length > 0) {
      const classification: SpineClassification = {
        id: item.id,
        index,
        verdict: "exclude",
        decidedBy: {
          tier: "definitive",
          verdict: "exclude",
          value: "landmark",
        },
        signals,
      }
      classifications.push(classification)
      continue
    }
    const classification: SpineClassification = {
      id: item.id,
      index,
      verdict: "include",
    }
    classifications.push(classification)
  }

  //   const chapter = manifest[chapterId]

  return classifications
}
