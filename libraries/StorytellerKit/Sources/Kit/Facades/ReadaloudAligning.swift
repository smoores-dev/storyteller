import Foundation
import Observation

/// Protocol for the readaloud (forced-alignment) engine. The StoryAlign-backed
/// implementation lives in the StorytellerReadaloud satellite; the app shell injects
/// it via StorytellerEnvironment. UI hides the feature when nothing is injected.
///
/// Signatures use core mirror types only; this protocol must never reference
/// StoryAlignCore types or core would depend on the satellite's engine.
@MainActor
public protocol ReadaloudAligning: AnyObject, Observable {
    var epubURL: URL? { get set }
    var audioURLs: [URL] { get set }
    var outputURL: URL? { get set }

    var uploadAllToServer: Bool { get set }
    var selectedUploadSourceID: BookSourceID? { get set }
    var uploadSources: [BookSourceRecord] { get }

    var sourceWorkflowBookTitle: String? { get }
    var sourceWorkflowName: String? { get }
    var sourceWorkflowKind: BookSourceKind? { get }
    var sourceOutputBookID: BookID? { get }
    var isLoadingSourceInputs: Bool { get }
    var isMissingSourceWorkflowMedia: Bool { get }

    var selectedTranscriber: ReadaloudTranscriber { get set }
    var selectedModelSize: ReadaloudModelSize { get set }
    var customModelPath: URL? { get set }
    var isModelDownloaded: Bool { get }
    var isTranscriberReady: Bool { get }

    var selectedGranularity: ReadaloudGranularity { get set }
    var expandingHighlight: Bool { get set }
    var expansionMode: ReadaloudExpansionMode { get set }
    var expansionScope: ReadaloudGranularity { get set }
    var expansionUnitCount: Int { get set }

    var availableChapters: [ReadaloudChapter] { get }
    var startChapterIndex: Int? { get set }
    var endChapterIndex: Int? { get set }

    var state: ReadaloudGeneratorState { get }
    var currentStage: ReadaloudProgressStage { get }
    var currentMessage: String { get }
    var overallProgress: Double { get }
    var logMessages: [ReadaloudLogMessage] { get }
    var canStart: Bool { get }

    func configure(with input: ReadaloudGeneratorInput?) async
    func loadUploadSources() async
    func refreshSourceInputs() async
    func loadChapters()
    func startAlignment()
    func cancel()
    func downloadModel()
}

public enum ReadaloudGranularity: String, CaseIterable, Sendable {
    case word
    case group
    case segment
    case phrase
    case sentence
}

public enum ReadaloudTranscriber: String, CaseIterable, Sendable {
    case whisper
    case speechAnalyzer

    public var displayName: String {
        switch self {
            case .whisper: return "Whisper"
            case .speechAnalyzer: return "Apple Speech"
        }
    }
}

public enum ReadaloudExpansionMode: String, CaseIterable, Sendable {
    case scope
    case units
}

public enum ReadaloudProgressStage: String, Sendable {
    case epub
    case audio
    case model
    case transcribe
    case align
    case alignWords
    case xml
    case export
    case report

    public var displayName: String {
        switch self {
            case .epub: return "Parsing EPUB"
            case .audio: return "Processing Audio"
            case .model: return "Loading Model"
            case .transcribe: return "Transcribing"
            case .align: return "Aligning"
            case .alignWords: return "Aligning Words"
            case .xml: return "Generating SMIL"
            case .export: return "Exporting"
            case .report: return "Creating Report"
        }
    }
}

public enum ReadaloudLogLevel: String, Sendable {
    case debug
    case info
    case timestamp
    case warn
    case error
}

public enum ReadaloudChapterRole: String, Sendable {
    case frontmatter
    case bodymatter
    case backmatter
    case cover
    case titlepage
    case copyrightpage = "copyright-page"
    case toc
    case unlisted
}

public enum ReadaloudModelSize: String, CaseIterable, Identifiable, Sendable {
    case tiny = "tiny.en"
    case base = "base.en"
    case small = "small.en"
    case largeV3Turbo = "large-v3-turbo"
    case custom = "custom"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
            case .tiny: return "Tiny (fastest, ~75MB)"
            case .base: return "Base (balanced, ~142MB)"
            case .small: return "Small (good quality, ~466MB)"
            case .largeV3Turbo: return "Large v3 Turbo (best, multilingual, ~809MB)"
            case .custom: return "Custom..."
        }
    }
}

public enum ReadaloudGeneratorState: Equatable, Sendable {
    case idle
    case processing
    case downloading(Double)
    case completed(ReadaloudGeneratorCompletion)
    case error(String)
}

public enum ReadaloudGeneratorCompletion: Equatable, Sendable {
    case saved(URL)
    case uploaded
    case replaced(BookSourceID)
}

public struct ReadaloudChapter: Equatable, Sendable {
    public let name: String
    public let id: String
    public let role: ReadaloudChapterRole?

    public init(name: String, id: String, role: ReadaloudChapterRole?) {
        self.name = name
        self.id = id
        self.role = role
    }
}

public struct ReadaloudLogMessage: Sendable {
    public let date: Date
    public let level: ReadaloudLogLevel
    public let message: String

    public init(date: Date, level: ReadaloudLogLevel, message: String) {
        self.date = date
        self.level = level
        self.message = message
    }
}

public struct ReadaloudGeneratorInput: Equatable, Sendable {
    public enum Destination: String, Sendable {
        case file
        case source
    }

    public let bookID: BookID
    public let bookTitle: String
    public let sourceName: String
    public let sourceKind: BookSourceKind?
    public let destination: Destination
    public let ebookURL: URL?
    public let audioURLs: [URL]

    public init(
        bookID: BookID,
        bookTitle: String,
        sourceName: String,
        sourceKind: BookSourceKind?,
        destination: Destination,
        ebookURL: URL?,
        audioURLs: [URL],
    ) {
        self.bookID = bookID
        self.bookTitle = bookTitle
        self.sourceName = sourceName
        self.sourceKind = sourceKind
        self.destination = destination
        self.ebookURL = ebookURL
        self.audioURLs = audioURLs
    }
}
