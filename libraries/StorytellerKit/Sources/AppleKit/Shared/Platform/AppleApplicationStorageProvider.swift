import Foundation
import StorytellerKit

struct AppleApplicationStorageProvider: ApplicationStorageProviding {
    let applicationSupportDirectory: URL
    let customFontsDirectory: URL

    init(fileManager: FileManager = .default) {
        let durableApplicationSupport = Self.foundationApplicationSupportDirectory(
            fileManager: fileManager
        )

        #if os(tvOS)
        let bundleID = Bundle.main.bundleIdentifier ?? "StorytellerReader"
        let cachesDirectory =
            (try? fileManager.url(
                for: .cachesDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true,
            )) ?? fileManager.temporaryDirectory
        applicationSupportDirectory = cachesDirectory.appendingPathComponent(
            bundleID,
            isDirectory: true,
        )
        #else
        applicationSupportDirectory = durableApplicationSupport
        #endif

        customFontsDirectory = durableApplicationSupport.appendingPathComponent(
            "CustomFonts",
            isDirectory: true,
        )
    }

    private static func foundationApplicationSupportDirectory(
        fileManager: FileManager
    ) -> URL {
        let resolved =
            (try? fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true,
            ))
            ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory

        guard !resolved.path.contains("/Containers/") else { return resolved }
        let bundleID = Bundle.main.bundleIdentifier ?? "StorytellerReader"
        return resolved.appendingPathComponent(bundleID, isDirectory: true)
    }
}
