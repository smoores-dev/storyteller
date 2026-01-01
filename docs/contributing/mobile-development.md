---
title: Mobile Development
---

:::info[Prerequisites]

Please refer to the [Environment Setup](environment-setup.md) guide to set up
the development environment.

:::

## Development Tools

Mobile apps are built with React Native using [Expo](https://docs.expo.dev/).
They are written in TypeScript with some Swift and Kotlin native modules.
Additional technologies include:

- [Redux Toolkit](https://redux-toolkit.js.org/) for state management
- [redux-saga](https://redux-saga.js.org/) for side-effect handling
- [React Native Track Player](https://rntp.dev/) for audiobook playback
- Readium [Swift](https://github.com/readium/swift-toolkit/) and
  [Kotlin](https://github.com/readium/kotlin-toolkit) toolkits for epub
  rendering

## Developing TypeScript Code

If you're only modifying TypeScript code, you **don’t** need Android Studio or
Xcode. [Reach out to Shane](/docs/say-hi) for access to a development build you
can install on your device.

To start the dev server, `cd` into the `mobile` directory and run:

```shell
yarn start:device
```

Scan the QR code to launch the development build and load code from your
machine.

:::tip[Hot Reload Issues]

Changes to `redux-saga` can break hot reload. Press `r` in the terminal or use
the device's 3-finger long-press menu to reload.

:::

## Developing Native Code

To modify Swift or Kotlin native modules, you’ll need Xcode or Android Studio.

Generate a local native project by running in the `mobile` directory:

```shell
yarn expo prebuild --clean -p android   # or "ios"
```

This creates the `android` or `ios` directory for opening in Android
Studio/Xcode. Storyteller’s native code lives in the `Readium` module.

After building the app and loading the Expo dev client, run:

```shell
yarn sim:android   # or "ios"
```
