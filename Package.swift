// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Storyteller",
    platforms: [
        .macOS(.v15),
        .iOS(.v18),
        .watchOS(.v10),
        .tvOS(.v17),
    ],
    products: [
        .library(name: "StorytellerKit", targets: ["StorytellerKit"]),
        .library(name: "StorytellerAppleKit", targets: ["StorytellerAppleKit"]),
        .library(name: "StorytellerContentServer", targets: ["StorytellerContentServer"]),
        .library(name: "StorytellerAppleWidgets", targets: ["StorytellerAppleWidgets"]),
        .library(name: "StorytellerReadaloud", targets: ["StorytellerReadaloud"]),
        .library(name: "StorytellerNode", type: .dynamic, targets: ["StorytellerNode"]),
    ],
    dependencies: [
        // Fork pinned past 0.9.20: upstream's development branch gained Android
        // cross-compile support (platform-conditional CZLib + Bionic fixes) that
        // no tagged release has yet. Repoint at upstream once a release includes it.
        .package(
            url: "https://github.com/kyonifer/ZIPFoundation.git",
            revision: "187ee77287ea4b23df4d7de32771ec38bbafb840",
        ),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", from: "2.7.0"),
        .package(url: "https://github.com/hummingbird-project/hummingbird.git", from: "2.0.0"),
        .package(url: "https://github.com/kabiroberai/node-swift.git", from: "1.5.2"),
        .package(url: "https://github.com/kyonifer/StoryAlign.git", from: "1.2.4"),
    ],
    targets: [
        .target(
            name: "StorytellerKit",
            dependencies: [
                .product(name: "ZIPFoundation", package: "ZIPFoundation"),
                .product(name: "SwiftSoup", package: "SwiftSoup"),
            ],
            path: "libraries/StorytellerKit/Sources/Kit",
            exclude: [
                "Resources/WebResources/foliate-js/.github",
                "Resources/WebResources/foliate-js/UPSTREAM.md",
                "Resources/WebResources/foliate-js/rollup",
                "Resources/WebResources/foliate-js/tests",
                "Resources/WebResources/foliate-js/.gitattributes",
                "Resources/WebResources/foliate-js/.gitignore",
                "Resources/WebResources/foliate-js/eslint.config.js",
                "Resources/WebResources/foliate-js/package-lock.json",
                "Resources/WebResources/foliate-js/package.json",
                "Resources/WebResources/foliate-js/rollup.config.js",
                "Resources/WebResources/foliate-js/README.md",
                "Resources/assets/UPSTREAM.md",
            ],
            resources: [
                .copy("Resources/WebResources"),
                .copy("Resources/assets/fonts"),
            ],
        ),
        .target(
            name: "StorytellerAppleKit",
            dependencies: ["StorytellerKit", "StorytellerAppleWidgets"],
            path: "libraries/StorytellerKit/Sources/AppleKit",
            exclude: [
                "WidgetSupport"
            ],
        ),
        .target(
            name: "StorytellerAppleWidgets",
            dependencies: ["StorytellerKit"],
            path: "libraries/StorytellerKit/Sources/AppleKit/WidgetSupport",
        ),
        .target(
            name: "StorytellerContentServer",
            dependencies: [
                "StorytellerKit",
                .product(name: "Hummingbird", package: "hummingbird"),
            ],
            path: "libraries/StorytellerKit/Sources/ContentServer",
        ),
        .target(
            name: "StorytellerReadaloud",
            dependencies: [
                "StorytellerKit",
                .product(name: "StoryAlignCore", package: "StoryAlign"),
                .product(name: "ZIPFoundation", package: "ZIPFoundation"),
            ],
            path: "libraries/StorytellerKit/Sources/Readaloud",
        ),
        .target(
            name: "StorytellerNode",
            dependencies: [
                "StorytellerKit",
                .product(name: "NodeAPI", package: "node-swift"),
                .product(name: "NodeModuleSupport", package: "node-swift"),
            ],
            path: "libraries/StorytellerKit/Sources/Node",
            linkerSettings: [
                // The napi_* symbols are supplied by the host node binary at dlopen time, so
                // they stay undefined in the addon. Mach-O rejects that unless told otherwise;
                // ELF allows it by default.
                .unsafeFlags(
                    ["-Xlinker", "-undefined", "-Xlinker", "dynamic_lookup"],
                    .when(platforms: [.macOS]),
                )
            ],
        ),
        .testTarget(
            name: "StorytellerTests",
            dependencies: ["StorytellerKit", "StorytellerAppleKit"],
            path: "libraries/StorytellerKit/Tests/StorytellerTests",
        ),
    ],
)
