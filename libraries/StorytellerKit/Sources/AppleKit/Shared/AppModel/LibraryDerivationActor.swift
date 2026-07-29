import Foundation
import StorytellerKit

public struct LibraryViewSnapshot: Sendable {
    public var generation: Int
    public var badgeCounts: [String: Int]
    public var groups: LibraryGroupSnapshot
    public var smartShelfBooks: [UUID: [BookMetadata]]

    public init(
        generation: Int = 0,
        badgeCounts: [String: Int] = [:],
        groups: LibraryGroupSnapshot = LibraryGroupSnapshot(),
        smartShelfBooks: [UUID: [BookMetadata]] = [:],
    ) {
        self.generation = generation
        self.badgeCounts = badgeCounts
        self.groups = groups
        self.smartShelfBooks = smartShelfBooks
    }
}

public struct LibraryGroupSnapshot: Sendable {
    public var generation: Int
    public var series: [MediaKind: [LibrarySeriesGroup]]
    public var authors: [MediaKind: [LibraryCreatorGroup]]
    public var collections: [MediaKind: [LibraryCollectionGroup]]
    public var narrators: [MediaKind: [LibraryCreatorGroup]]
    public var translators: [MediaKind: [LibraryCreatorGroup]]
    public var publicationYears: [MediaKind: [LibraryNamedBooksGroup]]
    public var tags: [MediaKind: [LibraryNamedBooksGroup]]
    public var ratings: [MediaKind: [LibraryNamedBooksGroup]]
    public var statuses: [MediaKind: [LibraryNamedBooksGroup]]
    public var sources: [MediaKind: [LibraryNamedBooksGroup]]

    public init(
        generation: Int = 0,
        series: [MediaKind: [LibrarySeriesGroup]] = [:],
        authors: [MediaKind: [LibraryCreatorGroup]] = [:],
        collections: [MediaKind: [LibraryCollectionGroup]] = [:],
        narrators: [MediaKind: [LibraryCreatorGroup]] = [:],
        translators: [MediaKind: [LibraryCreatorGroup]] = [:],
        publicationYears: [MediaKind: [LibraryNamedBooksGroup]] = [:],
        tags: [MediaKind: [LibraryNamedBooksGroup]] = [:],
        ratings: [MediaKind: [LibraryNamedBooksGroup]] = [:],
        statuses: [MediaKind: [LibraryNamedBooksGroup]] = [:],
        sources: [MediaKind: [LibraryNamedBooksGroup]] = [:],
    ) {
        self.generation = generation
        self.series = series
        self.authors = authors
        self.collections = collections
        self.narrators = narrators
        self.translators = translators
        self.publicationYears = publicationYears
        self.tags = tags
        self.ratings = ratings
        self.statuses = statuses
        self.sources = sources
    }
}

public struct LibrarySeriesGroup: Sendable {
    public var series: BookSeries?
    public var books: [BookMetadata]
}

public struct LibraryCreatorGroup: Sendable {
    public var creator: BookCreator?
    public var books: [BookMetadata]
}

public struct LibraryCollectionGroup: Sendable {
    public var collection: BookCollectionSummary?
    public var books: [BookMetadata]
}

public struct LibraryNamedBooksGroup: Sendable {
    public var name: String
    public var books: [BookMetadata]
}

public struct MediaGridSortOption: RawRepresentable, Equatable, Hashable, Sendable {
    public var field: SortField
    public var ascending: Bool

    public init(field: SortField, ascending: Bool) {
        self.field = field
        self.ascending = ascending
    }

    public init?(rawValue: String) {
        if let legacy = Self.legacyOptions[rawValue] {
            self = legacy
            return
        }
        let parts = rawValue.split(separator: ":", maxSplits: 1)
        guard let raw = parts.first, let field = SortField(rawValue: String(raw)) else {
            return nil
        }
        self.field = field
        self.ascending = parts.count > 1 ? parts[1] == "asc" : field.defaultAscending
    }

    private static let legacyOptions: [String: MediaGridSortOption] = [
        "titleAZ": .init(field: .title, ascending: true),
        "titleZA": .init(field: .title, ascending: false),
        "authorAZ": .init(field: .author, ascending: true),
        "authorZA": .init(field: .author, ascending: false),
        "progressHighToLow": .init(field: .progress, ascending: false),
        "progressLowToHigh": .init(field: .progress, ascending: true),
        "seriesPosition": .init(field: .series, ascending: true),
    ]

    public var rawValue: String { "\(field.rawValue):\(ascending ? "asc" : "desc")" }

    public static let titleAZ = MediaGridSortOption(field: .title, ascending: true)

    public var label: String { field.label }
    public var shortLabel: String { label }
    public var sortField: SortField { field }
    public var isAscending: Bool { ascending }

    public var toggled: MediaGridSortOption {
        MediaGridSortOption(field: field, ascending: !ascending)
    }

    /// The SortField a canonical metadata field maps to, or nil if the field isn't directly
    /// sortable (Subtitle/Tags/Collections/Source/Creators are excluded from sorting, and the
    /// Alignment submenu expands to ``alignmentSortFields`` rather than one field).
    public static func sortField(for field: LibraryMetadataField) -> SortField? {
        switch field {
            case .title: return .title
            case .author: return .author
            case .narrator: return .narrator
            case .series: return .series
            case .publicationDate: return .publicationDate
            case .language: return .language
            case .pages: return .pages
            case .duration: return .duration
            case .identifiers: return .identifiers
            case .dateAdded: return .recentlyAdded
            case .dateRead: return .recentlyRead
            case .status: return .status
            case .progress: return .progress
            case .fileSize: return .fileSize
            case .subtitle, .tags, .collections, .source, .location, .creators, .alignment:
                return nil
        }
    }

    public static let alignmentSortFields: [SortField] = [
        .alignedAt, .alignedByVersion, .alignedWith,
    ]

    public static func defaultOption(for field: SortField) -> MediaGridSortOption {
        MediaGridSortOption(field: field, ascending: field.defaultAscending)
    }

    public enum SortField: String, CaseIterable, Sendable {
        case title, author, publicationDate, series, recentlyAdded, recentlyRead, progress
        case subtitle, narrator, language, collections, status, tags, allCreators, source
        case pages, duration, fileSize, identifiers
        case alignedAt, alignedByVersion, alignedWith

        public var label: String {
            switch self {
                case .title: return "Title"
                case .author: return "Author"
                case .publicationDate: return "Pub Date"
                case .series: return "Series"
                case .recentlyAdded: return "Date Added"
                case .recentlyRead: return "Date Read"
                case .progress: return "Progress"
                case .subtitle: return "Subtitle"
                case .narrator: return "Narrator"
                case .language: return "Language"
                case .collections: return "Collections"
                case .status: return "Status"
                case .tags: return "Tags"
                case .allCreators: return "Creators"
                case .source: return "Source"
                case .pages: return "Pages"
                case .duration: return "Duration"
                case .fileSize: return "File Size"
                case .identifiers: return "Identifiers"
                case .alignedAt: return "Aligned At"
                case .alignedByVersion: return "Aligned Version"
                case .alignedWith: return "Aligned With"
            }
        }

        public var defaultAscending: Bool {
            switch self {
                case .progress, .publicationDate, .recentlyAdded, .recentlyRead, .duration,
                    .fileSize:
                    return false
                default: return true
            }
        }

