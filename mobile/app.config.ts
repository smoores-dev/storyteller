import "tsx/cjs"
import type { ExpoConfig, ConfigContext } from "expo/config"
import packageInfo from "./package.json"

const IS_DEV = process.env["APP_VARIANT"] === "development"

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    owner: "storyteller-platform",
    name: IS_DEV ? "Storyteller (dev)" : "Storyteller",
    slug: "storyteller",
    version: packageInfo.version,
    orientation: "portrait",
    icon: "./assets/Storyteller_Logo.png",
    userInterfaceStyle: "automatic",
    scheme: "storyteller",
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          ios: { deploymentTarget: "15.5" },
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            buildToolsVersion: "35.0.0",
            usesCleartextTraffic: true,
          },
        },
      ],
      [
        "expo-font",
        {
          fonts: [
            "./assets/fonts/YoungSerif.ttf",
            "./assets/fonts/OpenDyslexic-Regular.otf",
            "./assets/fonts/OpenDyslexic-Bold.otf",
            "./assets/fonts/OpenDyslexic-Bold-Italic.otf",
            "./assets/fonts/OpenDyslexic-Italic.otf",
            "./node_modules/@expo-google-fonts/literata/Literata_500Medium.ttf",
          ],
        },
      ],
      [
        "expo-document-picker",
        {
          iCloudContainerEnvironment: IS_DEV ? "Development" : "Production",
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/Storyteller_Logo.png",
          resizeMode: "contain",
          imageWidth: 300,
          backgroundColor: "#ffffff",
          dark: {
            image: "./assets/Storyteller_Logo.png",
            imageWidth: 300,
            backgroundColor: "#000000",
            resizeMode: "contain",
          },
        },
      ],
      ["./plugins/withAndroidJetifier.ts"],
      ["./plugins/withKeyDownEvents.ts", { keyCodes: [92, 93] }],
      [
        "./plugins/withPods.ts",
        {
          pods: [
            "pod 'Minizip', modular_headers: true",
            "pod 'ZIPFoundation', '~> 0.9'",
            "pod 'R2Shared', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumShared.podspec'",
            "pod 'R2Streamer', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumStreamer.podspec'",
            "pod 'R2Navigator', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumNavigator.podspec'",
            "pod 'ReadiumAdapterGCDWebServer', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumAdapterGCDWebServer.podspec'",
            "pod 'ReadiumOPDS', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumOPDS.podspec'",
            "pod 'ReadiumInternal', podspec: 'https://raw.githubusercontent.com/readium/swift-toolkit/2.7.4/Support/CocoaPods/ReadiumInternal.podspec'",
            "pod 'Fuzi', podspec: 'https://raw.githubusercontent.com/readium/Fuzi/refs/heads/master/Fuzi.podspec'",
            "pod 'ReadiumGCDWebServer', podspec: 'https://raw.githubusercontent.com/readium/GCDWebServer/4.0.0/GCDWebServer.podspec', modular_headers: true])",
          ],
        },
      ],
    ],
    runtimeVersion: {
      policy: "appVersion",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
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
        UIBackgroundModes: ["audio", "fetch"],
        NSMicrophoneUsageDescription:
          "This permission is not needed by the app, but it is required by an underlying API. If you see this dialog, contact us.",
      },
    },
    android: {
      package: IS_DEV
        ? "dev.smoores.Storyteller.dev"
        : "dev.smoores.Storyteller",
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
}
