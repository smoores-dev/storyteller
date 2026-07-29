import Foundation

public struct AlignmentSummary: Codable, Sendable, Hashable {
    public let grade: String
    public let score: Int?
    public let chapters: Int
    public let missingSentences: Int
    public let mutedChapters: Int
    public let failedChapters: Int
    public let unalignedAudio: Int

    // The GET /books summary omits count fields the full-report summary carries, and
    // its shape is still in flux; only the grade is required.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        grade = try container.decode(String.self, forKey: .grade)
        score = try container.decodeIfPresent(Int.self, forKey: .score)
        chapters = try container.decodeIfPresent(Int.self, forKey: .chapters) ?? 0
        missingSentences =
            try container.decodeIfPresent(Int.self, forKey: .missingSentences) ?? 0
        mutedChapters = try container.decodeIfPresent(Int.self, forKey: .mutedChapters) ?? 0
        failedChapters = try container.decodeIfPresent(Int.self, forKey: .failedChapters) ?? 0
        unalignedAudio = try container.decodeIfPresent(Int.self, forKey: .unalignedAudio) ?? 0
    }

    public init(
        grade: String,
        score: Int?,
        chapters: Int,
        missingSentences: Int,
        mutedChapters: Int,
        failedChapters: Int,
        unalignedAudio: Int,
    ) {
        self.grade = grade
        self.score = score
        self.chapters = chapters
        self.missingSentences = missingSentences
        self.mutedChapters = mutedChapters
        self.failedChapters = failedChapters
        self.unalignedAudio = unalignedAudio
    }
}

public struct AlignmentSentenceContext: Codable, Sendable, Hashable {
    public let prevSentence: String?
    public let matchedSentence: String?
    public let nextSentence: String?

    public init(prevSentence: String?, matchedSentence: String?, nextSentence: String?) {
        self.prevSentence = prevSentence
        self.matchedSentence = matchedSentence
        self.nextSentence = nextSentence
    }
}

public struct AlignmentTranscriptionContext: Codable, Sendable, Hashable {
    public let before: String?
    public let after: String?

    public init(before: String?, after: String?) {
        self.before = before
        self.after = after
    }
}

public struct AlignmentReportFlag: Codable, Sendable, Hashable {
    public let label: String
    public let tone: String

    public init(label: String, tone: String) {
        self.label = label
        self.tone = tone
    }
}

public struct AlignmentReportAudioFile: Codable, Sendable, Hashable {
    public let filepath: String
    public let title: String?
    public let duration: Double?
    public let start: Double
    public let end: Double

    public init(filepath: String, title: String?, duration: Double?, start: Double, end: Double) {
        self.filepath = filepath
        self.title = title
        self.duration = duration
        self.start = start
        self.end = end
    }
}

public struct AlignmentReportChapter: Codable, Sendable, Hashable {
    public let href: String
    public let label: String
    public let title: String?
    public let audioFiles: [AlignmentReportAudioFile]
    public let chapterSentenceCount: Int
    public let alignedSentenceCount: Int
    public let coverage: Double?
    public let delta: Int
    public let deltaPct: Double
    public let flagged: Bool
    public let flags: [AlignmentReportFlag]
    public let firstMatchedSentenceId: Int
    public let lastMatchedSentenceId: Int
    public let firstMatchedSentenceContext: AlignmentSentenceContext?
    public let lastMatchedSentenceContext: AlignmentSentenceContext?
    public let transcriptionContext: AlignmentTranscriptionContext?
    public let endTranscriptionContext: AlignmentTranscriptionContext?
    public let markedOk: Bool
    public let excludedFromScore: Bool

    public init(
        href: String,
        label: String,
        title: String?,
        audioFiles: [AlignmentReportAudioFile],
        chapterSentenceCount: Int,
        alignedSentenceCount: Int,
        coverage: Double?,
        delta: Int,
        deltaPct: Double,
        flagged: Bool,
        flags: [AlignmentReportFlag],
        firstMatchedSentenceId: Int,
        lastMatchedSentenceId: Int,
        firstMatchedSentenceContext: AlignmentSentenceContext?,
        lastMatchedSentenceContext: AlignmentSentenceContext?,
        transcriptionContext: AlignmentTranscriptionContext?,
        endTranscriptionContext: AlignmentTranscriptionContext?,
        markedOk: Bool,
        excludedFromScore: Bool,
    ) {
        self.href = href
        self.label = label
        self.title = title
        self.audioFiles = audioFiles
        self.chapterSentenceCount = chapterSentenceCount
        self.alignedSentenceCount = alignedSentenceCount
        self.coverage = coverage
        self.delta = delta
        self.deltaPct = deltaPct
        self.flagged = flagged
        self.flags = flags
        self.firstMatchedSentenceId = firstMatchedSentenceId
        self.lastMatchedSentenceId = lastMatchedSentenceId
        self.firstMatchedSentenceContext = firstMatchedSentenceContext
        self.lastMatchedSentenceContext = lastMatchedSentenceContext
        self.transcriptionContext = transcriptionContext
        self.endTranscriptionContext = endTranscriptionContext
        self.markedOk = markedOk
        self.excludedFromScore = excludedFromScore
    }
}

