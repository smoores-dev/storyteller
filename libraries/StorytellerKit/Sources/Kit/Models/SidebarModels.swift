import Foundation

public struct SidebarSectionDescription: Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var items: [SidebarItemDescription]

    public init(id: String, name: String, items: [SidebarItemDescription]) {
        self.id = id
        self.name = name
        self.items = items
    }
}

public struct SidebarItemDescription: Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var systemImage: String
    public var badge: Int32
    public var children: [SidebarItemDescription]? = nil
    public var content: SidebarContentKind

    public init(
        id: String? = nil,
        name: String,
        systemImage: String,
        badge: Int32,
        children: [SidebarItemDescription]? = nil,
        content: SidebarContentKind,
    ) {
        self.id = id ?? content.stableIdentifier
        self.name = name
        self.systemImage = systemImage
        self.badge = badge
        self.children = children
        self.content = content
    }
}

public enum SidebarContentKind: Hashable, Sendable {
    case home
    case mediaGrid(MediaGridConfiguration)
    case seriesView(MediaKind)
    case authorView(MediaKind)
    case narratorView(MediaKind)
    case translatorView(MediaKind)
    case tagView(MediaKind)
    case publicationYearView(MediaKind)
    case ratingView(MediaKind)
    case collectionsView(MediaKind)
    case statusView(MediaKind)
    case sourceView(MediaKind)
    case bookReports
    case smartShelves
    case smartShelfDetail(UUID)
    case placeholder(title: String)
    case currentlyDownloading
    case downloaded
    case storytellerServer
    case bookSource(BookSourceID)

    public var stableIdentifier: String {
        switch self {
            case .home:
                return "home"
            case .mediaGrid(let config):
                return "mediaGrid.\(config.title)"
            case .seriesView(let kind):
                return "seriesView.\(kind.rawValue)"
            case .authorView(let kind):
                return "authorView.\(kind.rawValue)"
            case .narratorView(let kind):
                return "narratorView.\(kind.rawValue)"
            case .translatorView(let kind):
                return "translatorView.\(kind.rawValue)"
            case .tagView(let kind):
                return "tagView.\(kind.rawValue)"
            case .publicationYearView(let kind):
                return "publicationYearView.\(kind.rawValue)"
            case .ratingView(let kind):
                return "ratingView.\(kind.rawValue)"
            case .collectionsView(let kind):
                return "collectionsView.\(kind.rawValue)"
            case .statusView(let kind):
                return "statusView.\(kind.rawValue)"
            case .sourceView(let kind):
                return "sourceView.\(kind.rawValue)"
            case .bookReports:
                return "bookReports"
            case .smartShelves:
                return "smartShelves"
            case .smartShelfDetail(let id):
                return "smartShelfDetail.\(id.uuidString)"
            case .placeholder(let title):
                return "placeholder.\(title)"
            case .currentlyDownloading:
                return "currentlyDownloading"
            case .downloaded:
                return "downloaded"
            case .storytellerServer:
                return "storytellerServer"
            case .bookSource(let sourceID):
                return "bookSource.\(sourceID)"
        }
    }
}

public enum MetadataLinkTarget: Hashable, Sendable {
    case author(String)
    case series(String)
    case narrator(String)
    case translator(String)
    case publicationYear(String)
    case status(String)
    case tag(String)
    case collection(String)
    case rating(String)
}

extension MetadataLinkTarget {
    public var displayValue: String {
        switch self {
            case .author(let value), .series(let value), .narrator(let value),
                .translator(let value), .publicationYear(let value), .status(let value),
                .tag(let value), .collection(let value), .rating(let value):
                return value
        }
    }

    public var systemImage: String {
        switch self {
            case .author: return "person.2"
            case .series: return "books.vertical"
            case .narrator: return "mic"
            case .translator: return "character.book.closed.fill"
            case .publicationYear: return "calendar"
            case .status: return "arrow.right.circle"
            case .tag: return "tag"
            case .collection: return "books.vertical.fill"
            case .rating: return "star"
        }
    }

    public var viewOptionsKey: String {
        switch self {
            case .author: return "authorView"
            case .series: return "seriesView"
            case .narrator: return "narratorView"
            case .translator: return "translatorView"
            case .publicationYear: return "publicationYearView"
            case .status: return "statusView"
            case .tag: return "tagView"
            case .collection: return "collectionsView"
            case .rating: return "ratingView"
        }
    }

    public func configuration(
        mediaKind: MediaKind,
        preferredTileWidth: Double,
        minimumTileWidth: Double,
    ) -> MediaGridConfiguration {
        var config = MediaGridConfiguration(
            title: displayValue,
            mediaKind: mediaKind,
            preferredTileWidth: preferredTileWidth,
            minimumTileWidth: minimumTileWidth,
        )
        switch self {
            case .author(let value): config.authorFilter = value
            case .series(let value): config.seriesFilter = value
            case .narrator(let value): config.narratorFilter = value
            case .translator(let value): config.translatorFilter = value
            case .publicationYear(let value): config.publicationYearFilter = value
            case .status(let value): config.statusFilter = value
            case .tag(let value): config.tagFilter = value
            case .collection(let value): config.collectionFilter = value
            case .rating(let value): config.ratingFilter = value
        }
        return config
    }
}

