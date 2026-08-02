import Foundation

public struct SmartShelf: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var conditions: [ShelfCondition]
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        conditions: [ShelfCondition] = [],
        createdAt: Date = Date(),
    ) {
        self.id = id
        self.name = name
        self.conditions = conditions
        self.createdAt = createdAt
    }

    public func matchesAll(
        _ book: BookMetadata,
        progress: Double,
        locationInfo: ShelfLocationInfo = .init(),
    ) -> Bool {
        guard !conditions.isEmpty else { return false }

        // Split conditions into OR-separated groups.
        // Each group's conditions are ANDed, groups are ORed.
        var groups: [[ShelfCondition]] = [[]]
        for condition in conditions {
            if case .orSeparator = condition {
                groups.append([])
            } else {
                groups[groups.count - 1].append(condition)
            }
        }

        // Remove empty groups (e.g. leading/trailing OR separators)
        groups = groups.filter { !$0.isEmpty }
        guard !groups.isEmpty else { return false }

        return groups.contains { group in
            group.allSatisfy { $0.matches(book, progress: progress, locationInfo: locationInfo) }
        }
    }
}

public struct ShelfLocationInfo: Sendable {
    public let isDownloaded: Bool
    public let isLocalStandalone: Bool

    public init(isDownloaded: Bool = false, isLocalStandalone: Bool = false) {
        self.isDownloaded = isDownloaded
        self.isLocalStandalone = isLocalStandalone
    }
}

public enum ShelfCondition: Codable, Hashable, Sendable {
    case format(mode: InclusionMode, conditions: [FormatCondition])
    case status(mode: InclusionMode, values: [String])
    case location(mode: InclusionMode, conditions: [LocationCondition])
    case rating(comparison: NumericComparison, value: Int)
    case progress(mode: InclusionMode, conditions: [ProgressCondition])
    case tag(mode: InclusionMode, values: [String])
    case series(mode: InclusionMode, values: [String])
    case author(mode: InclusionMode, values: [String])
    case narrator(mode: InclusionMode, values: [String])
    case translator(mode: InclusionMode, values: [String])
    case publicationYear(mode: InclusionMode, values: [String])
    case publicationYearComparison(comparison: YearComparison, value: Int)
    case language(mode: InclusionMode, values: [String])
    case collection(mode: InclusionMode, values: [String])
    case source(mode: InclusionMode, values: [String])
    case alignedWith(mode: InclusionMode, values: [String])
    case alignedVersion(mode: InclusionMode, values: [String])
    case pages(comparison: NumericComparison, value: Int)
    /// Stored in seconds.
    case duration(comparison: NumericComparison, value: Int)
    /// Stored in bytes.
    case fileSize(comparison: NumericComparison, value: Int)
    case dateAddedComparison(comparison: YearComparison, value: Date)
    case dateReadComparison(comparison: YearComparison, value: Date)
    case alignedAtComparison(comparison: YearComparison, value: Date)
    case hasAuthor
    case hasNarrator
    case hasTranslator
    case hasSeries
    case hasRating
    case hasPublicationYear
    case hasTag
    case noAuthor
    case noNarrator
    case noTranslator
    case noSeries
    case noRating
    case noPublicationYear
    case noTag
    case orSeparator

