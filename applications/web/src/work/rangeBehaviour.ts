import { type Settings } from "@/apiModels"

export const DEFAULT_GAP_SECONDS = 5
export const DEFAULT_AUDIO_CHAPTER_SECONDS = 60
export const DEFAULT_DROP_UNREAD = true
export const DEFAULT_AUTO_EXCLUDE = true

export function rangeBehaviourSettings(
  settings: Pick<
    Settings,
    | "alignmentGapSeconds"
    | "alignmentAudioChapterSeconds"
    | "alignmentDropUnread"
    | "alignmentAutoExclude"
  >,
) {
  return {
    gapSeconds: settings.alignmentGapSeconds ?? DEFAULT_GAP_SECONDS,
    audioChapterSeconds:
      settings.alignmentAudioChapterSeconds ?? DEFAULT_AUDIO_CHAPTER_SECONDS,
    dropUnread: settings.alignmentDropUnread ?? DEFAULT_DROP_UNREAD,
    autoExclude: settings.alignmentAutoExclude ?? DEFAULT_AUTO_EXCLUDE,
  }
}
