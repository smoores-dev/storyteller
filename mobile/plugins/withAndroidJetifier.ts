import { type ExpoConfig } from "expo/config"
import { withGradleProperties } from "expo/config-plugins"

export default function withAndroidJetifier(config: ExpoConfig) {
  return withGradleProperties(config, (config) => {
    config.modResults.push({
      type: "property",
      key: "android.enableJetifier",
      value: "true",
    })
    return config
  })
}