    public func matches(
        _ book: BookMetadata,
        progress: Double,
        locationInfo: ShelfLocationInfo = .init(),
    ) -> Bool {
        switch self {
            case .format(let mode, let conditions):
                let matches = conditions.contains { formatConditionMatches($0, book) }
                return mode == .include ? matches : !matches

            case .status(let mode, let values):
                let bookStatuses: [String]
                if let name = book.status?.name {
                    bookStatuses = [name.lowercased()]
                } else {
                    bookStatuses = []
                }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookStatuses, targets: targets)

            case .location(let mode, let conditions):
                let matches = conditions.contains {
                    locationConditionMatches($0, locationInfo: locationInfo)
                }
                return mode == .include ? matches : !matches

            case .rating(let comparison, let value):
                let bookRating = Int((book.rating ?? 0).rounded())
                switch comparison {
                    case .greaterThanOrEqual: return bookRating >= value
                    case .lessThanOrEqual: return bookRating <= value
                    case .equal: return bookRating == value
                }

            case .progress(let mode, let conditions):
                let matches = conditions.contains {
                    progressConditionMatches($0, progress: progress)
                }
                return mode == .include ? matches : !matches

            case .tag(let mode, let values):
                let bookTags = book.tagNames.map { $0.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookTags, targets: targets)

            case .series(let mode, let values):
                let bookSeries = (book.series ?? []).map { $0.name.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookSeries, targets: targets)

            case .author(let mode, let values):
                let bookAuthors = (book.authors ?? []).compactMap { $0.name?.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookAuthors, targets: targets)

            case .narrator(let mode, let values):
                let bookNarrators = (book.narrators ?? []).compactMap { $0.name?.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookNarrators, targets: targets)

            case .translator(let mode, let values):
                let translators = (book.creators ?? []).filter { $0.role == "trl" }
                let bookTranslators = translators.compactMap { $0.name?.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookTranslators, targets: targets)

            case .publicationYear(let mode, let values):
                let year = book.sortablePublicationYear
                let bookYears = year.isEmpty ? [String]() : [year]
                let targets = values.compactMap { BookMetadata.publicationYear(from: $0) }
                return matchesInclusion(mode: mode, bookValues: bookYears, targets: targets)

            case .publicationYearComparison(let comparison, let value):
                guard let bookYear = Int(book.sortablePublicationYear) else { return false }
                switch comparison {
                    case .newerThan: return bookYear > value
                    case .olderThan: return bookYear < value
                    case .exactly: return bookYear == value
                }

            case .language(let mode, let values):
                let bookLanguages =
                    book.sortableLanguage.isEmpty
                    ? [String]() : [book.sortableLanguage.lowercased()]
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookLanguages, targets: targets)