public enum NarrationFilter: Hashable, Sendable {
    case both
    case withAudio
    case withoutAudio
}

public enum LocationFilter: String, CaseIterable, Hashable, Sendable {
    case all
    case downloaded
    case serverOnly
    case localFiles
}

public enum MediaKind: String, CaseIterable, Sendable {
    case ebook
    case audiobook
}

public struct MediaGridConfiguration: Hashable, Sendable {
    public var title: String
    public var mediaKind: MediaKind
    public var preferredTileWidth: Double?
    public var minimumTileWidth: Double?
    public var narrationFilter: NarrationFilter
    public var locationFilter: LocationFilter
    public var tagFilter: String?
    public var seriesFilter: String?
    public var collectionFilter: String?
    public var authorFilter: String?
    public var narratorFilter: String?
    public var translatorFilter: String?
    public var publicationYearFilter: String?
    public var ratingFilter: String?
    public var statusFilter: String?
    public var defaultSort: String?

    public init(
        title: String,
        mediaKind: MediaKind,
        preferredTileWidth: Double? = nil,
        minimumTileWidth: Double? = nil,
        narrationFilter: NarrationFilter = .both,
        locationFilter: LocationFilter = .all,
        tagFilter: String? = nil,
        seriesFilter: String? = nil,
        collectionFilter: String? = nil,
        authorFilter: String? = nil,
        narratorFilter: String? = nil,
        translatorFilter: String? = nil,
        publicationYearFilter: String? = nil,
        ratingFilter: String? = nil,
        statusFilter: String? = nil,
        defaultSort: String? = nil,
    ) {
        self.title = title
        self.mediaKind = mediaKind
        self.preferredTileWidth = preferredTileWidth
        self.minimumTileWidth = minimumTileWidth
        self.narrationFilter = narrationFilter
        self.locationFilter = locationFilter
        self.tagFilter = tagFilter
        self.seriesFilter = seriesFilter
        self.collectionFilter = collectionFilter
        self.authorFilter = authorFilter
        self.narratorFilter = narratorFilter
        self.translatorFilter = translatorFilter
        self.publicationYearFilter = publicationYearFilter
        self.ratingFilter = ratingFilter
        self.statusFilter = statusFilter
        self.defaultSort = defaultSort
    }
}

public enum LibrarySidebarDefaults {
    public static func getSections() -> [SidebarSectionDescription] {
        [
            SidebarSectionDescription(
                id: "section.home",
                name: "Home",
                items: [
                    SidebarItemDescription(
                        name: "Dashboard",
                        systemImage: "house",
                        badge: 0,
                        content: .home,
                    ),
                    SidebarItemDescription(
                        name: "All Books",
                        systemImage: "book",
                        badge: 112,
                        content: .mediaGrid(
                            MediaGridConfiguration(
                                title: "All Books",
                                mediaKind: .ebook,
                                preferredTileWidth: 120,
                                minimumTileWidth: 50,
                            )
                        ),
                    ),
                ],
            ),
            SidebarSectionDescription(
                id: "section.library",
                name: "Library",
                items: [
                    SidebarItemDescription(
                        name: "Series",
                        systemImage: "books.vertical",
                        badge: -1,
                        content: .seriesView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Author",
                        systemImage: "person.2",
                        badge: -1,
                        content: .authorView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Narrator",
                        systemImage: "mic",
                        badge: -1,
                        content: .narratorView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Translator",
                        systemImage: "character.book.closed.fill",
                        badge: -1,
                        content: .translatorView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Tag",
                        systemImage: "tag",
                        badge: -1,
                        content: .tagView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Pub Year",
                        systemImage: "calendar",
                        badge: -1,
                        content: .publicationYearView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "User Rating",
                        systemImage: "star",
                        badge: -1,
                        content: .ratingView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Status",
                        systemImage: "arrow.right.circle",
                        badge: -1,
                        content: .statusView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Source",
                        systemImage: "externaldrive",
                        badge: -1,
                        content: .sourceView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Book Reports",
                        systemImage: "checkmark.seal",
                        badge: -1,
                        content: .bookReports,
                    ),
                ],
            ),
            SidebarSectionDescription(
                id: "section.collections",
                name: "Collections",
                items: [
                    SidebarItemDescription(
                        name: "Server Collections",
                        systemImage: "rectangle.stack",
                        badge: -1,
                        content: .collectionsView(.ebook),
                    ),
                    SidebarItemDescription(
                        name: "Smart Shelves",
                        systemImage: "sparkles.rectangle.stack",
                        badge: -1,
                        content: .smartShelves,
                    ),
                ],
            ),
            SidebarSectionDescription(
                id: "section.mediaSources",
                name: "Media Sources",
                items: [
                    SidebarItemDescription(
                        name: "Sources",
                        systemImage: "externaldrive",
                        badge: -1,
                        content: .storytellerServer,
                    ),
                    SidebarItemDescription(
                        name: "Downloaded",
                        systemImage: "arrow.down.circle",
                        badge: -1,
                        content: .downloaded,
                    ),
                    SidebarItemDescription(
                        name: "Downloading",
                        systemImage: "arrow.down.circle.dotted",
                        badge: -1,
                        content: .currentlyDownloading,
                    ),
                ],
            ),
        ]
    }
}
