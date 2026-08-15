# Contributing

## Layout

The native clients live in two places in the monorepo:

- `libraries/StorytellerKit` holds the shared Swift sources (Kit, AppleKit,
  ContentServer, Readaloud, Node) and their bundled resources, exported as
  SwiftPM products by the `Package.swift` at the monorepo root.
- `applications/clients` (this directory) holds the app shells: the generated
  Xcode project for Apple platforms, the Android app, the Linux app, the widget
  sources, and the build scripts.

All `scripts/` commands below are run from this directory.

## Architecture

Read [ARCHITECTURE.md](ARCHITECTURE.md) first. It maps the SwiftPM products,
dependency injection model, Apple package, and app shells that make up the
client codebase.

## Building on macOS

### Preparation

- Install `xcodegen` and `xcbeautify` from Homebrew.
- Install Xcode CLI Tools and accept the Xcode license
- Copy `XCodeApps/Configs/Local.example.xcconfig` to
  `XCodeApps/Configs/Local.xcconfig`.
- Set `DEVELOPMENT_TEAM` in that file, and override the bundle IDs and keychain
  settings for your local signing namespace. The default bundle ID
  (`dev.smoores.Storyteller`) can only be signed by the official Storyteller
  team, so device and macOS builds need these overrides.
- Run `scripts/genicons` before your initial build. It derives every icon and
  the `Storyteller.icon` bundle from
  `applications/mobile/assets/storyteller-ios.icon`, none of which are checked
  in. You will need `imagemagick` from Homebrew for this step.
- Run `scripts/genxproj` after `genicons`, and again whenever `project.yml`
  changes. This script generates `Storyteller.xcodeproj`.

### Building Using XCode

- Open the generated `Storyteller.xcodeproj` file and use Xcode to build the
  project for your desired target.

### Building Using the Terminal

- Run `scripts/macbuild` and `scripts/iosbuild` to build in the terminal for
  those respective targets.
- Run `scripts/macrun` and `scripts/iosrun` to launch the application once
  built. `iosrun` may need tweaking for your installed simulator.

## Building the Node Addon

`scripts/nodebuild` builds the `StorytellerNodeKit` addon on macOS or Linux. See
[docs/NODE_INTEGRATION.md](docs/NODE_INTEGRATION.md) for the exports it provides
and what a consumer needs at runtime.

## Building on Other Platforms

Not supported yet, but coming soon. You can try playing around with the
`scripts/linuxbuild` and `linuxrun` if you want to, though.

### Android (experimental)

`scripts/androidbuild` cross-compiles the `StorytellerAndroidBridge` package
(`AndroidApp/swift`) with the Swift SDK for Android, generates Kotlin-callable
JNI bindings via swift-java's jextract plugin, stages the `.so` set into
jniLibs, and assembles the debug APK. It needs a swift.org toolchain with the
matching `swift sdk install` Android bundle (versions must match exactly; the
Xcode toolchain cannot cross-compile), an Android SDK/NDK (default location
`~/Library/Android/sdk`, override with `ANDROID_HOME`), and a host JDK 17+. Use
`--swift-only` or `--apk-only` for partial builds.

`scripts/androidrun` installs and launches the built APK, booting the first
available emulator AVD if no device is connected (override with
`STORYTELLER_ANDROID_AVD`, or plug in a device with USB debugging enabled).

## SourceKit-LSP Completion

If you are using SourceKit-LSP for code completion, run `scripts/initcompletion`
once; it builds `StorytellerAppleKit` for macOS and the iOS simulator so the LSP
has indexes for both.

## Coding Style & Naming Conventions

Follow standard Swift design guidelines for naming and spacing. Keep SwiftUI
view files small and favor breakout views when deep nesting occurs. Use
`scripts/format` to format all files before commit, and obey its decisions
(consistency is better than personal preference).
