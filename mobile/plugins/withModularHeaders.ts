import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { mergeContents } from "@expo/config-plugins/build/utils/generateCode.js"
import { type ExpoConfig } from "expo/config"
import { withDangerousMod } from "expo/config-plugins"

export default function withModularHeaders(config: ExpoConfig) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const filePath = join(config.modRequest.platformProjectRoot, "Podfile")
      const contents = await readFile(filePath, "utf-8")
      const merged = mergeContents({
        tag: "react-native-modular-headers",
        src: contents,
        newSrc: `use_modular_headers!`,
        anchor: /^target 'Storyteller/,
        offset: 0,
        comment: "#",
      })

      if (merged.didMerge || merged.didClear) {
        await writeFile(filePath, merged.contents)
      }

      return config
    },
  ])
}
