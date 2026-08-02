#if os(watchOS)
import Foundation
import StorytellerKit

public final class WatchStorageManager: @unchecked Sendable {
    public static let shared = WatchStorageManager()

    private let transferLock = NSLock()
    private var cancelledTransferIDs: Set<UUID> = []
    private var fileManager: FileManager { FileManager.default }

    private var chunksDirectory: URL {
        StorytellerPlatform.applicationSupportDirectory()
            .appendingPathComponent("WatchTransfersV2", isDirectory: true)
    }

    private init() {
        try? fileManager.createDirectory(
            at: chunksDirectory,
            withIntermediateDirectories: true,
        )
    }

    public struct ChunkResult {
        public let accepted: Bool
        public let isComplete: Bool
        public let manifest: WatchTransferManifest?
    }

    public func receiveChunk(
        from sourceURL: URL,
        payload: WatchChunkTransferPayload,
    ) -> ChunkResult {
        transferLock.lock()
        defer { transferLock.unlock() }

        do {
            guard !cancelledTransferIDs.contains(payload.transferID) else {
                throw WatchStorageError.cancelledTransfer
            }
            try validate(payload)

            let chunkDirectory = chunkDirectory(for: payload.transferID)
            try fileManager.createDirectory(
                at: chunkDirectory,
                withIntermediateDirectories: true,
            )

            var manifest = try loadOrCreateManifest(for: payload)
            guard manifest.matches(payload) else {
                throw WatchStorageError.transferMetadataChanged
            }

            let destination = chunkURL(
                transferID: payload.transferID,
                chunkIndex: payload.chunkIndex,
            )
            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }
            try fileManager.moveItem(at: sourceURL, to: destination)

            manifest.receivedChunks.insert(payload.chunkIndex)
            try saveManifest(manifest)

            let complete = manifest.receivedChunks.count == manifest.totalChunks
            return ChunkResult(
                accepted: true,
                isComplete: complete,
                manifest: complete ? manifest : nil,
            )
        } catch {
            print("[WatchStorageManager] Rejected chunk: \(error)")
            return ChunkResult(accepted: false, isComplete: false, manifest: nil)
        }
    }

    public func assembleChunksToTempFile(manifest: WatchTransferManifest) -> URL? {
        transferLock.lock()
        defer { transferLock.unlock() }

        let destination = fileManager.temporaryDirectory
            .appendingPathComponent(manifest.transferID.uuidString)
            .appendingPathExtension(manifest.fileExtension)
        do {
            try validate(manifest)

            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }

            guard fileManager.createFile(atPath: destination.path, contents: nil) else {
                throw WatchStorageError.couldNotCreateOutput
            }
            let output = try FileHandle(forWritingTo: destination)
            defer { try? output.close() }

            var bytesWritten: Int64 = 0
            for chunkIndex in 0..<manifest.totalChunks {
                let data = try Data(
                    contentsOf: chunkURL(
                        transferID: manifest.transferID,
                        chunkIndex: chunkIndex,
                    )
                )
                try output.write(contentsOf: data)
                bytesWritten += Int64(data.count)
            }

            guard bytesWritten == manifest.totalFileSize else {
                try? fileManager.removeItem(at: destination)
                throw WatchStorageError.fileSizeMismatch
            }

            try fileManager.removeItem(at: chunkDirectory(for: manifest.transferID))
            return destination
        } catch {
            try? fileManager.removeItem(at: destination)
            print("[WatchStorageManager] Failed to assemble transfer: \(error)")
            return nil
        }
    }

    public func cancelChunkedTransfer(transferID: UUID) {
        transferLock.lock()
        defer { transferLock.unlock() }

        cancelledTransferIDs.insert(transferID)
        try? fileManager.removeItem(at: chunkDirectory(for: transferID))
    }

    private func loadOrCreateManifest(
        for payload: WatchChunkTransferPayload
    ) throws -> WatchTransferManifest {
        let url = manifestURL(for: payload.transferID)
        if fileManager.fileExists(atPath: url.path) {
            let manifest = try JSONDecoder().decode(
                WatchTransferManifest.self,
                from: Data(contentsOf: url),
            )
            try validatePartial(manifest)
            return manifest
        }

        return WatchTransferManifest(
            transferID: payload.transferID,
            phoneBookID: payload.phoneBookID,
            category: payload.category,
            title: payload.title,
            authors: payload.authors,
            totalChunks: payload.totalChunks,
            totalFileSize: payload.totalFileSize,
            fileExtension: payload.fileExtension,
            bookMetadata: payload.bookMetadata,
            receivedChunks: [],
        )
    }

    private func saveManifest(_ manifest: WatchTransferManifest) throws {
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: manifestURL(for: manifest.transferID), options: .atomic)
    }

    private func validate(_ payload: WatchChunkTransferPayload) throws {
        guard payload.bookMetadata.id == payload.phoneBookID else {
            throw WatchStorageError.bookIdentityMismatch
        }
        guard payload.totalChunks > 0,
            payload.chunkIndex >= 0,
            payload.chunkIndex < payload.totalChunks,
            payload.totalFileSize >= 0,
            !payload.fileExtension.isEmpty
        else {
            throw WatchStorageError.invalidTransferMetadata
        }
    }

    private func validate(_ manifest: WatchTransferManifest) throws {
        try validatePartial(manifest)
        guard manifest.receivedChunks == Set(0..<manifest.totalChunks) else {
            throw WatchStorageError.incompleteTransfer
        }
    }

    private func validatePartial(_ manifest: WatchTransferManifest) throws {
        guard manifest.bookMetadata.id == manifest.phoneBookID else {
            throw WatchStorageError.bookIdentityMismatch
        }
        guard manifest.totalChunks > 0,
            manifest.totalFileSize >= 0,
            !manifest.fileExtension.isEmpty,
            manifest.receivedChunks.allSatisfy({
                $0 >= 0 && $0 < manifest.totalChunks
            })
        else {
            throw WatchStorageError.invalidTransferMetadata
        }
    }

    private func chunkDirectory(for transferID: UUID) -> URL {
        chunksDirectory.appendingPathComponent(transferID.uuidString, isDirectory: true)
    }

    private func manifestURL(for transferID: UUID) -> URL {
        chunkDirectory(for: transferID).appendingPathComponent("manifest.json")
    }

    private func chunkURL(transferID: UUID, chunkIndex: Int) -> URL {
        chunkDirectory(for: transferID)
            .appendingPathComponent("chunk_\(String(format: "%03d", chunkIndex))")
    }
}

public struct WatchTransferManifest: Codable, Sendable {
    public let transferID: UUID
    public let phoneBookID: BookID
    public let category: LocalMediaCategory
    public let title: String
    public let authors: [String]
    public let totalChunks: Int
    public let totalFileSize: Int64
    public let fileExtension: String
    public let bookMetadata: BookMetadata
    public var receivedChunks: Set<Int>

    fileprivate func matches(_ payload: WatchChunkTransferPayload) -> Bool {
        transferID == payload.transferID
            && phoneBookID == payload.phoneBookID
            && category == payload.category
            && title == payload.title
            && authors == payload.authors
            && totalChunks == payload.totalChunks
            && totalFileSize == payload.totalFileSize
            && fileExtension == payload.fileExtension
            && bookMetadata == payload.bookMetadata
            && payload.bookMetadata.id == payload.phoneBookID
    }
}

private enum WatchStorageError: Error {
    case cancelledTransfer
    case bookIdentityMismatch
    case invalidTransferMetadata
    case transferMetadataChanged
    case incompleteTransfer
    case fileSizeMismatch
    case couldNotCreateOutput
}
#endif
