import Foundation

#if os(macOS)
import CoreServices

/// FSEvents-backed recursive folder watcher. The OS coalesces events with a couple seconds of
/// latency, so one callback covers a burst of file operations.
public final class FSEventsFolderWatcher: FolderWatching {
    public init() {}

    public func watch(
        _ url: URL,
        onChange: @escaping @Sendable () -> Void,
    ) -> (any FolderWatchToken)? {
        let box = CallbackBox(onChange: onChange)
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passRetained(box).toOpaque(),
            retain: nil,
            release: { info in
                guard let info else { return }
                Unmanaged<CallbackBox>.fromOpaque(info).release()
            },
            copyDescription: nil,
        )
        let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            Unmanaged<CallbackBox>.fromOpaque(info).takeUnretainedValue().onChange()
        }
        guard
            let stream = FSEventStreamCreate(
                kCFAllocatorDefault,
                callback,
                &context,
                [url.path] as CFArray,
                FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
                2.0,
                FSEventStreamCreateFlags(kFSEventStreamCreateFlagNoDefer),
            )
        else {
            Unmanaged.passUnretained(box).release()
            return nil
        }
        FSEventStreamSetDispatchQueue(
            stream,
            DispatchQueue(label: "storyteller.folder-watch", qos: .utility),
        )
        guard FSEventStreamStart(stream) else {
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            return nil
        }
        return StreamToken(stream: stream)
    }

    private final class CallbackBox {
        let onChange: @Sendable () -> Void

        init(onChange: @escaping @Sendable () -> Void) {
            self.onChange = onChange
        }
    }

    private final class StreamToken: FolderWatchToken, @unchecked Sendable {
        private let stream: FSEventStreamRef
        private let lock = NSLock()
        private var cancelled = false

        init(stream: FSEventStreamRef) {
            self.stream = stream
        }

        func cancel() {
            lock.lock()
            defer { lock.unlock() }
            guard !cancelled else { return }
            cancelled = true
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }

        deinit {
            cancel()
        }
    }
}
#endif

public func applePlatformFolderWatcher() -> any FolderWatching {
    #if os(macOS)
    FSEventsFolderWatcher()
    #else
    PollingFolderWatcher()
    #endif
}
