public enum HomeSectionKind: String, CaseIterable, Codable, Hashable, Sendable {
    case currentlyReading
    case startReading
    case recentlyAdded
    case completed

    public var title: String {
        switch self {
            case .currentlyReading: "Currently Reading"
            case .startReading: "Start Reading"
            case .recentlyAdded: "Recently Added"
            case .completed: "Completed"
        }
    }

    public var statusFilter: String? {
        switch self {
            case .currentlyReading: "Reading"
            case .startReading: "To read"
            case .recentlyAdded: nil
            case .completed: "Read"
        }
    }

    public var sortOrder: HomeSectionSortOrder {
        switch self {
            case .currentlyReading, .completed: .recentPositionUpdate
            case .startReading, .recentlyAdded: .recentlyAdded
        }
    }
}

public enum HomeSectionSortOrder: Hashable, Sendable {
    case recentPositionUpdate
    case recentlyAdded
}

public struct HomeSectionSnapshot: Sendable {
    public let kind: HomeSectionKind
    public let books: [BookMetadata]

    public init(kind: HomeSectionKind, books: [BookMetadata]) {
        self.kind = kind
        self.books = books
    }
}

public enum HomeSectionDeriver {
    public static func sections(
        kinds: [HomeSectionKind] = HomeSectionKind.allCases,
        books: [BookMetadata],
        progress: [BookID: BookProgress],
        searchText: String = "",
        limit: Int = 12,
    ) -> [HomeSectionSnapshot] {
        kinds.map { kind in
            HomeSectionSnapshot(
                kind: kind,
                books: sectionBooks(
                    kind: kind,
                    books: books,
                    progress: progress,
                    searchText: searchText,
                    limit: limit,
                ),
            )
        }
    }

    public static func matchesSearchText(_ book: BookMetadata, searchText: String) -> Bool {
        guard searchText.count >= 2 else { return true }
        let terms = searchText.lowercased().split(separator: " ").map(String.init)
        let title = book.title.lowercased()
        let authorNames = (book.authors ?? []).compactMap { $0.name?.lowercased() }
        return terms.allSatisfy { term in
            title.contains(term) || authorNames.contains { $0.contains(term) }
        }
    }

    private static func sectionBooks(
        kind: HomeSectionKind,
        books: [BookMetadata],
        progress: [BookID: BookProgress],
        searchText: String,
        limit: Int,
    ) -> [BookMetadata] {
        let filtered: [BookMetadata]
        if let status = kind.statusFilter {
            filtered = books.filter { $0.status?.name == status }
        } else {
            filtered = books
        }

        let sorted: [BookMetadata]
        switch kind.sortOrder {
            case .recentPositionUpdate:
                sorted = filtered.sorted { lhs, rhs in
                    (progress[lhs.id]?.timestamp ?? 0) > (progress[rhs.id]?.timestamp ?? 0)
                }
            case .recentlyAdded:
                sorted = filtered.sorted {
                    ($0.createdAt ?? "") > ($1.createdAt ?? "")
                }
        }

        return Array(sorted.prefix(max(0, limit))).filter {
            matchesSearchText($0, searchText: searchText)
        }
    }
}
