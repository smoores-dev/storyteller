import Foundation

/// Canonical, ordered registry of the book-metadata fields the library exposes. The sort menu, the
/// table column menu, the filter menu, and the smart-shelf builder all derive their field ordering,
/// section grouping (dividers), labels, and submenu structure from this one list (via
/// ``sortFields`` / ``columnFields`` / ``filterFields`` / ``shelfFields``) so the four surfaces
/// stay consistent; changing the order here updates all of them.
///
/// Surface-specific entries that aren't shared book metadata (table cover/media columns, the
/// translator filter, and the format / rating / boolean filters and shelf conditions) are added by
/// their own surfaces around the registry-driven fields, not represented here.
public enum LibraryMetadataField: String, CaseIterable, Sendable {
    case title, subtitle, author, narrator, series, publicationDate, language, pages, duration
    case tags, collections, identifiers, dateAdded, dateRead, status, progress, fileSize, source
    case location, creators, alignment
}

/// Describes how a single ``LibraryMetadataField`` participates across the four surfaces.
public struct LibraryFieldDescriptor: Sendable {
    public let field: LibraryMetadataField
    public let label: String
    /// Fields are grouped into sections; a divider is drawn wherever the section changes.
    public let section: Int
    public let isSortable: Bool
    public let isColumn: Bool
    public let isFilter: Bool
    public let isShelf: Bool
    /// Creators and Alignment render as nested menus; each surface expands their sub-items.
    public let isSubmenu: Bool

    public init(
        _ field: LibraryMetadataField,
        label: String,
        section: Int,
        sortable: Bool = false,
        column: Bool = false,
        filter: Bool = false,
        shelf: Bool = false,
        submenu: Bool = false,
    ) {
        self.field = field
        self.label = label
        self.section = section
        isSortable = sortable
        isColumn = column
        isFilter = filter
        isShelf = shelf
        isSubmenu = submenu
    }
}

extension LibraryMetadataField {
    public static let ordered: [LibraryFieldDescriptor] = [
        .init(.title, label: "Title", section: 1, sortable: true, column: true),
        .init(.subtitle, label: "Subtitle", section: 1, column: true),
        .init(
            .author,
            label: "Author",
            section: 1,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(
            .narrator,
            label: "Narrator",
            section: 1,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(
            .series,
            label: "Series",
            section: 1,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(
            .publicationDate,
            label: "Pub Date",
            section: 1,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(.language, label: "Language", section: 1, sortable: true, column: true, shelf: true),
        .init(.pages, label: "Pages", section: 1, sortable: true, column: true, shelf: true),
        .init(.duration, label: "Duration", section: 1, sortable: true, column: true, shelf: true),

        .init(.tags, label: "Tags", section: 2, column: true, filter: true, shelf: true),
        .init(.collections, label: "Collections", section: 2, column: true, shelf: true),
        .init(.identifiers, label: "Identifiers", section: 2, sortable: true, column: true),
        .init(
            .dateAdded,
            label: "Date Added",
            section: 2,
            sortable: true,
            column: true,
            shelf: true,
        ),
        .init(
            .dateRead,
            label: "Date Read",
            section: 2,
            sortable: true,
            column: true,
            shelf: true,
        ),
        .init(
            .status,
            label: "Status",
            section: 2,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(
            .progress,
            label: "Progress",
            section: 2,
            sortable: true,
            column: true,
            filter: true,
            shelf: true,
        ),
        .init(
            .fileSize,
            label: "File Size",
            section: 2,
            sortable: true,
            column: true,
            shelf: true,
        ),
        .init(.source, label: "Source", section: 2, column: true, filter: true, shelf: true),
        .init(.location, label: "Location", section: 2, filter: true, shelf: true),

        .init(.creators, label: "Creators", section: 3, column: true, submenu: true),
        .init(
            .alignment,
            label: "Alignment",
            section: 3,
            sortable: true,
            column: true,
            shelf: true,
            submenu: true,
        ),
    ]

    public static var sortFields: [LibraryFieldDescriptor] { ordered.filter(\.isSortable) }
    public static var columnFields: [LibraryFieldDescriptor] { ordered.filter(\.isColumn) }
    public static var filterFields: [LibraryFieldDescriptor] { ordered.filter(\.isFilter) }
    public static var shelfFields: [LibraryFieldDescriptor] { ordered.filter(\.isShelf) }
}
