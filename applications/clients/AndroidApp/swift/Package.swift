// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "StorytellerAndroidBridge",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .library(name: "StorytellerAndroidBridge", type: .dynamic, targets: ["StorytellerAndroidBridge"])
    ],
    dependencies: [
        .package(name: "Storyteller", path: "../../../.."),
        .package(url: "https://github.com/swiftlang/swift-java", exact: "0.4.2"),
    ],
    targets: [
        .target(
            name: "StorytellerAndroidBridge",
            dependencies: [
                .product(name: "StorytellerKit", package: "Storyteller"),
                .product(name: "SwiftJava", package: "swift-java"),
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ],
            plugins: [
                .plugin(name: "JExtractSwiftPlugin", package: "swift-java")
            ],
        )
    ],
)
