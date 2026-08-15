# Architecture

Our goal is to develop Storyteller around a low-dependency Swift core that can
be used on any platform Swift runs on. To that end, the majority of the
algorithmic code lives in
[`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit), including EPUB
parsing, playback coordination, library persistence, and Storyteller API logic.
When that code needs platform services, such as audio playback or keychain
storage, it calls facade protocols that each platform implements and provides
through dependency injection.

This repository builds that core library plus the app shells that use it. At a
high level:

- [`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) is the portable
  core library.
- [`Facades`](../../libraries/StorytellerKit/Sources/Kit/Facades) is the
  platform compatibility layer used by the portable core when it needs platform
  services.
- [`StorytellerAppleKit`](../../libraries/StorytellerKit/Sources/AppleKit)
  implements that compatibility layer for Apple platforms and contains shared
  Apple-only app code.
- [`LinuxApp`](./LinuxApp) implements that compatibility layer for Linux where
  support exists and contains the Linux app shell.
- [`XCodeApps`](./XCodeApps) contains the generated Xcode definitions for the
  Apple app shells that wrap the Apple app entry points.

## StorytellerKit

[`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) is the
cross-platform core library. It owns the models, persistence, parsing, playback
coordination, Storyteller API logic, migrations, and utility actors that all app
shells use.

The root package exports it as the
[`StorytellerKit` SwiftPM product](../../Package.swift). Its dependency set
should stay small and portable so other apps can import it without also
importing platform frameworks or heavyweight app dependencies.

Important areas:

- [`Models`](../../libraries/StorytellerKit/Sources/Kit/Models) for shared data
  types. Among them,
  [`BookMetadataCandidate`](../../libraries/StorytellerKit/Sources/Kit/Models/BookMetadataCandidate.swift)
  and
  [`CoverCandidate`](../../libraries/StorytellerKit/Sources/Kit/Models/CoverCandidate.swift)
  are the shapes every metadata and cover provider is adapted into, so the
  metadata editor and the Node addon compare the same fields.
- [`Actors`](../../libraries/StorytellerKit/Sources/Kit/Actors) for library,
  playback, downloads, Storyteller, and progress logic.
- [`EPUB`](../../libraries/StorytellerKit/Sources/Kit/EPUB) for EPUB and SMIL
  parsing.
- [`Facades`](../../libraries/StorytellerKit/Sources/Kit/Facades), described
  below.

## Dependency Injection

[`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) still needs
platform functionality for things such as audio playback and keychain storage.
It depends on those services through protocols in
[`StorytellerKit/Sources/Kit/Facades`](../../libraries/StorytellerKit/Sources/Kit/Facades),
not through platform frameworks directly. Apple, Linux, and future app shells
implement those protocols and inject implementations during startup.

There are two injection paths:

- [`StorytellerPlatform`](../../libraries/StorytellerKit/Sources/Kit/Facades/StorytellerPlatform.swift)
  is a set-once platform service registry. Nonisolated core actors read it when
  they need platform services. App shells or platform packages call
  `StorytellerPlatform.bootstrap(...)` during startup to select which platform
  implementation provides those services.
- [`StorytellerEnvironment`](../../libraries/StorytellerKit/Sources/Kit/Facades/StorytellerEnvironment.swift)
  carries optional UI-level capabilities, currently content server support and
  readaloud alignment. Entry points receive it and pass it through the SwiftUI
  environment.

## StorytellerAppleKit

