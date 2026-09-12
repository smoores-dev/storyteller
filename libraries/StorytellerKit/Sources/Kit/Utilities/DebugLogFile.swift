import Foundation

public final class DebugLogFile: @unchecked Sendable {
    public static let shared = DebugLogFile()

    private static let maxBytesPerFile = 5 * 1024 * 1024
    private static let flushInterval: TimeInterval = 2
    private static let flushThreshold = 32 * 1024

    private let queue = DispatchQueue(label: "dev.smoores.Storyteller.debuglogfile")
    private var pending = Data()
    private var flushScheduled = false
    private var bytesWritten = 0
    private var didPrepare = false

    private init() {}

    public nonisolated func directory() -> URL {
        StorytellerPlatform.applicationSupportDirectory()
            .appendingPathComponent("Logs", isDirectory: true)
    }

    private func currentURL() -> URL {
        directory().appendingPathComponent("storyteller.log")
    }

    private func previousURL() -> URL {
        directory().appendingPathComponent("storyteller.1.log")
    }

    func append(_ line: String) {
        queue.async {
            self.pending.append(Data(line.utf8))
            self.pending.append(0x0A)
            if self.pending.count >= Self.flushThreshold {
                self.writePending()
            } else {
                self.scheduleFlush()
            }
        }
    }

    private func scheduleFlush() {
        guard !flushScheduled else { return }
        flushScheduled = true
        queue.asyncAfter(deadline: .now() + Self.flushInterval) {
            self.flushScheduled = false
            self.writePending()
        }
    }

    public func flush() {
        queue.async { self.writePending() }
    }

    private func prepareIfNeeded() {
        guard !didPrepare else { return }
        didPrepare = true
        let dir = directory()
        try? FileManager.default.createDirectory(
            at: dir,
            withIntermediateDirectories: true,
        )
        let attributes = try? FileManager.default.attributesOfItem(
            atPath: currentURL().path
        )
        bytesWritten = (attributes?[.size] as? Int) ?? 0
    }

    private func writePending() {
        guard !pending.isEmpty else { return }
        prepareIfNeeded()

        let data = pending
        pending = Data()

        let url = currentURL()
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url)
        }
        bytesWritten += data.count

        if bytesWritten >= Self.maxBytesPerFile {
            rotate()
        }
    }

    private func rotate() {
        let manager = FileManager.default
        try? manager.removeItem(at: previousURL())
        try? manager.moveItem(at: currentURL(), to: previousURL())
        bytesWritten = 0
    }

    public func exportCombined() -> URL? {
        queue.sync { writePending() }

        let manager = FileManager.default
        var combined = Data()
        for url in [previousURL(), currentURL()] {
            if let data = try? Data(contentsOf: url) {
                combined.append(data)
            }
        }
        guard !combined.isEmpty else { return nil }

        let exports = directory().appendingPathComponent("Exports", isDirectory: true)
        try? manager.removeItem(at: exports)
        try? manager.createDirectory(at: exports, withIntermediateDirectories: true)

        let stamp = exportTimestampFormatter.string(from: Date())
        let destination = exports.appendingPathComponent("storyteller-log-\(stamp).txt")
        do {
            try combined.write(to: destination)
            return destination
        } catch {
            return nil
        }
    }

    public func totalBytes() -> Int {
        queue.sync { writePending() }
        let manager = FileManager.default
        return [previousURL(), currentURL()].reduce(0) { total, url in
            let size = (try? manager.attributesOfItem(atPath: url.path))?[.size] as? Int
            return total + (size ?? 0)
        }
    }

    public func clear() {
        queue.sync {
            pending = Data()
            bytesWritten = 0
            didPrepare = false
            try? FileManager.default.removeItem(at: currentURL())
            try? FileManager.default.removeItem(at: previousURL())
        }
    }
}

private let exportTimestampFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd-HHmmss"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
}()
