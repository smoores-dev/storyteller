import Foundation

/// Metadata lines shown under a book cover in grid views. `auto` keeps the sort-adaptive
/// behavior, `none` hides the line, and any other cases render that field's value. Explicit
/// fields stack one per line, except short numeric fields which pair two to a line.
public enum ShowOnItemField: String, CaseIterable, Sendable {
    case auto
    case none
    case authors
    case narrators
    case series
    case seriesPosition
    case pageCount
    case duration
    case fileSize
    case publicationYear
    case rating
    case status
    case addedDate
    case tags

    public static var explicitFields: [ShowOnItemField] {
        allCases.filter { $0 != .auto && $0 != .none }
    }

    /// Fields short enough to share a line, mirroring the web's compact display set.
    public static let compactFields: Set<ShowOnItemField> = [
        .pageCount, .duration, .fileSize, .publicationYear, .rating,
    ]

    public var label: String {
        switch self {
            case .auto: return "Auto (Sort Field)"
            case .none: return "None"
            case .authors: return "Authors"
            case .narrators: return "Narrators"
            case .series: return "Series"
            case .seriesPosition: return "Series Position"
            case .pageCount: return "Pages"
            case .duration: return "Duration"
            case .fileSize: return "File Size"
            case .publicationYear: return "Pub Year"
            case .rating: return "User Rating"
            case .status: return "Status"
            case .addedDate: return "Date Added"
            case .tags: return "Tags"
        }
    }

    public func displayValue(for item: BookMetadata) -> String {
        switch self {
            case .auto, .none:
                return ""
            case .authors:
                return (item.authors ?? []).compactMap(\.name).joined(separator: ", ")
            case .narrators:
                return (item.narrators ?? []).compactMap(\.name).joined(separator: ", ")
            case .series:
                return item.series?.first?.name ?? ""
            case .seriesPosition:
                guard let series = item.series?.first else { return "" }
                guard let position = series.formattedPosition else { return series.name }
                return "#\(position) \(series.name)"
            case .pageCount:
                let pages = item.pagesDisplay
                return pages.isEmpty ? "" : "\(pages) pages"
            case .duration:
                return item.durationDisplay
            case .fileSize:
                return item.fileSizeDisplay
            case .publicationYear:
                return item.sortablePublicationYear
            case .rating:
                guard let rating = item.rating else { return "" }
                return "\(Self.trimmedRating(rating))\u{2605}"
            case .status:
                return item.status?.name ?? ""
            case .addedDate:
                return StorytellerDate.full(item.createdAtValue)
            case .tags:
                return item.tagNames.joined(separator: ", ")
        }
    }

    /// Matches the web display format: strip trailing zeros (5.00 -> "5", 4.80 -> "4.8").
    static func trimmedRating(_ rating: Double) -> String {
        var text = String(format: "%.2f", rating)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }
}

extension ShowOnItemField {
    /// Decodes a comma-joined stored selection. Unknown tokens are dropped; an empty or
    /// auto-containing result collapses to `[.auto]`, and `none` wins over explicit fields.
    public static func decodeSelection(_ raw: String) -> [ShowOnItemField] {
        let fields = raw.split(separator: ",").compactMap {
            ShowOnItemField(rawValue: $0.trimmingCharacters(in: .whitespaces))
        }
        if fields.isEmpty || fields.contains(.auto) { return [.auto] }
        if fields.contains(.none) { return [.none] }
        var seen: [ShowOnItemField] = []
        for field in fields where !seen.contains(field) {
            seen.append(field)
        }
        return seen
    }

    public static func encodeSelection(_ selection: [ShowOnItemField]) -> String {
        selection.map(\.rawValue).joined(separator: ",")
    }

    /// Applies a menu tap: `auto`/`none` are exclusive; explicit fields toggle, and an
    /// emptied list falls back to `auto`.
    public static func toggling(
        _ field: ShowOnItemField,
        in selection: [ShowOnItemField],
    ) -> [ShowOnItemField] {
        switch field {
            case .auto:
                return [.auto]
            case .none:
                return [.none]
            default:
                var explicit = selection.filter { $0 != .auto && $0 != .none }
                if let index = explicit.firstIndex(of: field) {
                    explicit.remove(at: index)
                } else {
                    explicit.append(field)
                }
                return explicit.isEmpty ? [.auto] : explicit
        }
    }

    /// Groups an explicit selection into display rows the way the web does: each field on
    /// its own line, except consecutive compact fields which pair two to a line. Returns
    /// nil when the sort-adaptive auto line applies, and an empty array for `none`.
    public static func displayRows(_ selection: [ShowOnItemField]) -> [[ShowOnItemField]]? {
        if selection.isEmpty || selection.contains(.auto) { return nil }
        if selection.contains(.none) { return [] }
        var rows: [[ShowOnItemField]] = []
        for field in selection {
            if compactFields.contains(field),
                let last = rows.last, last.count < 2,
                last.allSatisfy({ compactFields.contains($0) })
            {
                rows[rows.count - 1].append(field)
            } else {
                rows.append([field])
            }
        }
        return rows
    }

    /// One row's rendered text. Empty values become an em dash so every card keeps the
    /// same line count and the grid rows stay aligned.
    public static func rowText(_ row: [ShowOnItemField], for item: BookMetadata) -> String {
        row
            .map { field in
                let value = field.displayValue(for: item)
                return value.isEmpty ? "\u{2014}" : value
            }
            .joined(separator: " \u{00B7} ")
    }

    /// Number of metadata lines a selection occupies above the title, for card sizing.
    public static func secondaryLineCount(_ selection: [ShowOnItemField]) -> Int {
        displayRows(selection)?.count ?? 1
    }

    public static func selectionSummary(_ selection: [ShowOnItemField]) -> String {
        if selection.isEmpty || selection.contains(.auto) {
            return ShowOnItemField.auto.label
        }
        if selection.contains(.none) { return ShowOnItemField.none.label }
        return selection.map(\.label).joined(separator: ", ")
    }
}
