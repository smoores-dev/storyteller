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
		// replace with main node-swift once https://github.com/kabiroberai/node-swift/pull/54 is merged
		.package(url: "https://github.com/circlebackai/node-swift", revision: "da71bc7d076a2f2b2870e8a55b99c22f906478fc"),
		.package(url: "https://github.com/Blaizzy/mlx-audio-swift.git", from: "0.1.3"),
		.package(url: "https://github.com/ml-explore/mlx-swift", from: "0.10.0"),
	],
	targets: [
		.target(
			name: "StorytellerMLXAudioCore",
			dependencies: [
				.product(name: "MLX", package: "mlx-swift"),
				.product(name: "MLXNN", package: "mlx-swift"),
				.product(name: "MLXFFT", package: "mlx-swift"),
			],
			path: "Sources/StorytellerMLXAudioCore",
		),
		.target(
			name: "StorytellerMLXAudio",
			dependencies: [
				.product(name: "NodeAPI", package: "node-swift"),
				.product(name: "NodeModuleSupport", package: "node-swift"),
				.product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
				.product(name: "MLX", package: "mlx-swift"),
				.target(name: "StorytellerMLXAudioCore"),
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
				.product(name: "MLXFFT", package: "mlx-swift"),
				.target(name: "StorytellerMLXAudioCore"),
			],
			path: "Sources/StorytellerMLXAudioCLI",
		),
	]
)
