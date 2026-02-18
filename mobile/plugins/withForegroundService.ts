import { type ExpoConfig } from "expo/config"
import { withAndroidManifest, withStringsXml } from "expo/config-plugins"

export default function withForegroundService(config: ExpoConfig) {
  config = withStringsXml(config, async (config) => {
    config.modResults.resources.string ??= []
    if (
      !config.modResults.resources.string.some(
        (string) => string.$.name === "empty",
      )
    ) {
      config.modResults.resources.string.push({
        _: "",
        $: {
          name: "empty",
        },
      })
    }
    if (
      !config.modResults.resources.string.some(
        (string) => string.$.name === "audioPlaybackAttribution",
      )
    ) {
      config.modResults.resources.string.push({
        _: "This app plays audio",
        $: {
          name: "audioPlaybackAttribution",
        },
      })
    }
    return config
  })

  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest
    // @ts-expect-error This works, not sure why it's not in the type
    manifest["attribution"] = [
      {
        $: {
          "android:tag": "@string/empty",
          "android:label": "@string/audioPlaybackAttribution",
        },
      },
      {
        $: {
          "android:tag": "audioPlayback",
          "android:label": "@string/audioPlaybackAttribution",
        },
      },
    ]

    const mainApplication = config.modResults.manifest.application?.[0]

    if (!mainApplication) return config

    if (!mainApplication["service"]) {
      mainApplication["service"] = []
    }

    const exists = mainApplication["service"].some(
      (service) =>
        service.$["android:name"] === "expo.modules.readium.PlaybackService",
    )

    if (exists) return config

    mainApplication["service"].push({
      $: {
        "android:name": "expo.modules.readium.PlaybackService",
        "android:foregroundServiceType": "mediaPlayback",
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "androidx.media3.session.MediaSessionService",
              },
            },
            {
              $: {
                "android:name": "android.media.browse.MediaBrowserService",
              },
            },
          ],
        },
      ],
    })

    return config
  })
}
