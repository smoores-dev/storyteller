import Foundation

public enum PlayerComplication: String, Codable, CaseIterable, Equatable, Sendable {
    case none
    case playPause
    case skipBackward
    case skipForward
    case playbackSpeed
    case scrubBar
    case statPercent
    case statPage
    case statTimeInBook
    case statTimeInChapter
    case statPagesLeft
    case statChapterOf
    case statChapterPercent
    case statChapterElapsed
    case statChapterLength
    case statSleepTimer
    case statFinishTime
    case statSessionTime
    case statClock
    case statBattery
    case chapters
    case bookmarks
    case readingTimeline
    case imageGallery
    case search
    case textSettings
    case sleepTimer
    case titleBlock
    case mirror
    case scrollMode
    case freeBrowseLock
    case orientationLock

    public var requiresAudio: Bool {
        switch self {
            case .playPause, .skipBackward, .skipForward, .playbackSpeed, .scrubBar,
                .statTimeInBook, .statTimeInChapter, .statChapterElapsed, .statChapterLength,
                .statSleepTimer, .statFinishTime, .sleepTimer, .freeBrowseLock:
                return true
            case .none, .statPercent, .statPage, .statPagesLeft, .statChapterOf,
                .statChapterPercent, .statSessionTime, .statClock, .statBattery,
                .chapters, .bookmarks, .readingTimeline, .imageGallery, .search, .textSettings,
                .titleBlock,
                .mirror, .scrollMode, .orientationLock:
                return false
        }
    }

    // Takes whatever width is left in its row and pushes the fixed-size
    // complications out to the edges.
    public var isExpanding: Bool {
        self == .scrubBar || self == .titleBlock
    }

    public var displayName: String {
        switch self {
            case .none: return "Empty"
            case .playPause: return "Play/Pause"
            case .skipBackward: return "Skip Back"
            case .skipForward: return "Skip Forward"
            case .playbackSpeed: return "Playback Speed"
            case .scrubBar: return "Scrub Bar"
            case .statPercent: return "Book Progress"
            case .statPage: return "Page Number"
            case .statTimeInBook: return "Time in Book"
            case .statTimeInChapter: return "Time in Chapter"
            case .statPagesLeft: return "Pages Left in Chapter"
            case .statChapterOf: return "Chapter Number"
            case .statChapterPercent: return "Chapter Progress"
            case .statChapterElapsed: return "Elapsed in Chapter"
            case .statChapterLength: return "Chapter Length"
            case .statSleepTimer: return "Sleep Timer"
            case .statFinishTime: return "Finish Time"
            case .statSessionTime: return "Session Time"
            case .statClock: return "Clock"
            case .statBattery: return "Battery"
            case .chapters: return "Chapters"
            case .bookmarks: return "Bookmarks"
            case .readingTimeline: return "Reading Timeline"
            case .imageGallery: return "Images"
            case .search: return "Search"
            case .textSettings: return "Text Settings"
            case .sleepTimer: return "Sleep Timer Button"
            case .titleBlock: return "Title Block"
            case .mirror: return "Swap Hands"
            case .scrollMode: return "Page/Scroll"
            case .freeBrowseLock: return "Free Browse Lock"
            case .orientationLock: return "Orientation Lock"
        }
    }

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "none"
        self = PlayerComplication(rawValue: raw) ?? .none
    }
}

extension [PlayerComplication] {
    public var hasActiveComplication: Bool {
        contains { $0 != .none }
    }
}

public enum MiniPlayerSize: String, Codable, CaseIterable, Equatable, Sendable {
    case compact
    case regular
    case large

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "compact"
        self = MiniPlayerSize(rawValue: raw) ?? .compact
    }
}

public enum MiniPlayerLeadingStyle: String, Codable, CaseIterable, Equatable, Sendable {
    case single
    case cycle

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "single"
        switch raw {
            case "coverTitle": self = .single
            case "cycleStats": self = .cycle
            default: self = MiniPlayerLeadingStyle(rawValue: raw) ?? .single
        }
    }
}

public enum MiniPlayerCycleComponent: String, Codable, CaseIterable, Equatable, Sendable {
    case none
    case bookTitle
    case chapterTitle
    case author
    case statPage
    case statPercent
    case statTimeInChapter
    case statTimeInBook

    public var requiresAudio: Bool {
        self == .statTimeInChapter || self == .statTimeInBook
    }

    public var displayName: String {
        switch self {
            case .none: return "Empty"
            case .bookTitle: return "Book Title"
            case .chapterTitle: return "Chapter Title"
            case .author: return "Author"
            case .statPage: return "Page Numbers"
            case .statPercent: return "Book Progress"
            case .statTimeInChapter: return "Time Left in Chapter"
            case .statTimeInBook: return "Time Left in Book"
        }
    }

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "none"
        self = MiniPlayerCycleComponent(rawValue: raw) ?? .none
    }
}

public struct MiniPlayerCycleBlock: Codable, Equatable, Sendable {
    public var showCover: Bool
    public var line1: MiniPlayerCycleComponent
    public var line2: MiniPlayerCycleComponent

    public init(
        showCover: Bool = true,
        line1: MiniPlayerCycleComponent = .bookTitle,
        line2: MiniPlayerCycleComponent = .chapterTitle,
    ) {
        self.showCover = showCover
        self.line1 = line1
        self.line2 = line2
    }

    public init(from decoder: Decoder) throws {
        let container = try? decoder.container(keyedBy: CodingKeys.self)
        let defaults = MiniPlayerCycleBlock()
        showCover = (try? container?.decode(Bool.self, forKey: .showCover)) ?? defaults.showCover
        line1 =
            (try? container?.decode(MiniPlayerCycleComponent.self, forKey: .line1))
            ?? defaults.line1
        line2 =
            (try? container?.decode(MiniPlayerCycleComponent.self, forKey: .line2))
            ?? defaults.line2
    }

    private enum CodingKeys: String, CodingKey {
        case showCover, line1, line2
    }
}

public enum MiniPlayerProgressScope: String, Codable, CaseIterable, Equatable, Sendable {
    case chapter
    case book

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "chapter"
        self = MiniPlayerProgressScope(rawValue: raw) ?? .chapter
    }
}