public struct AlignmentUnalignedChapter: Codable, Sendable, Hashable {
    public let href: String
    public let label: String
    public let reason: String
    public let preview: String?
    public let intended: Bool

    public init(href: String, label: String, reason: String, preview: String?, intended: Bool) {
        self.href = href
        self.label = label
        self.reason = reason
        self.preview = preview
        self.intended = intended
    }
}

public struct AlignmentUnalignedAudioFile: Codable, Sendable, Hashable {
    public let filepath: String
    public let title: String?
    public let duration: Double?
    public let transcription: String?
    public let excluded: Bool

    public init(
        filepath: String,
        title: String?,
        duration: Double?,
        transcription: String?,
        excluded: Bool,
    ) {
        self.filepath = filepath
        self.title = title
        self.duration = duration
        self.transcription = transcription
        self.excluded = excluded
    }
}

public struct BookAlignmentReport: Codable, Sendable, Hashable {
    public let bookUuid: String
    public let bookTitle: String?
    public let reportUuid: String
    public let jobUuid: String?
    public let createdAt: String?
    public let summary: AlignmentSummary
    public let totalAudioDuration: Double
    public let alignedAudioDuration: Double
    public let totalSentences: Int
    public let alignedSentences: Int
    public let significantChapters: Int
    public let chapters: [AlignmentReportChapter]
    public let unalignedChapters: [AlignmentUnalignedChapter]
    public let unalignedAudioFiles: [AlignmentUnalignedAudioFile]

    public init(
        bookUuid: String,
        bookTitle: String?,
        reportUuid: String,
        jobUuid: String?,
        createdAt: String?,
        summary: AlignmentSummary,
        totalAudioDuration: Double,
        alignedAudioDuration: Double,
        totalSentences: Int,
        alignedSentences: Int,
        significantChapters: Int,
        chapters: [AlignmentReportChapter],
        unalignedChapters: [AlignmentUnalignedChapter],
        unalignedAudioFiles: [AlignmentUnalignedAudioFile],
    ) {
        self.bookUuid = bookUuid
        self.bookTitle = bookTitle
        self.reportUuid = reportUuid
        self.jobUuid = jobUuid
        self.createdAt = createdAt
        self.summary = summary
        self.totalAudioDuration = totalAudioDuration
        self.alignedAudioDuration = alignedAudioDuration
        self.totalSentences = totalSentences
        self.alignedSentences = alignedSentences
        self.significantChapters = significantChapters
        self.chapters = chapters
        self.unalignedChapters = unalignedChapters
        self.unalignedAudioFiles = unalignedAudioFiles
    }
}

public struct AlignmentOverrides: Codable, Sendable, Hashable {
    public struct ChapterOverride: Codable, Sendable, Hashable {
        public var excludeFromScore: Bool?
        public var markedOk: Bool?

        public init(excludeFromScore: Bool? = nil, markedOk: Bool? = nil) {
            self.excludeFromScore = excludeFromScore
            self.markedOk = markedOk
        }
    }

    public struct UnalignedChapterOverride: Codable, Sendable, Hashable {
        public var intended: Bool?

        public init(intended: Bool? = nil) {
            self.intended = intended
        }
    }

    public struct AudioFileOverride: Codable, Sendable, Hashable {
        public var excluded: Bool?

        public init(excluded: Bool? = nil) {
            self.excluded = excluded
        }
    }

    public var chapters: [String: ChapterOverride]?
    public var unalignedChapters: [String: UnalignedChapterOverride]?
    public var audioFiles: [String: AudioFileOverride]?

    public init(
        chapters: [String: ChapterOverride]? = nil,
        unalignedChapters: [String: UnalignedChapterOverride]? = nil,
        audioFiles: [String: AudioFileOverride]? = nil,
    ) {
        self.chapters = chapters
        self.unalignedChapters = unalignedChapters
        self.audioFiles = audioFiles
    }
}

public struct AlignmentFacets: Codable, Sendable, Hashable {
    public let grades: [String: Int]
    public let total: Int
    public let muted: Int

    public init(grades: [String: Int], total: Int, muted: Int) {
        self.grades = grades
        self.total = total
        self.muted = muted
    }
}