        // String fields compare generically via these keys; progress and series are special-cased.
        public var sortableKey: (KeyPath<BookMetadata, String> & Sendable)? {
            switch self {
                case .title: return \BookMetadata.sortableTitle
                case .author: return \BookMetadata.sortableAuthor
                case .publicationDate: return \BookMetadata.sortablePublicationDate
                case .recentlyAdded: return \BookMetadata.sortableAdded
                case .recentlyRead: return \BookMetadata.sortableLastRead
                case .subtitle: return \BookMetadata.sortableSubtitle
                case .narrator: return \BookMetadata.sortableNarrator
                case .language: return \BookMetadata.sortableLanguage
                case .collections: return \BookMetadata.sortableCollections
                case .status: return \BookMetadata.sortableStatus
                case .tags: return \BookMetadata.sortableTags
                case .allCreators: return \BookMetadata.sortableAllCreators
                case .source: return \BookMetadata.sortableSource
                case .identifiers: return \BookMetadata.sortableIdentifiers
                case .alignedAt: return \BookMetadata.sortableAlignedAt
                case .alignedByVersion: return \BookMetadata.sortableAlignedByVersion
                case .alignedWith: return \BookMetadata.sortableAlignedWith
                case .series, .progress, .pages, .duration, .fileSize: return nil
            }
        }
    }

    public func comparison(_ lhs: BookMetadata, _ rhs: BookMetadata) -> ComparisonResult {
        let primary =
            ascending
            ? ascendingComparison(lhs, rhs) : reversedComparison(ascendingComparison(lhs, rhs))
        if primary != .orderedSame { return primary }
        return lhs.sortableTitle.articleStrippedCompare(rhs.sortableTitle)
    }

    private func ascendingComparison(_ lhs: BookMetadata, _ rhs: BookMetadata) -> ComparisonResult {
        switch field {
            case .progress:
                let lhsP = lhs.sortableProgress
                let rhsP = rhs.sortableProgress
                if lhsP == rhsP { return .orderedSame }
                return lhsP < rhsP ? .orderedAscending : .orderedDescending
            case .pages:
                return Self.numericComparison(lhs.sortablePages, rhs.sortablePages)
            case .duration:
                return Self.numericComparison(lhs.sortableDuration, rhs.sortableDuration)
            case .fileSize:
                return Self.numericComparison(lhs.sortableFileSize, rhs.sortableFileSize)
            case .series:
                return Self.seriesComparison(lhs, rhs)
            default:
                guard let key = field.sortableKey else { return .orderedSame }
                return lhs[keyPath: key].localizedCaseInsensitiveCompare(rhs[keyPath: key])
        }
    }

    static func numericComparison<T: Comparable>(_ lhs: T, _ rhs: T) -> ComparisonResult {
        if lhs == rhs { return .orderedSame }
        return lhs < rhs ? .orderedAscending : .orderedDescending
    }

    static func seriesComparison(_ lhs: BookMetadata, _ rhs: BookMetadata) -> ComparisonResult {
        let lhsSeriesName = lhs.series?.first?.name ?? ""
        let rhsSeriesName = rhs.series?.first?.name ?? ""
        if lhsSeriesName.isEmpty || rhsSeriesName.isEmpty {
            if lhsSeriesName.isEmpty && rhsSeriesName.isEmpty { return .orderedSame }
            return lhsSeriesName.isEmpty ? .orderedDescending : .orderedAscending
        }
        let seriesResult = lhsSeriesName.articleStrippedCompare(rhsSeriesName)
        if seriesResult != .orderedSame { return seriesResult }
        let lhsPosition = lhs.series?.first?.position ?? .greatestFiniteMagnitude
        let rhsPosition = rhs.series?.first?.position ?? .greatestFiniteMagnitude
        if lhsPosition == rhsPosition { return .orderedSame }
        return lhsPosition < rhsPosition ? .orderedAscending : .orderedDescending
    }
}

func reversedComparison(_ result: ComparisonResult) -> ComparisonResult {
    switch result {
        case .orderedAscending: return .orderedDescending
        case .orderedDescending: return .orderedAscending
        case .orderedSame: return .orderedSame
    }
}

public enum MediaGridFormatFilterOption: String, CaseIterable, Identifiable, Sendable {
    case all
    case readaloud
    case ebook
    case audiobook
    case ebookOnly
    case audiobookOnly
    case missingReadaloud

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .all: "All Titles"
            case .readaloud: "Readaloud"
            case .ebook: "Ebook"
            case .audiobook: "Audiobook"
            case .ebookOnly: "Ebook Only"
            case .audiobookOnly: "Audiobook Only"
            case .missingReadaloud: "Missing Readaloud"
        }
    }

    public var shortLabel: String {
        switch self {
            case .all: "All"
            case .readaloud: "Readaloud"
            case .ebook: "Ebook"
            case .audiobook: "Audiobook"
            case .ebookOnly: "Ebook Only"
            case .audiobookOnly: "Audiobook Only"
            case .missingReadaloud: "Missing Readaloud"
        }
    }

    public var includesAudiobookOnlyItems: Bool {
        switch self {
            case .all, .audiobook, .audiobookOnly: true
            default: false
        }
    }

    public func matches(_ item: BookMetadata) -> Bool {
        switch self {
            case .all: true
            case .readaloud: item.hasAvailableReadaloud
            case .ebook: item.hasAvailableEbook
            case .audiobook: item.hasAvailableAudiobook || item.hasAvailableReadaloud
            case .ebookOnly: item.isEbookOnly
            case .audiobookOnly: item.isAudiobookOnly
            case .missingReadaloud: item.isMissingReadaloud
        }
    }
}

public enum MediaGridLocationFilterOption: String, CaseIterable, Identifiable, Sendable {
    case all
    case downloaded
    case serverOnly
    case localFiles

    public var id: String { rawValue }

    public var label: String {
        switch self {
            case .all: "All Locations"
            case .downloaded: "Downloaded"
            case .serverOnly: "Server Only"
            case .localFiles: "Folder Source"
        }
    }

    public var shortLabel: String {
        switch self {
            case .all: "All"
            case .downloaded: "Downloaded"
            case .serverOnly: "Server Only"
            case .localFiles: "Folder Source"
        }
    }

    public var iconName: String {
        switch self {
            case .all: "square.grid.2x2"
            case .downloaded: "play.circle"
            case .serverOnly: "arrow.down.circle"
            case .localFiles: "folder"
        }
    }
}

public struct LibraryDerivationInput: Sendable {
    public var generation: Int
    public var deriveGroups: Bool
    public var metadata: [BookMetadata]
    public var paths: [BookID: MediaPaths]
    public var folderSourceBookIds: Set<BookID>
    public var storytellerBookIds: Set<BookID>
    public var progress: [BookID: BookProgress]
    public var smartShelves: [SmartShelf]
    public var sidebarContents: [SidebarContentKind]
    public var incompleteDownloadCount: Int

    public init(
        generation: Int,
        deriveGroups: Bool = false,
        metadata: [BookMetadata],
        paths: [BookID: MediaPaths],
        folderSourceBookIds: Set<BookID>,
        storytellerBookIds: Set<BookID>,
        progress: [BookID: BookProgress],
        smartShelves: [SmartShelf],
        sidebarContents: [SidebarContentKind],
        incompleteDownloadCount: Int = 0,
    ) {
        self.generation = generation
        self.deriveGroups = deriveGroups
        self.metadata = metadata
        self.paths = paths
        self.folderSourceBookIds = folderSourceBookIds
        self.storytellerBookIds = storytellerBookIds
        self.progress = progress
        self.smartShelves = smartShelves
        self.sidebarContents = sidebarContents
        self.incompleteDownloadCount = incompleteDownloadCount
    }
}