            case .collection(let mode, let values):
                let bookCollections = (book.collections ?? []).map { $0.name.lowercased() }
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookCollections, targets: targets)

            case .source(let mode, let values):
                let bookSources = (book.source?.isEmpty == false) ? [book.source!.lowercased()] : []
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookSources, targets: targets)

            case .alignedWith(let mode, let values):
                let bookValues =
                    (book.alignedWith?.isEmpty == false)
                    ? [book.alignedWith!.lowercased()] : []
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookValues, targets: targets)

            case .alignedVersion(let mode, let values):
                let bookValues =
                    (book.alignedByStorytellerVersion?.isEmpty == false)
                    ? [book.alignedByStorytellerVersion!.lowercased()] : []
                let targets = values.map { $0.lowercased() }
                return matchesInclusion(mode: mode, bookValues: bookValues, targets: targets)

            case .pages(let comparison, let value):
                guard let pages = book.pageCountValue else { return false }
                return comparison.matches(pages, value)

            case .duration(let comparison, let value):
                guard let duration = book.durationValue else { return false }
                return comparison.matches(Int(duration), value)

            case .fileSize(let comparison, let value):
                guard let fileSize = book.fileSizeValue else { return false }
                return comparison.matches(fileSize, value)

            case .dateAddedComparison(let comparison, let value):
                return comparison.matches(book.createdAtValue, value)

            case .dateReadComparison(let comparison, let value):
                return comparison.matches(book.lastReadValue, value)

            case .alignedAtComparison(let comparison, let value):
                return comparison.matches(book.alignedAtValue, value)

            case .hasAuthor:
                return !(book.authors ?? []).isEmpty

            case .hasNarrator:
                return !(book.narrators ?? []).isEmpty

            case .hasTranslator:
                return (book.creators ?? []).contains { $0.role == "trl" }

            case .hasSeries:
                return !(book.series ?? []).isEmpty

            case .hasRating:
                return book.rating != nil && book.rating! > 0

            case .hasPublicationYear:
                return !book.sortablePublicationYear.isEmpty

            case .hasTag:
                return !book.tagNames.isEmpty

            case .noAuthor:
                return (book.authors ?? []).isEmpty

            case .noNarrator:
                return (book.narrators ?? []).isEmpty

            case .noTranslator:
                return !(book.creators ?? []).contains { $0.role == "trl" }

            case .noSeries:
                return (book.series ?? []).isEmpty

            case .noRating:
                return book.rating == nil || book.rating! <= 0

            case .noPublicationYear:
                return book.sortablePublicationYear.isEmpty

            case .noTag:
                return book.tagNames.isEmpty

            case .orSeparator:
                return true
        }
    }

    private func formatConditionMatches(_ condition: FormatCondition, _ book: BookMetadata) -> Bool
    {
        switch condition {
            case .ebook: return book.hasAvailableEbook
            case .audiobook: return book.hasAvailableAudiobook
            case .readaloud: return book.hasAvailableReadaloud
            case .missingReadaloud: return !book.hasAvailableReadaloud
            case .ebookOnly: return book.isEbookOnly
            case .audiobookOnly: return book.isAudiobookOnly
        }
    }

    private func progressConditionMatches(_ condition: ProgressCondition, progress: Double) -> Bool
    {
        condition.matches(progressFraction: progress)
    }

    private func locationConditionMatches(
        _ condition: LocationCondition,
        locationInfo: ShelfLocationInfo,
    ) -> Bool {
        switch condition {
            case .downloaded: return locationInfo.isDownloaded
            case .serverOnly: return !locationInfo.isDownloaded && !locationInfo.isLocalStandalone
            case .localFiles: return locationInfo.isLocalStandalone
        }
    }

    private func matchesInclusion(mode: InclusionMode, bookValues: [String], targets: [String])
        -> Bool
    {
        switch mode {
            case .include:
                return targets.contains { target in bookValues.contains(target) }
            case .exclude:
                return !targets.contains { target in bookValues.contains(target) }
        }
    }

    public var displayLabel: String {
        switch self {
            case .format(let m, let c):
                return "Format \(m.label): \(c.map(\.label).joined(separator: ", "))"
            case .status(let m, let v): return "Status \(m.label): \(v.joined(separator: ", "))"
            case .location(let m, let c):
                return "Location \(m.label): \(c.map(\.label).joined(separator: ", "))"
            case .rating(let cmp, let v): return "User Rating \(cmp.symbol) \(v)"
            case .progress(let m, let c):
                return "Progress \(m.label): \(c.map(\.label).joined(separator: ", "))"
            case .tag(let m, let v): return "Tags \(m.label): \(v.joined(separator: ", "))"
            case .series(let m, let v): return "Series \(m.label): \(v.joined(separator: ", "))"
            case .author(let m, let v): return "Author \(m.label): \(v.joined(separator: ", "))"
            case .narrator(let m, let v): return "Narrator \(m.label): \(v.joined(separator: ", "))"
            case .translator(let m, let v):
                return "Translator \(m.label): \(v.joined(separator: ", "))"
            case .publicationYear(let m, let v):
                return "Year \(m.label): \(v.joined(separator: ", "))"
            case .publicationYearComparison(let cmp, let v):
                return "Year \(cmp.label.lowercased()) \(v)"
            case .language(let m, let v): return "Language \(m.label): \(v.joined(separator: ", "))"
            case .collection(let m, let v):
                return "Collection \(m.label): \(v.joined(separator: ", "))"
            case .source(let m, let v): return "Source \(m.label): \(v.joined(separator: ", "))"
            case .alignedWith(let m, let v):
                return "Aligned With \(m.label): \(v.joined(separator: ", "))"
            case .alignedVersion(let m, let v):
                return "Aligned Version \(m.label): \(v.joined(separator: ", "))"
            case .pages(let cmp, let v): return "Pages \(cmp.symbol) \(v)"
            case .duration(let cmp, let v):
                return "Duration \(cmp.symbol) \(Self.durationLabel(seconds: v))"
            case .fileSize(let cmp, let v):
                return "File Size \(cmp.symbol) \(Self.fileSizeLabel(bytes: v))"
            case .dateAddedComparison(let cmp, let v):
                return "Date Added \(cmp.label.lowercased()) \(Self.dateLabel(v))"
            case .dateReadComparison(let cmp, let v):
                return "Date Read \(cmp.label.lowercased()) \(Self.dateLabel(v))"
            case .alignedAtComparison(let cmp, let v):
                return "Aligned At \(cmp.label.lowercased()) \(Self.dateLabel(v))"
            case .hasAuthor: return "Any Author Present"
            case .hasNarrator: return "Any Narrator Present"
            case .hasTranslator: return "Any Translator Present"
            case .hasSeries: return "Any Series Present"
            case .hasRating: return "Any User Rating Present"
            case .hasPublicationYear: return "Any Publication Year Present"
            case .hasTag: return "Any Tag Present"
            case .noAuthor: return "No Author Present"
            case .noNarrator: return "No Narrator Present"
            case .noTranslator: return "No Translator Present"
            case .noSeries: return "No Series Present"
            case .noRating: return "No User Rating Present"
            case .noPublicationYear: return "No Publication Year Present"
            case .noTag: return "No Tag Present"
            case .orSeparator: return "OR"
        }
    }

    private static func durationLabel(seconds: Int) -> String {
        BookMetadata.formatDuration(seconds: seconds)
    }

    private static func fileSizeLabel(bytes: Int) -> String {
        BookMetadata.formatFileSize(bytes: bytes)
    }

    private static let dateLabelFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    private static func dateLabel(_ date: Date) -> String {
        dateLabelFormatter.string(from: date)
    }
}

