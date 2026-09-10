// swift-tools-version: 6.2
import PackageDescription

let package = Package(
	name: "StorytellerMLXAudio",
	platforms: [.macOS(.v14)],
	products: [
		.library(name: "StorytellerMLXAudio", type: .dynamic, targets: ["StorytellerMLXAudio"]),
		.executable(name: "st-mlx-audio-cli", targets: ["StorytellerMLXAudioCLI"]),
	],
	dependencies: [
		.package(url: "https://github.com/kabiroberai/node-swift.git", from: "1.5.2"),
		.package(url: "https://github.com/Blaizzy/mlx-audio-swift.git", from: "0.1.3"),
		.package(url: "https://github.com/ml-explore/mlx-swift", from: "0.10.0"),
	],
	targets: [
		.target(
			name: "StorytellerMLXAudio",
			dependencies: [
				.product(name: "NodeAPI", package: "node-swift"),
				.product(name: "NodeModuleSupport", package: "node-swift"),
				.product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
				.product(name: "MLX", package: "mlx-swift"),
			],
			path: "Sources/StorytellerMLXAudio",
			linkerSettings: [
				.unsafeFlags(
					["-Xlinker", "-undefined", "-Xlinker", "dynamic_lookup"],
					.when(platforms: [.macOS]),
				)
			],
		),
		.executableTarget(
			name: "StorytellerMLXAudioCLI",
			dependencies: [
				.product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
			],
			path: "Sources/StorytellerMLXAudioCLI",
		),
	]
)
