---
sidebar_position: 1
---

# Getting Started

## Setting up a local development environment

Storyteller's mobile apps are built with React Native, utilizing the
[Expo](https://docs.expo.dev/) toolkit. They're written in Typescript, with some
custom native code written in Swift and Kotlin. It also relies on some
additional libraries that are worth getting up to speed on:

- [redux toolkit](https://redux-toolkit.js.org/) for state management
- [redux-saga](https://redux-saga.js.org/) for side effect management
- [React Native Track Player (RNTP)](https://rntp.dev/) for playing the
  audiobooks
- The Readium [Swift](https://github.com/readium/swift-toolkit/) and
  [Kotlin](https://github.com/readium/kotlin-toolkit) toolkits for rendering and
  interacting with epub files

### Development tools

In order to get started with mobile development, you'll need to have `node.js`
(v20.x) and `yarn` installed. You can either install these with your operating
system's package manager, or you can use the Nix flake provided in this project
(`nix develop .`), which includes these tools.

## Installing dependencies

Once you have your development environment set up, you'll need to install
dependencies. This repo uses Yarn for Node.js package management. This will be
available after following the development environment setup flow.

To install Node.js dependencies, run:

```shell
yarn install
```

## Developing the Typescript code

If your work only requires modifying the Typescript parts of the codebase, then
you don't need to set up Android Studio or XCode for local development.
[Reach out to Shane](/docs/say-hi) for access to a development build of the
Storyteller apps that you can install on your personal Android or iOS device.
Once that's set up, run, `cd` into the `mobile` directory of the Storyteller
repo and run:

```shell
yarn start:device
```

To start up the dev server. This will compile the Typescript source code and
provide a QR code that you can scan on your mobile device, which will open the
development build and load the bundled Typescript code from your development
machine.

Changes to any files will trigger a hot reload on your mobile device. If you
change any redux-saga code, the hot reload will probably result in a broken
state (white screen); just reload the development client by pressing `r` in your
terminal running the dev server, or by long pressing with three fingers in the
app and choosing "Reload".

## Developing the native code

For changes that require updating the native Swift or Kotlin code, you'll have
to use the appropriate development environments (XCode for Swift and Android
Studio for Kotlin). Note that you can only do Swift development on an Apple
computer.

You can use the following command (from the `mobile` directory) to generate a
local native project:

```shell
yarn expo prebuild --clean -p android # or "ios" for Swift
```

This will create a folder within `mobile` called `android` (or `ios`, if you
passed `-p ios`). That folder can be opened with Android Studio/XCode. The
native code owned by Storyteller will be in the `Readium` module.

When you're ready to run the native code, you can run the project on a
simulator/emulator. When the app is built and loaded, it will open an Expo dev
client page. You can then run

```shell
yarn sim:android # or "ios"
```

In a terminal. This will start up the Typescript dev server, as above, and
connect to the simulator/emulator.