public enum FormatCondition: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case ebook
    case audiobook
    case readaloud
    case missingReadaloud
    case ebookOnly
    case audiobookOnly

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .ebook: return "Has Ebook"
            case .audiobook: return "Has Audiobook"
            case .readaloud: return "Has Readaloud"
            case .missingReadaloud: return "Missing Readaloud"
            case .ebookOnly: return "Ebook Only"
            case .audiobookOnly: return "Audiobook Only"
        }
    }
}

public enum LocationCondition: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case downloaded
    case serverOnly
    case localFiles

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .downloaded: return "Downloaded"
            case .serverOnly: return "Server Only"
            case .localFiles: return "Folder Source"
        }
    }
}

/// Generic "at least / at most / exactly" comparison shared by the rating and numeric
/// (pages / duration / file size) shelf conditions.
public enum NumericComparison: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case greaterThanOrEqual
    case lessThanOrEqual
    case equal

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .greaterThanOrEqual: return "At Least"
            case .lessThanOrEqual: return "At Most"
            case .equal: return "Exactly"
        }
    }

    public var symbol: String {
        switch self {
            case .greaterThanOrEqual: return ">="
            case .lessThanOrEqual: return "<="
            case .equal: return "="
        }
    }

    public func matches(_ lhs: Int, _ rhs: Int) -> Bool {
        switch self {
            case .greaterThanOrEqual: return lhs >= rhs
            case .lessThanOrEqual: return lhs <= rhs
            case .equal: return lhs == rhs
        }
    }
}

public enum YearComparison: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case newerThan
    case olderThan
    case exactly

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .newerThan: return "Newer Than"
            case .olderThan: return "Older Than"
            case .exactly: return "Exactly"
        }
    }

    /// Day-granularity comparison for date conditions (a nil book date never matches).
    public func matches(_ date: Date?, _ target: Date) -> Bool {
        guard let date else { return false }
        switch self {
            case .newerThan:
                return date > target && !Calendar.current.isDate(date, inSameDayAs: target)
            case .olderThan:
                return date < target && !Calendar.current.isDate(date, inSameDayAs: target)
            case .exactly: return Calendar.current.isDate(date, inSameDayAs: target)
        }
    }
}

