import { type Settings } from "@/apiModels"
import { SETTINGS_DEFAULTS } from "@/database/settingsTypes"

export function rangeBehaviourSettings(
  settings: Pick<Settings, "alignmentAutoExclude">,
) {
  return {
    autoExclude:
      settings.alignmentAutoExclude ?? SETTINGS_DEFAULTS.alignmentAutoExclude,
  }
}
