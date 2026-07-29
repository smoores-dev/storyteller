import Foundation
import Testing

@testable import StorytellerAppleKit

@Test func appleTemporaryFileCleanerRemovesOnlyStorytellerOwnedEntries() throws {
    let fileManager = FileManager.default
    let root = fileManager.temporaryDirectory.appendingPathComponent(
        "temporary-file-cleaner-tests-\(UUID().uuidString)",
        isDirectory: true,
    )
    try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: root) }

    let ownedDirectories = [
        "StorytellerBookServiceUploads",
        "StorytellerFolderSourceDownloads",
        "StorytellerReadaloudGeneratorInputs",
        "storyteller-content-server",
        "story_align_\(UUID().uuidString.prefix(12))",
    ]
    for name in ownedDirectories {
        let directory = root.appendingPathComponent(name, isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("owned".utf8).write(to: directory.appendingPathComponent("large-file"))
    }

    let ownedFiles = ["smil_audio_\(UUID().uuidString).mp4"]
    for name in ownedFiles {
        try Data("owned".utf8).write(to: root.appendingPathComponent(name))
    }

    let retainedEntries = [
        "CFNetworkDownload_active.tmp",
        "not-a-uuid.tmp",
        "unrelated-cache",
        "watch_chunks_active-transfer",
        "storyteller-future-owner",
        "smil_audio_not-a-uuid.mp4",
        "story_align_not-a-token",
        UUID().uuidString,
    ]
    for name in retainedEntries {
        try Data("retained".utf8).write(to: root.appendingPathComponent(name))
    }

    AppleTemporaryFileCleaner.cleanAbandonedFiles(
        in: root,
        fileManager: fileManager,
    )

    for name in ownedDirectories + ownedFiles {
        #expect(!fileManager.fileExists(atPath: root.appendingPathComponent(name).path))
    }
    for name in retainedEntries {
        #expect(fileManager.fileExists(atPath: root.appendingPathComponent(name).path))
    }
}

@Test func appleTemporaryFileCleanerRunsLaunchCleanupOnlyOnce() throws {
    let fileManager = FileManager.default
    let firstRoot = fileManager.temporaryDirectory.appendingPathComponent(
        "temporary-file-cleaner-first-\(UUID().uuidString)",
        isDirectory: true,
    )
    let secondRoot = fileManager.temporaryDirectory.appendingPathComponent(
        "temporary-file-cleaner-second-\(UUID().uuidString)",
        isDirectory: true,
    )
    try fileManager.createDirectory(at: firstRoot, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: secondRoot, withIntermediateDirectories: true)
    defer {
        try? fileManager.removeItem(at: firstRoot)
        try? fileManager.removeItem(at: secondRoot)
    }

    let firstFile = firstRoot.appendingPathComponent("smil_audio_\(UUID().uuidString).mp4")
    let secondFile = secondRoot.appendingPathComponent("smil_audio_\(UUID().uuidString).mp4")
    try Data("first".utf8).write(to: firstFile)
    try Data("second".utf8).write(to: secondFile)

    AppleTemporaryFileCleaner.cleanAbandonedFilesOnce(
        in: firstRoot,
        fileManager: fileManager,
    )
    AppleTemporaryFileCleaner.cleanAbandonedFilesOnce(
        in: secondRoot,
        fileManager: fileManager,
    )

    #expect(!fileManager.fileExists(atPath: firstFile.path))
    #expect(fileManager.fileExists(atPath: secondFile.path))
}
