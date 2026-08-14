import Foundation

public enum ReadingVisitSource: String, Codable, Sendable, Hashable {
    case ebook
    case readaloud
    case audiobook
    case otherDevice

    public init(sourceIdentifier: String) {
        let lowered = sourceIdentifier.lowercased()
        if lowered.contains("server") {
            self = .otherDevice
        } else if lowered.contains("readaloud") {
            self = .readaloud
        } else if lowered.contains("audiobook") || lowered.contains("carplay")
            || lowered.contains("watch")
        {
            self = .audiobook
        } else {
            self = .ebook
        }
    }
}

public struct ReadingVisit: Codable, Sendable, Hashable, Identifiable {
    public let id: UUID
    public var startedAt: Double
    public var endedAt: Double
    public var startLocator: BookLocator
    public var endLocator: BookLocator
    public var startProgression: Double?
    public var endProgression: Double?
    public var startDescription: String
    public var endDescription: String
    public var source: ReadingVisitSource
    public var eventCount: Int
    public var openedByJump: Bool
    public var endText: String?

    public init(
        id: UUID = UUID(),
        startedAt: Double,
        endedAt: Double,
        startLocator: BookLocator,
        endLocator: BookLocator,
        startProgression: Double?,
        endProgression: Double?,
        startDescription: String,
        endDescription: String,
        source: ReadingVisitSource,
        eventCount: Int = 1,
        openedByJump: Bool = false,
        endText: String? = nil,
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.startLocator = startLocator
        self.endLocator = endLocator
        self.startProgression = startProgression
        self.endProgression = endProgression
        self.startDescription = startDescription
        self.endDescription = endDescription
        self.source = source
        self.eventCount = eventCount
        self.openedByJump = openedByJump
        self.endText = endText
    }

    public var durationSeconds: TimeInterval {
        max(0, (endedAt - startedAt) / 1000)
    }

    public var startDate: Date {
        Date(timeIntervalSince1970: startedAt / 1000)
    }

    public var endDate: Date {
        Date(timeIntervalSince1970: endedAt / 1000)
    }

    public var progressionRange: ClosedRange<Double>? {
        guard let start = startProgression, let end = endProgression else { return nil }
        let low = min(start, end)
        let high = max(start, end)
        return min(max(low, 0), 1)...min(max(high, 0), 1)
    }
}
