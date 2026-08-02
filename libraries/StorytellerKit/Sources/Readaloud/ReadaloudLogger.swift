import Foundation
import StorytellerKit
import StoryAlignCore

public final class ReadaloudLogger: Logger, @unchecked Sendable {
    private let lock = NSLock()
    private var _messages: [(Date, LogLevel, String)] = []

    public var minLevel: LogLevel

    public init(minLevel: LogLevel = .info) {
        self.minLevel = minLevel
    }

    public var messages: [(Date, LogLevel, String)] {
        lock.lock()
        defer { lock.unlock() }
        return _messages
    }

    public func log(
        _ level: LogLevel,
        _ message: @autoclosure () -> String,
        file: String,
        function: String,
        line: Int,
        indentLevel: Int,
    ) {
        guard level.ordinalValue >= minLevel.ordinalValue else { return }

        let msg = message()
        let indent = String(repeating: "  ", count: indentLevel)
        let formattedMessage = "\(indent)\(msg)"

        lock.lock()
        _messages.append((Date(), level, formattedMessage))
        lock.unlock()

        let prefix: String
        switch level {
            case .debug: prefix = "[DEBUG]"
            case .info: prefix = "[INFO]"
            case .timestamp: prefix = "[TIME]"
            case .warn: prefix = "[WARN]"
            case .error: prefix = "[ERROR]"
        }

        debugLog("[ReadaloudGenerator] \(prefix) \(formattedMessage)")
    }
}

extension LogLevel {
    var ordinalValue: Int {
        switch self {
            case .debug: return 0
            case .info: return 1
            case .timestamp: return 2
            case .warn: return 3
            case .error: return 4
        }
    }
}
