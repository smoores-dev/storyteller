import Foundation

#if canImport(os)
import os
private let logger = Logger(subsystem: "dev.smoores.Storyteller", category: "debug")
#endif

public final class DebugLogBuffer: @unchecked Sendable {
    public static let shared = DebugLogBuffer()

    private let lock = NSLock()
    private var buffer: [String] = []
    private let maxSize = 2000
    private var verbose: Bool

    // Category prefixes that are pure performance/diagnostic instrumentation. They
    // drown out genuine errors in the logs users send, so they're kept out of the
    // default stream and only surface when verbose logging is enabled.
    private static let suppressedPrefixes = [
        "[PerfTrace]",
        "[CoverPerf]",
        "[MetadataCoverRefresh]",
    ]

    static let verboseDefaultsKey = "StorytellerVerboseLogging"

    private init() {
        let envEnabled = ProcessInfo.processInfo.environment["STORYTELLER_VERBOSE_LOG"] != nil
        let storedEnabled = UserDefaults.standard.bool(forKey: Self.verboseDefaultsKey)
        verbose = envEnabled || storedEnabled
    }

    public func setVerbose(_ enabled: Bool) {
        lock.lock()
        verbose = enabled
        lock.unlock()
        UserDefaults.standard.set(enabled, forKey: Self.verboseDefaultsKey)
    }

    public var isVerbose: Bool {
        lock.lock()
        defer { lock.unlock() }
        return verbose
    }

    func shouldRecord(_ message: String, verboseOnly: Bool) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if verbose { return true }
        if verboseOnly { return false }
        for prefix in Self.suppressedPrefixes where message.hasPrefix(prefix) {
            return false
        }
        return true
    }

    func append(_ message: String) {
        #if os(watchOS)
        return
        #else
        lock.lock()
        defer { lock.unlock() }
        buffer.append(message)
        if buffer.count > maxSize {
            buffer.removeFirst()
        }
        #endif
    }

    public func getMessages() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return buffer
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        buffer.removeAll()
    }
}

private func emit(_ message: String) {
    DebugLogBuffer.shared.append(message)

    #if DEBUG
    #if canImport(os)
    logger.debug("\(message, privacy: .public)")
    #else
    print(message)
    #endif
    #endif
}

public func debugLog(_ message: String) {
    guard DebugLogBuffer.shared.shouldRecord(message, verboseOnly: false) else { return }
    emit(message)
}

// For high-volume, low-signal chatter (per-refresh observer/poll notifications and
// the like) that lives inside otherwise-useful categories. Dropped entirely unless
// verbose logging is enabled.
public func debugLogVerbose(_ message: String) {
    guard DebugLogBuffer.shared.shouldRecord(message, verboseOnly: true) else { return }
    emit(message)
}