public enum ProgressCondition: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case notStarted
    case inProgress
    case completed

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .notStarted: return "Not Started"
            case .inProgress: return "In Progress"
            case .completed: return "Completed"
        }
    }

    public func matches(progressFraction: Double) -> Bool {
        switch self {
            case .notStarted: return progressFraction <= 0
            case .inProgress: return progressFraction > 0 && progressFraction < 1
            case .completed: return progressFraction >= 1
        }
    }
}

public enum InclusionMode: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case include
    case exclude

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .include: return "includes"
            case .exclude: return "excludes"
        }
    }
}

public enum ShelfConditionType: String, CaseIterable, Identifiable, Sendable {
    case author
    case narrator
    case translator
    case series
    case publicationYear
    case language
    case pages
    case duration
    case tag
    case collection
    case dateAdded
    case dateRead
    case status
    case progress
    case fileSize
    case source
    case location
    case alignedWith
    case alignedVersion
    case alignedAt
    case format
    case rating
    case boolean

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .format: return "Format"
            case .status: return "Reading Status"
            case .location: return "Location"
            case .rating: return "User Rating"
            case .progress: return "Progress"
            case .tag: return "Tag"
            case .collection: return "Collection"
            case .series: return "Series"
            case .author: return "Author"
            case .narrator: return "Narrator"
            case .translator: return "Translator"
            case .publicationYear: return "Publication Year"
            case .language: return "Language"
            case .pages: return "Pages"
            case .duration: return "Duration"
            case .fileSize: return "File Size"
            case .source: return "Source"
            case .dateAdded: return "Date Added"
            case .dateRead: return "Date Read"
            case .alignedWith: return "Aligned With"
            case .alignedVersion: return "Aligned Version"
            case .alignedAt: return "Aligned At"
            case .boolean: return "Boolean"
        }
    }

    public var systemImage: String {
        switch self {
            case .format: return "doc"
            case .status: return "bookmark"
            case .location: return "externaldrive"
            case .rating: return "star"
            case .progress: return "chart.bar"
            case .tag: return "tag"
            case .collection: return "rectangle.stack"
            case .series: return "books.vertical"
            case .author: return "person"
            case .narrator: return "mic"
            case .translator: return "character.book.closed.fill"
            case .publicationYear: return "calendar"
            case .language: return "globe"
            case .pages: return "doc.text"
            case .duration: return "clock"
            case .fileSize: return "internaldrive"
            case .source: return "server.rack"
            case .dateAdded: return "calendar.badge.plus"
            case .dateRead: return "calendar.badge.checkmark"
            case .alignedWith: return "waveform"
            case .alignedVersion: return "number"
            case .alignedAt: return "calendar.badge.clock"
            case .boolean: return "arrow.triangle.branch"
        }
    }

    /// The condition type for a shared canonical metadata field, or nil if the field has no flat
    /// shelf condition (e.g. ``LibraryMetadataField/alignment`` expands to a submenu instead, see
    /// ``submenuTypes(for:)``).
    public static func from(_ field: LibraryMetadataField) -> ShelfConditionType? {
        switch field {
            case .author: return .author
            case .narrator: return .narrator
            case .series: return .series
            case .publicationDate: return .publicationYear
            case .language: return .language
            case .pages: return .pages
            case .duration: return .duration
            case .tags: return .tag
            case .collections: return .collection
            case .dateAdded: return .dateAdded
            case .dateRead: return .dateRead
            case .status: return .status
            case .progress: return .progress
            case .fileSize: return .fileSize
            case .source: return .source
            case .location: return .location
            default: return nil
        }
    }

    /// Submenu fields (``LibraryFieldDescriptor/isSubmenu``) expand to several condition types
    /// rather than one, matching how the sort/column menus render Alignment as a nested menu.
    public static func submenuTypes(for field: LibraryMetadataField) -> [ShelfConditionType]? {
        switch field {
            case .alignment: return [.alignedWith, .alignedVersion, .alignedAt]
            default: return nil
        }
    }
}