public struct SmartShelfBooksInput: Sendable {
    public var metadata: [BookMetadata]
    public var paths: [BookID: MediaPaths]
    public var folderSourceBookIds: Set<BookID>
    public var progress: [BookID: BookProgress]

    public init(
        metadata: [BookMetadata],
        paths: [BookID: MediaPaths],
        folderSourceBookIds: Set<BookID>,
        progress: [BookID: BookProgress],
    ) {
        self.metadata = metadata
        self.paths = paths
        self.folderSourceBookIds = folderSourceBookIds
        self.progress = progress
    }
}

public struct MediaGridRenderRequest: Sendable {
    public var mediaKind: MediaKind
    public var contextFilters: MediaGridContextFilters
    public var selectedFormatFilter: MediaGridFormatFilterOption
    public var selectedTag: String?
    public var selectedSeries: String?
    public var selectedCollection: String?
    public var selectedAuthor: String?
    public var selectedNarrator: String?
    public var selectedTranslator: String?
    public var selectedPublicationYear: String?
    public var selectedRating: String?
    public var selectedStatus: String?
    public var selectedProgress: ProgressCondition?
    public var selectedLocation: MediaGridLocationFilterOption
    public var selectedSourceID: BookSourceID?
    public var selectedSourceName: String?
    public var searchText: String
    public var sortOption: MediaGridSortOption
    public var filteredItems: [BookMetadata]?
    public var includeFilterOptions: Bool

    public init(
        mediaKind: MediaKind,
        contextFilters: MediaGridContextFilters = MediaGridContextFilters(),
        selectedFormatFilter: MediaGridFormatFilterOption,
        selectedTag: String?,
        selectedSeries: String?,
        selectedCollection: String?,
        selectedAuthor: String?,
        selectedNarrator: String?,
        selectedTranslator: String?,
        selectedPublicationYear: String?,
        selectedRating: String?,
        selectedStatus: String?,
        selectedProgress: ProgressCondition? = nil,
        selectedLocation: MediaGridLocationFilterOption,
        selectedSourceID: BookSourceID?,
        selectedSourceName: String?,
        searchText: String,
        sortOption: MediaGridSortOption,
        filteredItems: [BookMetadata]?,
        includeFilterOptions: Bool,
    ) {
        self.mediaKind = mediaKind
        self.contextFilters = contextFilters
        self.selectedFormatFilter = selectedFormatFilter
        self.selectedTag = selectedTag
        self.selectedSeries = selectedSeries
        self.selectedCollection = selectedCollection
        self.selectedAuthor = selectedAuthor
        self.selectedNarrator = selectedNarrator
        self.selectedTranslator = selectedTranslator
        self.selectedPublicationYear = selectedPublicationYear
        self.selectedRating = selectedRating
        self.selectedStatus = selectedStatus
        self.selectedProgress = selectedProgress
        self.selectedLocation = selectedLocation
        self.selectedSourceID = selectedSourceID
        self.selectedSourceName = selectedSourceName
        self.searchText = searchText
        self.sortOption = sortOption
        self.filteredItems = filteredItems
        self.includeFilterOptions = includeFilterOptions
    }
}

public struct MediaGridContextFilters: Sendable, Equatable {
    public var tag: String?
    public var series: String?
    public var collection: String?
    public var author: String?
    public var narrator: String?
    public var translator: String?
    public var publicationYear: String?
    public var rating: String?
    public var status: String?
    public var location: MediaGridLocationFilterOption?
    public var sourceID: BookSourceID?
    public var sourceName: String?

    public init(
        tag: String? = nil,
        series: String? = nil,
        collection: String? = nil,
        author: String? = nil,
        narrator: String? = nil,
        translator: String? = nil,
        publicationYear: String? = nil,
        rating: String? = nil,
        status: String? = nil,
        location: MediaGridLocationFilterOption? = nil,
        sourceID: BookSourceID? = nil,
        sourceName: String? = nil,
    ) {
        self.tag = tag
        self.series = series
        self.collection = collection
        self.author = author
        self.narrator = narrator
        self.translator = translator
        self.publicationYear = publicationYear
        self.rating = rating
        self.status = status
        self.location = location
        self.sourceID = sourceID
        self.sourceName = sourceName
    }
}

public struct MediaGridRenderInput: Sendable {
    public var request: MediaGridRenderRequest
    public var metadata: [BookMetadata]
    public var paths: [BookID: MediaPaths]
    public var folderSourceBookIds: Set<BookID>

    public init(
        request: MediaGridRenderRequest,
        metadata: [BookMetadata],
        paths: [BookID: MediaPaths],
        folderSourceBookIds: Set<BookID>,
    ) {
        self.request = request
        self.metadata = metadata
        self.paths = paths
        self.folderSourceBookIds = folderSourceBookIds
    }
}

public struct MediaGridRenderSnapshot: Sendable {
    public var displayItems: [BookMetadata]
    public var availableTags: [String]
    public var availableSeries: [String]
    public var availableAuthors: [String]
    public var availableNarrators: [String]
    public var availableTranslators: [String]
    public var availablePublicationYears: [String]
    public var availableRatings: [String]
    public var availableStatuses: [String]
    public var availableCreatorRoles: Set<String>
    public var filtersSummary: String

    public init(
        displayItems: [BookMetadata],
        availableTags: [String] = [],
        availableSeries: [String] = [],
        availableAuthors: [String] = [],
        availableNarrators: [String] = [],
        availableTranslators: [String] = [],
        availablePublicationYears: [String] = [],
        availableRatings: [String] = [],
        availableStatuses: [String] = [],
        availableCreatorRoles: Set<String> = [],
        filtersSummary: String,
    ) {
        self.displayItems = displayItems
        self.availableTags = availableTags
        self.availableSeries = availableSeries
        self.availableAuthors = availableAuthors
        self.availableNarrators = availableNarrators
        self.availableTranslators = availableTranslators
        self.availablePublicationYears = availablePublicationYears
        self.availableRatings = availableRatings
        self.availableStatuses = availableStatuses
        self.availableCreatorRoles = availableCreatorRoles
        self.filtersSummary = filtersSummary
    }
}

