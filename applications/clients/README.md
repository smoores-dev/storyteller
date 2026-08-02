# Storyteller v3 Clients

The native Storyteller clients: a book reading app for ebooks, audiobooks, and
readaloud books, with tight Storyteller server integration. Shared Swift code
lives in [`libraries/StorytellerKit`](../../libraries/StorytellerKit); this
directory holds the app shells and build scripts. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup.

## TestFlight

[Join the beta on TestFlight](https://testflight.apple.com/join/9Cvs89nz)

## Implemented Features

- Support for ebooks, audiobooks, and readaloud books
- iOS, macOS, tvOS, CarPlay and Apple Watch support
- Playback readaloud books with audio-text sync (with mid-sentence page flips)
- Storyteller server integration (optional)
- Customizable playback speed (0.75x - 10x)
- Customizable fonts, spacing, margins, and colors
- EPUB and M4B format support
- Sleep timer
- Full text search
- Offline reading

## Screenshots

### macOS

![Library](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/mac_library.png)

| Reader                                                                                                 | Reader                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| ![Book 1](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/mac_book1.png) | ![Book 2](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/mac_book2.png) |

### iOS

| Library                                                                                                   | Reader                                                                                                 | Reader                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| ![Library](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/ios_library.png) | ![Book 1](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/ios_book1.png) | ![Book 2](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/ios_book2.png) |

### watchOS

| Main                                                                                                  | Library                                                                                                     | Player                                                                                                    | Readaloud                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ![Main](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/watch_main.png) | ![Library](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/watch_library.png) | ![Player](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/watch_player.png) | ![Readaloud](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/watch_readaloud.png) |

### tvOS

| Library                                                                                                    | Reader                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ![Library](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/tvos_library.png) | ![Book 1](https://raw.githubusercontent.com/kyonifer/s-r-assets/screenshots/screenshots/tvos_book1.png) |

## Design Goals

- First-class support for reading ebooks with synced audio narration (readaloud
  books)
- Native look and feel, especially on desktop (macOS only currently)
- Support full integration into a
  [storyteller server](https://storyteller-platform.gitlab.io/storyteller/),
  including progress sync
- Support usage as a standalone desktop app
- Allow a highly customizable reading experience

## Development Goals

- Cross-platform native desktop experience as a primary target
- Re-use existing ecosystem when possible (foliate-js, storyteller)
- Modular approach to enable the suite to grow into more use cases in the future
- Minimum dependencies, in order to enable a portable cross-platform
  implementation. Reinventing the wheel is preferable to limiting our target
  platforms.

## Roadmap

Currently the macOS Reader app is the priority (with iOS a close second).
However, the hope is to support Linux in the future, with potential plans to
expand to Windows in the distant future. I don't read on Windows or Android, so
these targets may require an interested contributor.

# Building From Source

See [the contributing documentation](CONTRIBUTING.md) for more information. This
project is highly experimental currently, so no pre-built executables are
available. This is expected to change once things are more complete.

## Swift Package Consumers

Storyteller exposes its shared model and app shells as SwiftPM products:

- `StorytellerKit` contains the platform-neutral core library.
- `StorytellerAppleKit` contains the SwiftUI app shells for macOS, iOS, tvOS,
  and watchOS.
- `StorytellerContentServer` provides the optional macOS local content-server
  integration.
- `StorytellerReadaloud` provides the optional readaloud alignment engine.

An Apple host app can import `StorytellerAppleKit` and call the platform entry
point from its own `@main` trampoline:

```swift
import StorytellerAppleKit

@main
enum HostApp {
    static func main() {
        #if os(macOS)
        macAppEntryPoint()
        #elseif os(iOS)
        iosAppEntryPoint()
        #elseif os(tvOS)
        tvAppEntryPoint()
        #elseif os(watchOS)
        watchAppEntryPoint()
        #endif
    }
}
```

Optional integrations are injected with `StorytellerEnvironment`. Link
`StorytellerContentServer` on macOS and `StorytellerReadaloud` on macOS or iOS
when those capabilities should be present. Features backed by a missing provider
are hidden by the UI.

The entry points install the Apple platform services (audio playback,
now-playing and remote commands, keychain, font metadata) automatically. To
substitute your own implementations, call `StorytellerPlatform.bootstrap(...)`
before the entry point and it will be respected.

Host apps must provide their own bundle identifiers, signing, entitlements, and
Info.plist values. The local Xcode project is the reference configuration for
keychain access groups, local-network usage text, iOS background fetch/audio
modes, CarPlay scene configuration, watch app embedding, and the platform
minimums declared in `Package.swift`.

The bundled reader web assets and Storyteller title font are SwiftPM resources
on `StorytellerAppleKit`, so consumers do not need separate Xcode resource
phases for `WebResources`, `foliate-js`, or fonts.

# Privacy Policy

Storyteller does not collect any data whatsoever. All your reading data stays on
your device (or syncs to your own self-hosted Storyteller server if you choose
to configure one).
