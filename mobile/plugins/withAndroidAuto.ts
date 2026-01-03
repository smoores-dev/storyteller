import * as fs from "fs"
import * as path from "path"

import { type ExpoConfig } from "expo/config"
import { withAndroidManifest, withDangerousMod } from "expo/config-plugins"

const AUTOMOTIVE_APP_DESC = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="media" />
</automotiveApp>
`

export default function withAndroidAuto(config: ExpoConfig) {
  // Add the automotive_app_desc.xml resource file
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      )

      // Create xml directory if it doesn't exist
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true })
      }

      const xmlPath = path.join(xmlDir, "automotive_app_desc.xml")
      fs.writeFileSync(xmlPath, AUTOMOTIVE_APP_DESC)

      return config
    },
  ])

  // Add the meta-data to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application?.[0]

    if (mainApplication) {
      if (!mainApplication["meta-data"]) {
        mainApplication["meta-data"] = []
      }

      // Check if meta-data already exists
      const exists = mainApplication["meta-data"].some(
        (meta) =>
          meta.$?.["android:name"] === "com.google.android.gms.car.application",
      )

      if (!exists) {
        mainApplication["meta-data"].push({
          $: {
            "android:name": "com.google.android.gms.car.application",
            "android:resource": "@xml/automotive_app_desc",
          },
        })
      }
    }

    return config
  })

  return config
}
