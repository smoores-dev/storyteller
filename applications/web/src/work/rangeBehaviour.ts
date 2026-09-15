import { type Settings } from "@/apiModels"
import { SETTINGS_DEFAULTS } from "@/database/settingsTypes"

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
    gapSeconds:
      settings.alignmentGapSeconds ?? SETTINGS_DEFAULTS.alignmentGapSeconds,
    audioChapterSeconds:
      settings.alignmentAudioChapterSeconds ??
      SETTINGS_DEFAULTS.alignmentAudioChapterSeconds,
    dropUnread:
      settings.alignmentDropUnread ?? SETTINGS_DEFAULTS.alignmentDropUnread,
    autoExclude:
      settings.alignmentAutoExclude ?? SETTINGS_DEFAULTS.alignmentAutoExclude,
  }
}
