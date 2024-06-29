import path from "node:path"
import fs from "node:fs"
import { withDangerousMod } from "@expo/config-plugins"
import type { ExpoConfig, ConfigContext } from "expo/config"
import { mergeContents } from "@expo/config-plugins/build/utils/generateCode"

const IS_DEV = process.env["APP_VARIANT"] === "development"

export default ({ config }: ConfigContext): ExpoConfig => {
  const initialConfig: ExpoConfig = {
    ...config,
    name: IS_DEV ? "Storyteller (dev)" : "Storyteller",
    slug: "storyteller",
    version: "1.5.0",
    orientation: "portrait",
    icon: "./assets/Storyteller_Logo.png",
    userInterfaceStyle: "automatic",
    scheme: "storyteller",
    plugins: [
      "expo-router",
      [
        "expo-build-properties",
        {
          ios: { deploymentTarget: "15.5" },
          android: {
            compileSdkVersion: 34,
            buildToolsVersion: "34.0.0",
            usesCleartextTraffic: true,
            kotlinVersion: "1.9.24",
          },
        },
      ],
      [
        "expo-font",
        {
          fonts: [
            "./assets/fonts/Bookerly.ttf",
            "./assets/fonts/Bookerly Bold.ttf",
            "./assets/fonts/YoungSerif.ttf",
          ],
        },
      ],
      [
        "expo-document-picker",
        {
          iCloudContainerEnvironment: IS_DEV ? "Development" : "Production",
        },
      ],
    ],
    updates: {
      url: "https://u.expo.dev/3cc95011-19af-4637-a666-e1bec160c0f8",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    splash: {
      image: "./assets/Storyteller_Logo.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: IS_DEV
        ? "dev.smoores.Storyteller.dev"
        : "dev.smoores.Storyteller",
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        UISupportsDocumentBrowser: true,
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
        UIBackgroundModes: ["audio"],
        NSMicrophoneUsageDescription:
          "This permission is not needed by the app, but it is required by an underlying API. If you see this dialog, contact us.",
      },
    },
    android: {
      package: IS_DEV
        ? "dev.smoores.Storyteller.dev"
        : "dev.smoores.Storyteller",
      versionCode: 17,
      adaptiveIcon: {
        foregroundImage: "./assets/Storyteller_Logo.png",
        backgroundColor: "#ffffff",
      },
    },
    extra: {
      eas: {
        projectId: "3cc95011-19af-4637-a666-e1bec160c0f8",
      },
    },
  }

  return withDangerousMod(initialConfig, [
    "ios",
    async (config) => {
      const filePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      )
      const contents = await fs.promises.readFile(filePath, "utf-8")
      const merged = mergeContents({
        tag: "react-native-readium",
        src: contents,
        newSrc: `  pod 'Minizip', modular_headers: true
  pod 'R2Shared', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumShared.podspec'
  pod 'R2Streamer', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumStreamer.podspec'
  pod 'R2Navigator', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumNavigator.podspec'
  pod 'ReadiumAdapterGCDWebServer', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumAdapterGCDWebServer.podspec'
  pod 'ReadiumOPDS', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumOPDS.podspec'
  pod 'ReadiumInternal', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.6.1/Support/CocoaPods/ReadiumInternal.podspec'
  pod 'GCDWebServer', podspec: 'https://raw.githubusercontent.com/readium/GCDWebServer/3.7.4/GCDWebServer.podspec', modular_headers: true
`,
        anchor: /use_native_modules/,
        offset: 0,
        comment: "#",
      })

      if (merged.didMerge || merged.didClear) {
        await fs.promises.writeFile(filePath, merged.contents)
      }

      return config
    },
  ])
}