[`StorytellerAppleKit`](../../libraries/StorytellerKit/Sources/AppleKit) depends
on [`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) and provides
Apple implementations of the
[`platform facade protocols`](../../libraries/StorytellerKit/Sources/Kit/Facades).
Those implementations live in
[`Shared/Platform`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform):

- [`ApplePlatformBootstrap`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/ApplePlatformBootstrap.swift)
  installs default Apple providers unless a host app already bootstrapped custom
  providers.
- [`AppleAudioPlayerFactory`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/AppleAudioPlayerFactory.swift)
  creates the AVFoundation audio players.
- [`MediaNowPlayingPresenter`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/MediaNowPlayingPresenter.swift)
  implements now-playing and remote command integration with MediaPlayer.
- [`AVAssetMetadataProbe`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/AVAssetMetadataProbe.swift)
  implements audio metadata probing with AVFoundation.
- [`SecurityKeychainStore`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/SecurityKeychainStore.swift)
  implements keychain storage with Security.
- [`CoreTextFontTraitsProbe`](../../libraries/StorytellerKit/Sources/AppleKit/Shared/Platform/CoreTextFontTraitsProbe.swift)
  implements font trait probing with CoreText.

It also contains shared code that is only common among Apple platforms, plus UI
code for the apps:

- [`MobileDesktop`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop)
  is the shared macOS and iOS app surface: library, player, settings, readaloud
  generation UI, and common view model code.
- [`MobileDesktop/macApp`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop/macApp)
  contains the macOS-specific shell around the shared
  [`MobileDesktop`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop)
  UI.
- [`MobileDesktop/iOSApp`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop/iOSApp)
  contains the iOS-specific shell around the shared
  [`MobileDesktop`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop)
  UI.
- [`MobileDesktop/iOSApp/CarPlay`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop/iOSApp/CarPlay)
  contains the iOS CarPlay scene integration.
- [`tvOS`](../../libraries/StorytellerKit/Sources/AppleKit/tvOS) is a separate
  TV app UI under
  [`StorytellerAppleKit`](../../libraries/StorytellerKit/Sources/AppleKit).
- [`watchOS`](../../libraries/StorytellerKit/Sources/AppleKit/watchOS) is a
  separate watch app UI under
  [`StorytellerAppleKit`](../../libraries/StorytellerKit/Sources/AppleKit).

Apple entry points live next to their platform apps:

- [`macAppEntryPoint`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop/macApp/MacEntryPoint.swift)
- [`iosAppEntryPoint`](../../libraries/StorytellerKit/Sources/AppleKit/MobileDesktop/iOSApp/iOSEntryPoint.swift)
- [`tvAppEntryPoint`](../../libraries/StorytellerKit/Sources/AppleKit/tvOS/TVEntryPoint.swift)
- [`watchAppEntryPoint`](../../libraries/StorytellerKit/Sources/AppleKit/watchOS/WatchEntryPoint.swift)

Optional products sit beside the core and Apple package:

- [`StorytellerContentServer`](../../libraries/StorytellerKit/Sources/ContentServer)
  implements the local content-server integration.
- [`StorytellerReadaloud`](../../libraries/StorytellerKit/Sources/Readaloud)
  implements readaloud alignment.
- [`StorytellerNodeKit`](../../libraries/StorytellerKit/Sources/NodeKit) is a
  dynamic library that exposes the metadata and cover lookups to Node.js as a
  Node-API addon. See [`docs/NODE_INTEGRATION.md`](./docs/NODE_INTEGRATION.md).

## Apps

App shells live outside the
[`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) target. They wire
platform build settings, resources, entitlements, and entry stubs around the
SwiftPM libraries.

[`XCodeApps`](./XCodeApps) contains the generated Xcode app definitions for
Apple platforms:

- [`project.yml`](./XCodeApps/project.yml) is the Xcode project definition.
  XcodeGen uses it to produce `Storyteller.xcodeproj`.
- [`EntryPointStub.swift`](./XCodeApps/EntryPointStub.swift) imports
  `StorytellerAppleKit`, constructs a `StorytellerEnvironment` with the optional
  products linked by each platform, and calls the platform entry point.
- [`Assets.xcassets`](./XCodeApps/Assets.xcassets) and
  [`TVAssets.xcassets`](./XCodeApps/TVAssets.xcassets) hold the platform asset
  catalogs. Their artwork, along with the `Storyteller.icon` bundle, is
  generated by [`scripts/genicons`](./scripts/genicons) from
  [`applications/mobile/assets/storyteller-ios.icon`](../mobile/assets/storyteller-ios.icon)
  and is not checked in, so run `./scripts/genicons` before
  `./scripts/genxproj`.
- The app Info.plist and entitlement files in [`XCodeApps`](./XCodeApps) define
  the local app identities, permissions, and platform settings.

[`LinuxApp`](./LinuxApp) is a separate Swift package that depends on the root
package through a local path dependency. It imports
[`StorytellerKit`](../../libraries/StorytellerKit/Sources/Kit) directly and
provides Linux implementations of the
[`platform facade protocols`](../../libraries/StorytellerKit/Sources/Kit/Facades).
Those implementations live in
[`LinuxApp/Sources/StorytellerLinuxApp/Shared/Platform`](./LinuxApp/Sources/StorytellerLinuxApp/Shared/Platform):

- [`LinuxPlatformBootstrap`](./LinuxApp/Sources/StorytellerLinuxApp/Shared/Platform/LinuxPlatformBootstrap.swift)
  installs the available Linux providers.
- [`MpvAudioPlayerFactory`](./LinuxApp/Sources/StorytellerLinuxApp/Shared/Platform/MpvAudioPlayer.swift)
  creates mpv audio players.
- [`NowPlayingPresenting`](../../libraries/StorytellerKit/Sources/Kit/Facades/NowPlayingPresenting.swift)
  is WIP.
- [`AudioMetadataProbing`](../../libraries/StorytellerKit/Sources/Kit/Facades/AudioMetadataProbing.swift)
  is WIP.
- [`KeychainStoring`](../../libraries/StorytellerKit/Sources/Kit/Facades/KeychainStoring.swift)
  is WIP.
- [`FontMetadataProbing`](../../libraries/StorytellerKit/Sources/Kit/Facades/FontMetadataProbing.swift)
  is WIP.

Build and run helpers live in [`scripts`](./scripts):

- [`genxproj`](./scripts/genxproj) regenerates `Storyteller.xcodeproj` from
  [`XCodeApps/project.yml`](./XCodeApps/project.yml).
- [`macbuild`](./scripts/macbuild), [`iosbuild`](./scripts/iosbuild),
  [`tvbuild`](./scripts/tvbuild), and [`watchbuild`](./scripts/watchbuild) build
  Apple targets.
- [`linuxbuild`](./scripts/linuxbuild) and [`linuxrun`](./scripts/linuxrun)
  build and run the Linux app shell.
- [`nodebuild`](./scripts/nodebuild) builds the Node addon.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for local setup, build commands, and
formatting expectations.
