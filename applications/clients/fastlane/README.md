## fastlane documentation

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see
[Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios ios_debug

```sh
[bundle exec] fastlane ios ios_debug
```

Build the iOS app in Debug configuration

### ios macos_debug

```sh
[bundle exec] fastlane ios macos_debug
```

Build the macOS app in Debug configuration

### ios tvos_debug

```sh
[bundle exec] fastlane ios tvos_debug
```

Build the tvOS app in Debug configuration

### ios watchos_debug

```sh
[bundle exec] fastlane ios watchos_debug
```

Build the watchOS app in Debug configuration

### ios debug_all

```sh
[bundle exec] fastlane ios debug_all
```

Build all Apple platforms in Debug configuration

### ios ios_beta

```sh
[bundle exec] fastlane ios ios_beta
```

Build and push a new release build of the iOS app to TestFlight

### ios macos_beta

```sh
[bundle exec] fastlane ios macos_beta
```

Build and push a new release build of the macOS app to TestFlight

### ios tvos_beta

```sh
[bundle exec] fastlane ios tvos_beta
```

Build and push a new release build of the tvOS app to TestFlight

### ios beta_all

```sh
[bundle exec] fastlane ios beta_all
```

Build and push new release builds of all Apple platforms to TestFlight

### ios ios_release

```sh
[bundle exec] fastlane ios ios_release
```

Build and push a new release build of the iOS app to the App Store

### ios macos_release

```sh
[bundle exec] fastlane ios macos_release
```

Build and push a new release build of the macOS app to the Mac App Store

### ios tvos_release

```sh
[bundle exec] fastlane ios tvos_release
```

Build and push a new release build of the tvOS app to the App Store

### ios release_all

```sh
[bundle exec] fastlane ios release_all
```

Build and push new release builds of all Apple platforms to the App Store

### ios provision

```sh
[bundle exec] fastlane ios provision
```

Generate or renew certs and provisioning profiles for every platform. Writes to
the Developer Portal and match storage; requires Apple and GitLab credentials.
Build lanes only ever read what this lane provisions.

---

This README.md is auto-generated and will be re-generated every time
[_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on
[fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on
[docs.fastlane.tools](https://docs.fastlane.tools).