public actor LibraryDerivationActor {
    public init() {}

    public func deriveBooksForShelf(_ shelf: SmartShelf, from input: SmartShelfBooksInput)
        -> [BookMetadata]
    {
        input.metadata.filter { book in
            let progress = input.progress[book.id]?.progressFraction ?? book.progress
            let mediaPaths = input.paths[book.id]
            let hasDownloadedContent =
                mediaPaths?.ebookPath != nil
                || mediaPaths?.audioPath != nil
                || mediaPaths?.syncedPath != nil
            let isLocal = input.folderSourceBookIds.contains(book.id)
            return shelf.matchesAll(
                book,
                progress: progress,
                locationInfo: ShelfLocationInfo(
                    isDownloaded: hasDownloadedContent && !isLocal,
                    isLocalStandalone: isLocal,
                ),
            )
        }.sorted {
            $0.title.articleStrippedCompare($1.title) == .orderedAscending
        }
    }

    public func deriveMediaGridSnapshot(from input: MediaGridRenderInput)
        -> MediaGridRenderSnapshot
    {
        let request = input.request
        let baseItems = uniqueItems(baseItems(for: request, metadata: input.metadata))
        let catalog =
            request.includeFilterOptions
            ? uniqueItems(catalogItems(for: request, metadata: input.metadata))
            : []
        let locationInfo = locationInfo(
            for: baseItems,
            paths: input.paths,
            folderSourceBookIds: input.folderSourceBookIds,
        )
        let displayItems = displayItems(
            base: baseItems,
            locationInfo: locationInfo,
            request: request,
        )

        guard request.includeFilterOptions else {
            return MediaGridRenderSnapshot(
                displayItems: displayItems,
                filtersSummary: filtersSummary(for: request),
            )
        }

        return MediaGridRenderSnapshot(
            displayItems: displayItems,
            availableTags: availableTags(from: catalog),
            availableSeries: availableSeries(from: catalog),
            availableAuthors: availableAuthors(from: catalog),
            availableNarrators: availableNarrators(from: catalog),
            availableTranslators: availableTranslators(from: catalog),
            availablePublicationYears: availablePublicationYears(from: catalog),
            availableRatings: availableRatings(from: catalog),
            availableStatuses: availableStatuses(from: catalog),
            availableCreatorRoles: availableCreatorRoles(from: catalog),
            filtersSummary: filtersSummary(for: request),
        )
    }

    public func deriveSnapshot(from input: LibraryDerivationInput) -> LibraryViewSnapshot {
        let started = CFAbsoluteTimeGetCurrent()
        var badgeCounts: [String: Int] = [:]
        var context = Context(input: input)

        for content in input.sidebarContents {
            badgeCounts[content.stableIdentifier] = context.badgeCount(for: content)
        }
        let smartShelfBooks = Dictionary(
            uniqueKeysWithValues: input.smartShelves.map { shelf in
                (shelf.id, context.booksForShelf(shelf))
            }
        )

        var groups = LibraryGroupSnapshot()
        if input.deriveGroups {
            groups = LibraryGroupSnapshot(generation: input.generation)
            for kind in MediaKind.allCases {
                groups.series[kind] = context.seriesGroups(kind)
                groups.authors[kind] = context.authorGroups(kind)
                groups.collections[kind] = context.collectionGroups(kind)
                groups.narrators[kind] = context.narratorGroups(kind)
                groups.translators[kind] = context.translatorGroups(kind)
                groups.publicationYears[kind] = context.publicationYearGroups(kind)
                groups.tags[kind] = context.tagGroups(kind)
                groups.ratings[kind] = context.ratingGroups(kind)
                groups.statuses[kind] = context.statusGroups(kind)
                groups.sources[kind] = context.sourceGroups(kind)
            }
        }

        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][LibraryDerivationActor] deriveSnapshot generation=\(input.generation) contents=\(input.sidebarContents.count) badges=\(badgeCounts.count) elapsedMs=\(String(format: "%.1f", elapsed))"
        )
        return LibraryViewSnapshot(
            generation: input.generation,
            badgeCounts: badgeCounts,
            groups: groups,
            smartShelfBooks: smartShelfBooks,
        )
    }

    private struct MediaGridLocationInfo: Sendable {
        let isDownloaded: Bool
        let isLocalStandalone: Bool
    }

    private func baseItems(
        for request: MediaGridRenderRequest,
        metadata: [BookMetadata],
    ) -> [BookMetadata] {
        if let filteredItems = request.filteredItems {
            return filteredItems
        }
        var primary = items(
            metadata,
            for: request.mediaKind,
            contextFilters: request.contextFilters,
        )
        if request.selectedFormatFilter.includesAudiobookOnlyItems {
            primary = merge(
                primary,
                with: items(metadata, for: .audiobook, contextFilters: request.contextFilters),
            )
        }
        return primary
    }

    private func catalogItems(
        for request: MediaGridRenderRequest,
        metadata: [BookMetadata],
    ) -> [BookMetadata] {
        if let filteredItems = request.filteredItems {
            return filteredItems
        }
        if request.mediaKind == .audiobook {
            return items(metadata, for: .audiobook, contextFilters: request.contextFilters)
        }
        return merge(
            items(metadata, for: request.mediaKind, contextFilters: request.contextFilters),
            with: items(metadata, for: .audiobook, contextFilters: request.contextFilters),
        )
    }

    private func items(
        _ metadata: [BookMetadata],
        for kind: MediaKind,
        contextFilters: MediaGridContextFilters,
    ) -> [BookMetadata] {
        let base = metadata.filter { metadataMatchesKind($0, kind: kind) }
        return applyContextFilters(contextFilters, to: base)
    }

    private func applyContextFilters(
        _ context: MediaGridContextFilters,
        to items: [BookMetadata],
    ) -> [BookMetadata] {
        var filtered = items
        if let tag = context.tag { filtered = filtered.filter { $0.matchesTag(tag) } }
        if let series = context.series { filtered = filtered.filter { $0.matchesSeries(series) } }
        if let collection = context.collection {
            filtered = filtered.filter { $0.matchesCollection(collection) }
        }
        if let author = context.author { filtered = filtered.filter { $0.matchesAuthor(author) } }
        if let narrator = context.narrator {
            filtered = filtered.filter { $0.matchesNarrator(narrator) }
        }
        if let translator = context.translator {
            filtered = filtered.filter { $0.matchesTranslator(translator) }
        }
        if let year = context.publicationYear {
            filtered = filtered.filter { $0.matchesPublicationYear(year) }
        }
        if let rating = context.rating {
            filtered = filtered.filter { $0.matchesRating(rating) }
        }
        if let status = context.status {
            filtered = filtered.filter { $0.matchesStatus(status) }
        }
        if let sourceID = context.sourceID {
            filtered = filtered.filter { $0.sourceID == sourceID }
        }
        return filtered
    }

    private func merge(_ primary: [BookMetadata], with supplemental: [BookMetadata])
        -> [BookMetadata]
    {
        guard !supplemental.isEmpty else { return primary }
        var result = primary
        var seen = Set(result.map(\.id))
        for item in supplemental where !seen.contains(item.id) {
            seen.insert(item.id)
            result.append(item)
        }
        return result
    }

    private func uniqueItems(_ items: [BookMetadata]) -> [BookMetadata] {
        var seen: Set<BookID> = []
        return items.filter { item in
            guard seen.insert(item.id).inserted else {
                debugLog(
                    "[LibraryDerivationActor] Duplicate book id '\(item.id)' (\(item.title)) in media grid items; keeping the first"
                )
                return false
            }
            return true
        }
    }

    private func locationInfo(
        for items: [BookMetadata],
        paths: [BookID: MediaPaths],
        folderSourceBookIds: Set<BookID>,
    ) -> [BookMetadata.ID: MediaGridLocationInfo] {
        var result: [BookMetadata.ID: MediaGridLocationInfo] = [:]
        result.reserveCapacity(items.count)
        for item in items {
            let mediaPaths = paths[item.id]
            let hasDownloadedContent =
                mediaPaths?.ebookPath != nil
                || mediaPaths?.audioPath != nil
                || mediaPaths?.syncedPath != nil
            let isLocal = folderSourceBookIds.contains(item.id)
            result[item.id] = MediaGridLocationInfo(
                isDownloaded: hasDownloadedContent && !isLocal,
                isLocalStandalone: isLocal,
            )
        }
        return result
    }

    private func displayItems(
        base: [BookMetadata],
        locationInfo: [BookMetadata.ID: MediaGridLocationInfo],
        request: MediaGridRenderRequest,
    ) -> [BookMetadata] {
        var filtered = base.filter { request.selectedFormatFilter.matches($0) }

        if let tag = request.selectedTag { filtered = filtered.filter { $0.matchesTag(tag) } }
        if let series = request.selectedSeries {
            filtered = filtered.filter { $0.matchesSeries(series) }
        }
        if let collection = request.selectedCollection {
            filtered = filtered.filter { $0.matchesCollection(collection) }
        }
        if let author = request.selectedAuthor {
            filtered = filtered.filter { $0.matchesAuthor(author) }
        }
        if let narrator = request.selectedNarrator {
            filtered = filtered.filter { $0.matchesNarrator(narrator) }
        }
        if let translator = request.selectedTranslator {
            filtered = filtered.filter { $0.matchesTranslator(translator) }
        }
        if let year = request.selectedPublicationYear {
            filtered = filtered.filter { $0.matchesPublicationYear(year) }
        }
        if let rating = request.selectedRating {
            filtered = filtered.filter { $0.matchesRating(rating) }
        }
        if let status = request.selectedStatus {
            filtered = filtered.filter { $0.matchesStatus(status) }
        }
        if let selectedSourceID = request.selectedSourceID {
            filtered = filtered.filter { $0.sourceID == selectedSourceID }
        }
        if let progress = request.selectedProgress {
            filtered = filtered.filter { progress.matches(progressFraction: $0.sortableProgress) }
        }

        switch request.contextFilters.location ?? request.selectedLocation {
            case .all:
                break
            case .downloaded:
                filtered = filtered.filter { locationInfo[$0.id]?.isDownloaded ?? false }
            case .serverOnly:
                filtered = filtered.filter {
                    let info = locationInfo[$0.id]
                    return !(info?.isDownloaded ?? false) && !(info?.isLocalStandalone ?? false)
                }
            case .localFiles:
                filtered = filtered.filter { locationInfo[$0.id]?.isLocalStandalone ?? false }
        }

        if request.searchText.count >= 2 {
            let terms = request.searchText.lowercased().split(separator: " ").map(String.init)
            filtered = filtered.filter { item in
                let title = item.title.lowercased()
                let authorNames = (item.authors ?? []).compactMap { $0.name?.lowercased() }
                let seriesNames = (item.series ?? []).compactMap { $0.name.lowercased() }
                return terms.allSatisfy { term in
                    title.contains(term)
                        || authorNames.contains { $0.contains(term) }
                        || seriesNames.contains { $0.contains(term) }
                }
            }
        }

        return filtered.sorted { lhs, rhs in
            if lhs.id == rhs.id { return false }
            let result: ComparisonResult
            if request.sortOption.field == .series, let filter = request.selectedSeries {
                let normalizedFilter = filter.lowercased()
                let lhsPosition =
                    lhs.series?.first(where: { $0.name.lowercased() == normalizedFilter })?.position
                    ?? .greatestFiniteMagnitude
                let rhsPosition =
                    rhs.series?.first(where: { $0.name.lowercased() == normalizedFilter })?.position
                    ?? .greatestFiniteMagnitude
                let base: ComparisonResult
                if lhsPosition == rhsPosition {
                    base = lhs.title.articleStrippedCompare(rhs.title)
                } else {
                    base = lhsPosition < rhsPosition ? .orderedAscending : .orderedDescending
                }
                result = request.sortOption.ascending ? base : reversedComparison(base)
            } else {
                result = request.sortOption.comparison(lhs, rhs)
            }
            return result == .orderedSame ? lhs.id < rhs.id : result == .orderedAscending
        }
    }

    private func filtersSummary(for request: MediaGridRenderRequest) -> String {
        var parts: [String] = []
        if request.selectedFormatFilter != .all {
            parts.append(request.selectedFormatFilter.shortLabel)
        }
        if let status = request.selectedStatus { parts.append(status) }
        if let tag = request.selectedTag { parts.append(tag) }
        if let series = request.selectedSeries { parts.append(series) }
        if let author = request.selectedAuthor { parts.append(author) }
        if let narrator = request.selectedNarrator { parts.append(narrator) }
        if let translator = request.selectedTranslator { parts.append(translator) }
        if let year = request.selectedPublicationYear { parts.append(year) }
        if let rating = request.selectedRating {
            parts.append(rating == "Unrated" ? "Unrated" : "\(rating) Stars")
        }
        if let progress = request.selectedProgress { parts.append(progress.label) }
        appendContextFilterSummaries(request.contextFilters, to: &parts)
        if request.contextFilters.location == nil, request.selectedLocation != .all {
            parts.append(request.selectedLocation.shortLabel)
        }
        if let sourceName = request.selectedSourceName {
            parts.append(sourceName)
        }
        if parts.isEmpty {
            parts.append(request.selectedFormatFilter.shortLabel)
        }
        return parts.joined(separator: " • ")
    }

    private func appendContextFilterSummaries(
        _ context: MediaGridContextFilters,
        to parts: inout [String],
    ) {
        if let tag = context.tag { parts.append(tag) }
        if let series = context.series { parts.append(series) }
        if let collection = context.collection { parts.append(collection) }
        if let author = context.author { parts.append(author) }
        if let narrator = context.narrator { parts.append(narrator) }
        if let translator = context.translator { parts.append(translator) }
        if let year = context.publicationYear { parts.append(year) }
        if let rating = context.rating {
            parts.append(rating == "Unrated" ? "Unrated" : "\(rating) Stars")
        }
        if let status = context.status { parts.append(status) }
        if let location = context.location, location != .all { parts.append(location.shortLabel) }
        if let sourceName = context.sourceName { parts.append(sourceName) }
    }

    private func availableTags(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        for item in catalog {
            for rawTag in item.tagNames {
                let trimmed = rawTag.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                unique[trimmed.lowercased()] = unique[trimmed.lowercased()] ?? trimmed
            }
        }
        return unique.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func availableSeries(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        for item in catalog {
            for series in item.series ?? [] {
                let trimmed = series.name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                unique[trimmed.lowercased()] = unique[trimmed.lowercased()] ?? trimmed
            }
        }
        return unique.values.sorted { $0.articleStrippedCompare($1) == .orderedAscending }
    }

    private func availableAuthors(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        for item in catalog {
            for author in item.authors ?? [] {
                guard let name = author.name?.trimmingCharacters(in: .whitespacesAndNewlines),
                    !name.isEmpty
                else { continue }
                unique[name.lowercased()] = unique[name.lowercased()] ?? name
            }
        }
        return unique.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func availableNarrators(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        var hasUnknown = false
        for item in catalog {
            if let narrators = item.narrators, !narrators.isEmpty {
                for narrator in narrators {
                    if let name = narrator.name?.trimmingCharacters(in: .whitespacesAndNewlines),
                        !name.isEmpty
                    {
                        unique[name.lowercased()] = unique[name.lowercased()] ?? name
                    } else {
                        hasUnknown = true
                    }
                }
            } else {
                hasUnknown = true
            }
        }
        var result = unique.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
        if hasUnknown { result.append("Unknown Narrator") }
        return result
    }

    private func availableTranslators(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        var hasUnknown = false
        for item in catalog {
            let translators = (item.creators ?? []).filter { $0.role == "trl" }
            for translator in translators {
                if let name = translator.name?.trimmingCharacters(in: .whitespacesAndNewlines),
                    !name.isEmpty
                {
                    unique[name.lowercased()] = unique[name.lowercased()] ?? name
                } else {
                    hasUnknown = true
                }
            }
        }
        var result = unique.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
        if hasUnknown { result.append("Unknown Translator") }
        return result
    }

    private func availableCreatorRoles(from catalog: [BookMetadata]) -> Set<String> {
        var roles = Set<String>()
        for item in catalog {
            for creator in item.creators ?? [] {
                if let role = creator.role, !role.isEmpty {
                    roles.insert(role)
                }
            }
        }
        return roles
    }

    private func availablePublicationYears(from catalog: [BookMetadata]) -> [String] {
        var years = Set<String>()
        var hasUnknown = false
        for item in catalog {
            if let year = BookMetadata.publicationYear(from: item.publicationDate) {
                years.insert(year)
            } else {
                hasUnknown = true
            }
        }
        var result = years.sorted(by: >)
        if hasUnknown { result.append("Unknown") }
        return result
    }

    private func availableRatings(from catalog: [BookMetadata]) -> [String] {
        var ratings = Set<Int>()
        var hasUnrated = false
        for item in catalog {
            if let rating = item.rating, rating > 0 {
                ratings.insert(Int(rating.rounded()))
            } else {
                hasUnrated = true
            }
        }
        var result = ratings.sorted(by: >).map { "\($0)" }
        if hasUnrated { result.append("Unrated") }
        return result
    }

    private func availableStatuses(from catalog: [BookMetadata]) -> [String] {
        var unique: [String: String] = [:]
        for item in catalog {
            guard let status = item.status?.name.trimmingCharacters(in: .whitespacesAndNewlines),
                !status.isEmpty
            else { continue }
            unique[status.lowercased()] = unique[status.lowercased()] ?? status
        }
        return unique.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func metadataMatchesKind(_ metadata: BookMetadata, kind: MediaKind) -> Bool {
        switch kind {
            case .ebook:
                return metadata.hasAvailableEbook || metadata.hasAvailableReadaloud
            case .audiobook:
                return !metadata.hasAvailableEbook && !metadata.hasAvailableReadaloud
                    && metadata.hasAvailableAudiobook
        }
    }

    private struct Context {
        let input: LibraryDerivationInput
        var seriesCountCache: [MediaKind: Int] = [:]
        var authorCountCache: [MediaKind: Int] = [:]
        var collectionCountCache: [MediaKind: Int] = [:]
        var narratorCountCache: [MediaKind: Int] = [:]
        var translatorCountCache: [MediaKind: Int] = [:]
        var publicationYearCountCache: [MediaKind: Int] = [:]
        var tagCountCache: [MediaKind: Int] = [:]
        var ratingCountCache: [MediaKind: Int] = [:]
        var statusCountCache: [MediaKind: Int] = [:]
        var sourceCountCache: [MediaKind: Int] = [:]

        mutating func badgeCount(for content: SidebarContentKind) -> Int {
            switch content {
                case .home, .placeholder, .storytellerServer:
                    return 0
                case .currentlyDownloading:
                    return input.incompleteDownloadCount
                case .mediaGrid(let config):
                    return mediaGridCount(config)
                case .seriesView(let mediaKind):
                    if let count = seriesCountCache[mediaKind] { return count }
                    let count = seriesGroupCount(mediaKind)
                    seriesCountCache[mediaKind] = count
                    return count
                case .authorView(let mediaKind):
                    if let count = authorCountCache[mediaKind] { return count }
                    let count = authorGroupCount(mediaKind)
                    authorCountCache[mediaKind] = count
                    return count
                case .narratorView(let mediaKind):
                    if let count = narratorCountCache[mediaKind] { return count }
                    let count = narratorGroupCount(mediaKind)
                    narratorCountCache[mediaKind] = count
                    return count
                case .translatorView(let mediaKind):
                    if let count = translatorCountCache[mediaKind] { return count }
                    let count = translatorGroupCount(mediaKind)
                    translatorCountCache[mediaKind] = count
                    return count
                case .tagView(let mediaKind):
                    if let count = tagCountCache[mediaKind] { return count }
                    let count = tagGroupCount(mediaKind)
                    tagCountCache[mediaKind] = count
                    return count
                case .publicationYearView(let mediaKind):
                    if let count = publicationYearCountCache[mediaKind] { return count }
                    let count = publicationYearGroupCount(mediaKind)
                    publicationYearCountCache[mediaKind] = count
                    return count
                case .ratingView(let mediaKind):
                    if let count = ratingCountCache[mediaKind] { return count }
                    let count = ratingGroupCount(mediaKind)
                    ratingCountCache[mediaKind] = count
                    return count
                case .collectionsView(let mediaKind):
                    if let count = collectionCountCache[mediaKind] { return count }
                    let count = collectionGroupCount(mediaKind)
                    collectionCountCache[mediaKind] = count
                    return count
                case .statusView(let mediaKind):
                    if let count = statusCountCache[mediaKind] { return count }
                    let count = statusGroupCount(mediaKind)
                    statusCountCache[mediaKind] = count
                    return count
                case .sourceView(let mediaKind):
                    if let count = sourceCountCache[mediaKind] { return count }
                    let count = sourceGroupCount(mediaKind)
                    sourceCountCache[mediaKind] = count
                    return count
                case .bookReports:
                    return input.metadata.count { $0.alignmentSummary != nil }
                case .bookSource(let sourceID):
                    return input.metadata.filter { $0.sourceID == sourceID }.count
                case .smartShelves:
                    return input.smartShelves.count
                case .smartShelfDetail(let shelfId):
                    guard let shelf = input.smartShelves.first(where: { $0.id == shelfId }) else {
                        return 0
                    }
                    return booksForShelf(shelf).count
                case .downloaded:
                    return input.metadata.filter {
                        metadataMatchesKind($0, kind: .ebook)
                            && matchesLocationFilter($0, .downloaded)
                    }.count
            }
        }

        func booksForShelf(_ shelf: SmartShelf) -> [BookMetadata] {
            input.metadata.filter { book in
                let progress = input.progress[book.id]?.progressFraction ?? book.progress
                let isLocal = input.folderSourceBookIds.contains(book.id)
                let isDownloaded = hasDownloadedContent(book) && !isLocal
                return shelf.matchesAll(
                    book,
                    progress: progress,
                    locationInfo: ShelfLocationInfo(
                        isDownloaded: isDownloaded,
                        isLocalStandalone: isLocal,
                    ),
                )
            }.sorted {
                $0.title.articleStrippedCompare($1.title) == .orderedAscending
            }
        }

        private func mediaGridCount(_ config: MediaGridConfiguration) -> Int {
            var base = items(
                for: config.mediaKind,
                narrationFilter: .both,
                tagFilter: config.tagFilter,
            )

            if shouldIncludeAudiobookOnlyItems(for: config.narrationFilter) {
                let audioOnlyItems = items(
                    for: .audiobook,
                    narrationFilter: .both,
                    tagFilter: config.tagFilter,
                )
                base = mergeItems(base, with: audioOnlyItems)
            }

            base = base.filter { matchesNarrationFilter($0, config.narrationFilter) }

            if let series = config.seriesFilter {
                base = base.filter { $0.matchesSeries(series) }
            }
            if let collection = config.collectionFilter {
                base = base.filter { $0.matchesCollection(collection) }
            }
            if let author = config.authorFilter {
                base = base.filter { $0.matchesAuthor(author) }
            }
            if let narrator = config.narratorFilter {
                base = base.filter { $0.matchesNarrator(narrator) }
            }
            if let translator = config.translatorFilter {
                base = base.filter { $0.matchesTranslator(translator) }
            }
            if let year = config.publicationYearFilter {
                base = base.filter { $0.matchesPublicationYear(year) }
            }
            if let ratingKey = config.ratingFilter {
                base = base.filter { $0.matchesRating(ratingKey) }
            }
            if let statusFilter = config.statusFilter {
                base = base.filter { $0.matchesStatus(statusFilter) }
            }

            base = base.filter { matchesLocationFilter($0, config.locationFilter) }
            return base.count
        }

        private func items(
            for kind: MediaKind,
            narrationFilter: NarrationFilter,
            tagFilter: String?,
        ) -> [BookMetadata] {
            var base = input.metadata.filter { metadataMatchesKind($0, kind: kind) }
            switch narrationFilter {
                case .both:
                    break
                case .withAudio:
                    base = base.filter(\.hasAnyAudiobookAsset)
                case .withoutAudio:
                    base = base.filter { !$0.hasAnyAudiobookAsset }
            }
            if let tagFilter, !tagFilter.isEmpty {
                let target = tagFilter.lowercased()
                base = base.filter { item in
                    item.tagNames.contains(where: { $0.lowercased() == target })
                }
            }
            return base
        }

        private func metadataMatchesKind(_ metadata: BookMetadata, kind: MediaKind) -> Bool {
            switch kind {
                case .ebook:
                    return metadata.hasAvailableEbook || metadata.hasAvailableReadaloud
                case .audiobook:
                    return !metadata.hasAvailableEbook && !metadata.hasAvailableReadaloud
                        && metadata.hasAvailableAudiobook
            }
        }

        private func shouldIncludeAudiobookOnlyItems(for filter: NarrationFilter) -> Bool {
            switch filter {
                case .both, .withAudio:
                    return true
                case .withoutAudio:
                    return false
            }
        }

        private func matchesNarrationFilter(_ item: BookMetadata, _ filter: NarrationFilter)
            -> Bool
        {
            switch filter {
                case .both:
                    return true
                case .withAudio:
                    return item.hasAvailableAudiobook || item.hasAvailableReadaloud
                case .withoutAudio:
                    return item.isEbookOnly
            }
        }

        private func matchesLocationFilter(_ item: BookMetadata, _ filter: LocationFilter) -> Bool {
            switch filter {
                case .all:
                    return true
                case .downloaded:
                    return hasDownloadedContent(item)
                        && !input.folderSourceBookIds.contains(item.id)
                case .serverOnly:
                    return !hasDownloadedContent(item)
                        && !input.folderSourceBookIds.contains(item.id)
                case .localFiles:
                    return input.folderSourceBookIds.contains(item.id)
            }
        }

        private func hasDownloadedContent(_ item: BookMetadata) -> Bool {
            guard let paths = input.paths[item.id] else { return false }
            return paths.ebookPath != nil || paths.audioPath != nil || paths.syncedPath != nil
        }

        private func mergeItems(_ primary: [BookMetadata], with supplemental: [BookMetadata])
            -> [BookMetadata]
        {
            guard !supplemental.isEmpty else { return primary }
            var result = primary
            var seen = Set(result.map(\.id))
            for item in supplemental where !seen.contains(item.id) {
                seen.insert(item.id)
                result.append(item)
            }
            return result
        }

        private func seriesGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                if let seriesList = book.series, !seriesList.isEmpty {
                    for series in seriesList {
                        keys.insert(normalizedCategoryKey(series.name))
                    }
                } else {
                    keys.insert("__no_series__")
                }
            }
            return keys.count
        }

        private func authorGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                if let authors = book.authors, !authors.isEmpty {
                    for author in authors {
                        keys.insert(creatorGroupingKey(author, unknownKey: "__unknown__"))
                    }
                } else {
                    keys.insert("__no_author__")
                }
            }
            return keys.count
        }

        private func collectionGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                if let collections = book.collections {
                    for collection in collections {
                        keys.insert(normalizedCategoryKey(collection.name))
                    }
                }
            }
            return keys.count
        }

        private func narratorGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                if let narrators = book.narrators, !narrators.isEmpty {
                    for narrator in narrators {
                        keys.insert(creatorGroupingKey(narrator, unknownKey: "__unknown__"))
                    }
                } else {
                    keys.insert("__no_narrator__")
                }
            }
            return keys.count
        }

        private func translatorGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                let translators = (book.creators ?? []).filter { $0.role == "trl" }
                if translators.isEmpty {
                    keys.insert("__no_translator__")
                } else {
                    for translator in translators {
                        keys.insert(creatorGroupingKey(translator, unknownKey: "__unknown__"))
                    }
                }
            }
            return keys.count
        }

        private func publicationYearGroupCount(_ kind: MediaKind) -> Int {
            Set(
                input.metadata
                    .filter { metadataMatchesKind($0, kind: kind) }
                    .map { BookMetadata.publicationYear(from: $0.publicationDate) ?? "Unknown" }
            ).count
        }

        private func tagGroupCount(_ kind: MediaKind) -> Int {
            var keys = Set<String>()
            for book in input.metadata where metadataMatchesKind(book, kind: kind) {
                for tagName in book.tagNames {
                    keys.insert(tagName.lowercased())
                }
            }
            return keys.count
        }

        private func ratingGroupCount(_ kind: MediaKind) -> Int {
            Set(
                input.metadata
                    .filter { metadataMatchesKind($0, kind: kind) }
                    .map { book -> String in
                        if let rating = book.rating, rating > 0 {
                            return "\(Int(rating.rounded()))"
                        }
                        return "Unrated"
                    }
            ).count
        }

        private func statusGroupCount(_ kind: MediaKind) -> Int {
            Set(
                input.metadata
                    .filter { metadataMatchesKind($0, kind: kind) }
                    .map { $0.status?.name ?? "Unknown" }
            ).count
        }

        private func sourceGroupCount(_ kind: MediaKind) -> Int {
            Set(
                input.metadata
                    .filter { metadataMatchesKind($0, kind: kind) }
                    .map { book -> String in
                        book.source ?? "Unknown"
                    }
            ).count
        }

        private func books(matching kind: MediaKind) -> [BookMetadata] {
            input.metadata
        }

        private func creatorGroupingKey(_ creator: BookCreator, unknownKey: String) -> String {
            let name = (creator.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty {
                return normalizedCategoryKey(name)
            }
            return creator.uuid ?? unknownKey
        }

        private func normalizedCategoryKey(_ value: String) -> String {
            value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        }

        mutating func seriesGroups(_ kind: MediaKind) -> [LibrarySeriesGroup] {
            var seriesMap: [String: LibrarySeriesGroup] = [:]
            for book in books(matching: kind) {
                if let seriesList = book.series, !seriesList.isEmpty {
                    for series in seriesList {
                        let key = normalizedCategoryKey(series.name)
                        var group =
                            seriesMap[key]
                            ?? LibrarySeriesGroup(series: series, books: [])
                        if group.series?.uuid == nil, series.uuid != nil {
                            group.series = series
                        }
                        if !group.books.contains(where: { $0.id == book.id }) {
                            group.books.append(book)
                        }
                        seriesMap[key] = group
                    }
                } else {
                    seriesMap[
                        "__no_series__",
                        default: LibrarySeriesGroup(series: nil, books: []),
                    ]
                    .books
                    .append(book)
                }
            }

            for key in seriesMap.keys {
                let seriesName = seriesMap[key]?.series?.name.lowercased()
                seriesMap[key]?.books.sort { a, b in
                    let posA =
                        a.series?.first { $0.name.lowercased() == seriesName }?.position
                        ?? .greatestFiniteMagnitude
                    let posB =
                        b.series?.first { $0.name.lowercased() == seriesName }?.position
                        ?? .greatestFiniteMagnitude
                    if posA == posB {
                        return a.title.articleStrippedCompare(b.title) == .orderedAscending
                    }
                    return posA < posB
                }
            }

            return seriesMap.values.sorted { a, b in
                guard let seriesA = a.series, let seriesB = b.series else {
                    return a.series != nil
                }
                return seriesA.name.articleStrippedCompare(seriesB.name) == .orderedAscending
            }
        }

        mutating func authorGroups(_ kind: MediaKind) -> [LibraryCreatorGroup] {
            creatorGroups(
                kind,
                emptyKey: "__no_author__",
                creators: { $0.authors ?? [] },
                sort: { a, b in
                    guard let creatorA = a.creator, let creatorB = b.creator else {
                        return a.creator != nil
                    }
                    let nameA = creatorA.name ?? ""
                    let nameB = creatorB.name ?? ""
                    return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
                },
            )
        }

        mutating func narratorGroups(_ kind: MediaKind) -> [LibraryCreatorGroup] {
            creatorGroups(
                kind,
                emptyKey: "__no_narrator__",
                creators: { $0.narrators ?? [] },
                sort: { a, b in
                    guard let creatorA = a.creator, let creatorB = b.creator else {
                        return a.creator != nil
                    }
                    let nameA = creatorA.name ?? ""
                    let nameB = creatorB.name ?? ""
                    return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
                },
            )
        }

        mutating func translatorGroups(_ kind: MediaKind) -> [LibraryCreatorGroup] {
            creatorGroups(
                kind,
                emptyKey: "__no_translator__",
                creators: { ($0.creators ?? []).filter { $0.role == "trl" } },
                sort: { a, b in
                    guard let creatorA = a.creator, let creatorB = b.creator else {
                        return a.creator != nil
                    }
                    let nameA = creatorA.name ?? ""
                    let nameB = creatorB.name ?? ""
                    return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
                },
            )
        }

        private func creatorGroups(
            _ kind: MediaKind,
            emptyKey: String,
            creators: (BookMetadata) -> [BookCreator],
            sort: (LibraryCreatorGroup, LibraryCreatorGroup) -> Bool,
        ) -> [LibraryCreatorGroup] {
            var creatorMap: [String: LibraryCreatorGroup] = [:]
            for book in books(matching: kind) {
                let creatorList = creators(book)
                if creatorList.isEmpty {
                    creatorMap[
                        emptyKey,
                        default: LibraryCreatorGroup(creator: nil, books: []),
                    ]
                    .books
                    .append(book)
                } else {
                    for creator in creatorList {
                        let key = creatorGroupingKey(creator, unknownKey: "__unknown__")
                        var group =
                            creatorMap[key]
                            ?? LibraryCreatorGroup(creator: creator, books: [])
                        if group.creator?.uuid == nil, creator.uuid != nil {
                            group.creator = creator
                        }
                        if !group.books.contains(where: { $0.id == book.id }) {
                            group.books.append(book)
                        }
                        creatorMap[key] = group
                    }
                }
            }

            for key in creatorMap.keys {
                creatorMap[key]?.books.sort {
                    $0.title.articleStrippedCompare($1.title) == .orderedAscending
                }
            }

            return creatorMap.values.sorted(by: sort)
        }

        mutating func collectionGroups(_ kind: MediaKind) -> [LibraryCollectionGroup] {
            var collectionMap: [String: LibraryCollectionGroup] = [:]
            for book in books(matching: kind) {
                guard let collections = book.collections else { continue }
                for collection in collections {
                    let key = normalizedCategoryKey(collection.name)
                    var group =
                        collectionMap[key]
                        ?? LibraryCollectionGroup(collection: collection, books: [])
                    if group.collection?.uuid == nil, collection.uuid != nil {
                        group.collection = collection
                    }
                    if !group.books.contains(where: { $0.id == book.id }) {
                        group.books.append(book)
                    }
                    collectionMap[key] = group
                }
            }

            for key in collectionMap.keys {
                collectionMap[key]?.books.sort {
                    $0.title.articleStrippedCompare($1.title) == .orderedAscending
                }
            }

            return collectionMap.values.sorted { a, b in
                guard let collectionA = a.collection, let collectionB = b.collection else {
                    return a.collection != nil
                }
                return collectionA.name.articleStrippedCompare(collectionB.name)
                    == .orderedAscending
            }
        }

        mutating func publicationYearGroups(_ kind: MediaKind) -> [LibraryNamedBooksGroup] {
            namedGroups(kind) {
                BookMetadata.publicationYear(from: $0.publicationDate) ?? "Unknown"
            }
            .sorted {
                if $0.name == "Unknown" { return false }
                if $1.name == "Unknown" { return true }
                return $0.name > $1.name
            }
        }

        mutating func tagGroups(_ kind: MediaKind) -> [LibraryNamedBooksGroup] {
            var tagMap: [String: LibraryNamedBooksGroup] = [:]
            for book in books(matching: kind) {
                for tagName in book.tagNames {
                    let key = normalizedCategoryKey(tagName)
                    var group =
                        tagMap[key]
                        ?? LibraryNamedBooksGroup(name: tagName, books: [])
                    if !group.books.contains(where: { $0.id == book.id }) {
                        group.books.append(book)
                    }
                    tagMap[key] = group
                }
            }
            return sortedNamedGroups(Array(tagMap.values))
        }

        mutating func ratingGroups(_ kind: MediaKind) -> [LibraryNamedBooksGroup] {
            namedGroups(kind) { book in
                if let rating = book.rating, rating > 0 {
                    return "\(Int(rating.rounded()))"
                }
                return "Unrated"
            }
            .sorted {
                if $0.name == "Unrated" { return false }
                if $1.name == "Unrated" { return true }
                return (Int($0.name) ?? 0) > (Int($1.name) ?? 0)
            }
        }

        mutating func statusGroups(_ kind: MediaKind) -> [LibraryNamedBooksGroup] {
            let statusOrder = ["Reading", "To read", "Read", "Unknown"]
            return namedGroups(kind) { $0.status?.name ?? "Unknown" }
                .sorted { a, b in
                    let indexA = statusOrder.firstIndex(of: a.name) ?? statusOrder.count
                    let indexB = statusOrder.firstIndex(of: b.name) ?? statusOrder.count
                    if indexA != indexB { return indexA < indexB }
                    return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
                }
        }

        mutating func sourceGroups(_ kind: MediaKind) -> [LibraryNamedBooksGroup] {
            let sourceOrder = ["Storyteller", "Local Files", "Unknown"]
            return namedGroups(kind) { $0.source ?? "Unknown" }
                .sorted { a, b in
                    let indexA = sourceOrder.firstIndex(of: a.name) ?? sourceOrder.count
                    let indexB = sourceOrder.firstIndex(of: b.name) ?? sourceOrder.count
                    if indexA != indexB { return indexA < indexB }
                    return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
                }
        }

        private func namedGroups(
            _ kind: MediaKind,
            nameForBook: (BookMetadata) -> String,
        ) -> [LibraryNamedBooksGroup] {
            var map: [String: LibraryNamedBooksGroup] = [:]
            for book in books(matching: kind) {
                let name = nameForBook(book)
                map[name, default: LibraryNamedBooksGroup(name: name, books: [])].books.append(book)
            }
            return sortedNamedGroups(Array(map.values))
        }

        private func sortedNamedGroups(_ groups: [LibraryNamedBooksGroup])
            -> [LibraryNamedBooksGroup]
        {
            groups.map { group in
                var mutableGroup = group
                mutableGroup.books.sort {
                    $0.title.articleStrippedCompare($1.title) == .orderedAscending
                }
                return mutableGroup
            }
            .sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        }
    }
}
