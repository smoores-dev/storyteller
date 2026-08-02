import Foundation

/// Cancellation handle for an active folder watch.
public protocol FolderWatchToken: Sendable {
    func cancel()
}

/// Watches a directory tree for filesystem changes. Implementations coalesce event bursts, so a
/// single callback may cover many changes; treat it as "something changed, rescan" rather than a
/// per-file notification. The callback may arrive on any thread.
public protocol FolderWatching: Sendable {
    func watch(
        _ url: URL,
        onChange: @escaping @Sendable () -> Void,
    ) -> (any FolderWatchToken)?
}

/// Portable fallback for platforms without a native file-event API: wakes periodically and
/// compares a stat fingerprint (paths, sizes, modification dates) of the tree, firing onChange
/// when it differs. Costs one directory enumeration per interval and never reads file contents.
public final class PollingFolderWatcher: FolderWatching {
    private let interval: Duration

    public init(interval: Duration = .seconds(30)) {
        self.interval = interval
    }

    public func watch(
        _ url: URL,
        onChange: @escaping @Sendable () -> Void,
    ) -> (any FolderWatchToken)? {
        let interval = interval
        let task = Task.detached(priority: .utility) {
            var fingerprint = Self.fingerprint(of: url)
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { break }
                let next = Self.fingerprint(of: url)
                if next != fingerprint {
                    fingerprint = next
                    onChange()
                }
            }
        }
        return PollingWatchToken(task: task)
    }

    private static func fingerprint(of root: URL) -> Int {
        var hasher = Hasher()
        let keys: Set<URLResourceKey> = [
            .isRegularFileKey, .fileSizeKey, .contentModificationDateKey,
        ]
        guard
            let enumerator = FileManager.default.enumerator(
                at: root,
                includingPropertiesForKeys: Array(keys),
                options: [.skipsHiddenFiles, .skipsPackageDescendants],
            )
        else {
            return 0
        }
        for case let url as URL in enumerator {
            guard let values = try? url.resourceValues(forKeys: keys),
                values.isRegularFile == true
            else { continue }
            hasher.combine(url.path)
            hasher.combine(values.fileSize ?? 0)
            hasher.combine(values.contentModificationDate?.timeIntervalSinceReferenceDate ?? 0)
        }
        return hasher.finalize()
    }
}

private struct PollingWatchToken: FolderWatchToken {
    let task: Task<Void, Never>

    func cancel() {
        task.cancel()
    }
}
