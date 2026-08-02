import Foundation

/// Supplies the app-private base directory used by StorytellerKit persistence.
/// App shells override this when Foundation cannot discover the process
/// container itself; all path layout below this directory remains core-owned.
public protocol ApplicationStorageProviding: Sendable {
    var applicationSupportDirectory: URL { get }
    var customFontsDirectory: URL { get }
}

extension ApplicationStorageProviding {
    public var customFontsDirectory: URL {
        applicationSupportDirectory.appendingPathComponent("CustomFonts", isDirectory: true)
    }
}

extension StorytellerPlatform {
    /// Resolves the app-private persistence root. A bootstrapped platform
    /// provider wins; the fallback preserves Storyteller's existing Foundation
    /// layout for tests and hosts that do not need a custom provider.
    public static func applicationSupportDirectory(
        fileManager: FileManager = .default
    ) -> URL {
        if let applicationStorage {
            return applicationStorage.applicationSupportDirectory
        }

        return foundationApplicationSupportDirectory(fileManager: fileManager)
    }

    public static func customFontsDirectory(
        fileManager: FileManager = .default
    ) -> URL {
        applicationStorage?.customFontsDirectory
            ?? foundationApplicationSupportDirectory(fileManager: fileManager)
            .appendingPathComponent("CustomFonts", isDirectory: true)
    }

    private static func foundationApplicationSupportDirectory(
        fileManager: FileManager
    ) -> URL {
        let applicationSupportDirectory =
            (try? fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true,
            ))
            ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory

        let bundleID = Bundle.main.bundleIdentifier ?? "StorytellerReader"
        if applicationSupportDirectory.path.contains("/Containers/") {
            return applicationSupportDirectory
        }
        return applicationSupportDirectory.appendingPathComponent(bundleID, isDirectory: true)
    }
}
