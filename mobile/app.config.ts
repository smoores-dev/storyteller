import { type ConfigContext, type ExpoConfig } from "expo/config"
import "tsx/cjs"

import packageInfo from "./package.json"

const IS_DEV = process.env["APP_VARIANT"] === "development"

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    owner: "storyteller-platform",
    name: IS_DEV ? "Storyteller (dev)" : "Storyteller",
    slug: "storyteller",
    version: packageInfo.version,
    icon: "./assets/Storyteller_Logo.png",
    userInterfaceStyle: "automatic",
    scheme: "storyteller",
    experiments: {
      reactCompiler: true,
    },
    plugins: [
      "expo-background-task",
      "expo-web-browser",
      "expo-router",
      "expo-secure-store",
      "expo-sqlite",
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
      [
        "react-native-edge-to-edge",
        {
          android: {
            parentTheme: "Default",
            enforceNavigationBarContrast: false,
          },
        },
      ],
      ["./plugins/withAndroidJetifier.ts"],
      ["./plugins/withKeyDownEvents.ts", { keyCodes: [92, 93] }],
      [
        "./plugins/withPodSources.ts",
        {
          sources: [
            "source 'https://github.com/readium/podspecs'",
            "source 'https://cdn.cocoapods.org/'",
          ],
        },
      ],
      [
        "./plugins/withPods.ts",
        {
          pods: [
            "pod 'Minizip', modular_headers: true",
            "pod 'ZIPFoundation', '~> 0.9'",
            "pod 'ReadiumShared', '~> 3.5.0'",
            "pod 'ReadiumStreamer', '~> 3.5.0'",
            "pod 'ReadiumNavigator', '~> 3.5.0'",
            "pod 'ReadiumOPDS', '~> 3.5.0'",
            "pod 'ReadiumLCP', '~> 3.5.0'",
            "pod 'ReadiumAdapterGCDWebServer', '~> 3.5.0', modular_headers: true",
          ],
        },
      ],
      ["./plugins/withModularHeaders.ts"],
      ["./plugins/withCoreLibraryDesugaring.ts"],
      ["./plugins/withAndroidAuto.ts"],
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
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: "EPUB",
            LSItemContentTypes: ["org.idpf.epub-container"],
            LSHandlerRank: "Owner",
          },
        ],
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
      // This doesn't work yet
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: "VIEW",
          data: [
            {
              mimeType: "application/epub+zip",
              scheme: "content",
            },
            {
              mimeType: "application/epub+zip",
              scheme: "file",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
        {
          action: "VIEW",
          data: [
            {
              mimeType: "*/*",
              pathPattern: ".*\\.epub",
              scheme: "content",
            },
            {
              mimeType: "*/*",
              pathPattern: ".*\\.epub",
              scheme: "file",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    extra: {
      eas: {
        projectId: "3cc95011-19af-4637-a666-e1bec160c0f8",
      },
    },
  }
}
