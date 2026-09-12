import AppIntents
import StorytellerAppleWidgets
import SwiftUI
import WidgetKit

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

enum StorytellerWidgetLayoutMode: String, AppEnum {
    case summary
    case grid

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Layout")
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .summary: "Book Summary",
        .grid: "Book Grid",
    ]
}

enum StorytellerWidgetShelf: String, AppEnum {
    case currentlyReading
    case recentlyAdded
    case startReading
    case completed

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Shelf")
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .currentlyReading: "Currently Reading",
        .recentlyAdded: "Recently Added",
        .startReading: "Start Reading",
        .completed: "Completed",
    ]
}

enum StorytellerWidgetProgressStyle: String, AppEnum {
    case line
    case circle
    case text
    case off

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Progress")
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .line: "Line",
        .circle: "Circle",
        .text: "Percent",
        .off: "Off",
    ]
}

struct StorytellerWidgetBookEntity: AppEntity, Identifiable, Hashable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Book")
    static let defaultQuery = StorytellerWidgetBookQuery()

    static let noneID = "__none__"
    // Named to avoid colliding with Optional.none in optional-returning contexts.
    static let noneChoice = StorytellerWidgetBookEntity(
        id: noneID,
        title: "None",
        authorLine: "Show books from the shelf",
    )

    let id: String
    let title: String
    let authorLine: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(authorLine)")
    }
}

struct StorytellerWidgetBookQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [StorytellerWidgetBookEntity] {
        let books = StorytellerWidgetSnapshotStore.loadSnapshot().books
        return identifiers.compactMap { identifier in
            if identifier == StorytellerWidgetBookEntity.noneID {
                return .noneChoice
            }
            guard let bookID = StorytellerBookLink.bookID(from: identifier),
                let exact = books.first(where: { $0.id == bookID })
            else { return nil }
            return entity(for: exact)
        }
    }

    func entities(matching string: String) async throws -> [StorytellerWidgetBookEntity] {
        let query = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return allEntities() }
        return allEntities().filter {
            $0.title.lowercased().contains(query) || $0.authorLine.lowercased().contains(query)
        }
    }

    func suggestedEntities() async throws -> [StorytellerWidgetBookEntity] {
        allEntities()
    }

    func defaultResult() async -> StorytellerWidgetBookEntity? {
        .noneChoice
    }

    private func allEntities() -> [StorytellerWidgetBookEntity] {
        [.noneChoice]
            + StorytellerWidgetSnapshotStore.loadSnapshot().books.compactMap { entity(for: $0) }
    }

    private func entity(for book: StorytellerWidgetBookSnapshot) -> StorytellerWidgetBookEntity? {
        guard let identifier = StorytellerBookLink.identifier(for: book.bookID) else { return nil }
        return StorytellerWidgetBookEntity(
            id: identifier,
            title: book.title,
            authorLine: book.authorLine,
        )
    }
}

struct StorytellerReadingWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Reading Widget"
    static let description = IntentDescription(
        "Show your most recent book, or pin a favorite to the top."
    )

    @Parameter(title: "Shelf", default: .currentlyReading)
    var shelf: StorytellerWidgetShelf

    @Parameter(title: "Pinned Book")
    var book: StorytellerWidgetBookEntity?

    // The medium and large families switch on this; other sizes have one natural layout.
    @Parameter(title: "Layout", default: .summary)
    var layout: StorytellerWidgetLayoutMode

    @Parameter(title: "Progress", default: .line)
    var progressStyle: StorytellerWidgetProgressStyle
}

struct StorytellerReadingEntry: TimelineEntry {
    let date: Date
    let configuration: StorytellerReadingWidgetIntent
    let snapshot: StorytellerWidgetSnapshot

    var progressStyle: StorytellerWidgetProgressStyle {
        configuration.progressStyle
    }

    // Snapshot books arrive currently-reading first, then by recency, so filters
    // preserve a sensible order except recently-added, which re-sorts by arrival.
    var shelf: [StorytellerWidgetBookSnapshot] {
        switch configuration.shelf {
            case .currentlyReading:
                return snapshot.books.filter(\.isCurrentlyReading)
            case .recentlyAdded:
                return snapshot.books.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            case .startReading:
                return snapshot.books.filter { $0.statusName == "to read" }
                    .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            case .completed:
                return snapshot.books.filter { $0.statusName == "read" }
        }
    }

    private var configuredPinnedBookID: StorytellerWidgetBookSnapshot.ID? {
        guard let id = configuration.book?.id,
            id != StorytellerWidgetBookEntity.noneID
        else { return nil }
        return StorytellerBookLink.bookID(from: id)
    }

    var pinnedBookID: StorytellerWidgetBookSnapshot.ID? {
        guard let configuredPinnedBookID else { return nil }
        return snapshot.books.contains(where: { $0.id == configuredPinnedBookID })
            ? configuredPinnedBookID : nil
    }

    var featuredBookIsPinned: Bool {
        pinnedBookID != nil && pinnedBookID == featuredBook?.id
    }

    var featuredBook: StorytellerWidgetBookSnapshot? {
        if let pinnedBookID,
            let pinned = snapshot.books.first(where: { $0.id == pinnedBookID })
        {
            return pinned
        }
        return shelf.first ?? snapshot.books.first
    }

    // Featured book first, then the selected shelf without it.
    var shelfBooks: [StorytellerWidgetBookSnapshot] {
        guard let featuredBook else { return shelf }
        return [featuredBook] + shelf.filter { $0.id != featuredBook.id }
    }

    var shelfExcludingFeatured: [StorytellerWidgetBookSnapshot] {
        shelf.filter { $0.id != featuredBook?.id }
    }
}

struct StorytellerReadingTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> StorytellerReadingEntry {
        StorytellerReadingEntry(
            date: Date(),
            configuration: StorytellerReadingWidgetIntent(),
            snapshot: .empty,
        )
    }

    func snapshot(
        for configuration: StorytellerReadingWidgetIntent,
        in context: Context,
    ) async -> StorytellerReadingEntry {
        StorytellerReadingEntry(
            date: Date(),
            configuration: configuration,
            snapshot: StorytellerWidgetSnapshotStore.loadSnapshot(),
        )
    }

    func timeline(
        for configuration: StorytellerReadingWidgetIntent,
        in context: Context,
    ) async -> Timeline<StorytellerReadingEntry> {
        let entry = StorytellerReadingEntry(
            date: Date(),
            configuration: configuration,
            snapshot: StorytellerWidgetSnapshotStore.loadSnapshot(),
        )
        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
    }
}

struct StorytellerReadingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: StorytellerWidgetConstants.readingWidgetKind,
            intent: StorytellerReadingWidgetIntent.self,
            provider: StorytellerReadingTimelineProvider(),
        ) { entry in
            StorytellerReadingWidgetView(entry: entry)
        }
        .configurationDisplayName("Storyteller")
        .description("Track current books and reading progress.")
        .supportedFamilies(Self.supportedFamilies)
        .contentMarginsDisabled()
    }

    private static var supportedFamilies: [WidgetFamily] {
        var families: [WidgetFamily] = [
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .systemExtraLarge,
        ]
        #if !os(macOS)
        families += [.accessoryCircular, .accessoryRectangular, .accessoryInline]
        #endif
        return families
    }
}

@main
struct StorytellerReaderWidgets: WidgetBundle {
    var body: some Widget {
        StorytellerReadingWidget()
    }
}

private struct StorytellerReadingWidgetView: View {
    let entry: StorytellerReadingEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            if entry.snapshot.books.isEmpty {
                EmptyReadingWidgetView()
            } else {
                content
            }
        }
        .containerBackground(for: .widget) {
            WidgetPalette.background
        }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
            case .systemSmall:
                SmallCoverWidgetView(
                    book: entry.featuredBook,
                    progressStyle: entry.progressStyle,
                    isPinned: entry.featuredBookIsPinned,
                )
            case .systemMedium:
                if entry.configuration.layout == .grid {
                    CoverGridWidgetView(
                        books: Array(entry.shelfBooks.prefix(3)),
                        columns: 3,
                        spacing: 12,
                        progressStyle: entry.progressStyle,
                        pinnedBookID: entry.pinnedBookID,
                    )
                } else {
                    FocusedBookWidgetView(book: entry.featuredBook, compact: true)
                }
            case .systemLarge:
                if entry.configuration.layout == .grid {
                    CoverGridWidgetView(
                        books: Array(entry.shelfBooks.prefix(6)),
                        columns: 3,
                        spacing: 14,
                        progressStyle: entry.progressStyle,
                        pinnedBookID: entry.pinnedBookID,
                    )
                } else {
                    LargeSummaryWidgetView(entry: entry)
                }
            case .systemExtraLarge:
                CoverGridWidgetView(
                    books: Array(entry.shelfBooks.prefix(12)),
                    columns: 6,
                    spacing: 16,
                    progressStyle: entry.progressStyle,
                    pinnedBookID: entry.pinnedBookID,
                )
            #if !os(macOS)
                case .accessoryCircular:
                    AccessoryCircularReadingView(book: entry.featuredBook)
                case .accessoryRectangular:
                    AccessoryRectangularReadingView(book: entry.featuredBook)
                case .accessoryInline:
                    AccessoryInlineReadingView(book: entry.featuredBook)
            #endif
            default:
                FocusedBookWidgetView(book: entry.featuredBook, compact: true)
        }
    }
}

private struct CoverGridWidgetView: View {
    let books: [StorytellerWidgetBookSnapshot]
    let columns: Int
    let spacing: CGFloat
    let progressStyle: StorytellerWidgetProgressStyle
    var pinnedBookID: StorytellerWidgetBookSnapshot.ID? = nil
    var contentPadding: (horizontal: CGFloat, vertical: CGFloat)? = nil

    var body: some View {
        GeometryReader { proxy in
            let rows = max(1, Int(ceil(Double(books.count) / Double(columns))))
            let padding = contentPadding ?? gridPadding(for: proxy.size)
            let availableWidth =
                proxy.size.width - padding.horizontal * 2 - spacing * CGFloat(columns - 1)
            let availableHeight =
                proxy.size.height - padding.vertical * 2 - spacing * CGFloat(rows - 1)
            let coverWidth = min(
                availableWidth / CGFloat(columns),
                availableHeight / CGFloat(rows) * WidgetMetrics.coverAspect,
            )

            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.fixed(coverWidth), spacing: spacing),
                    count: columns,
                ),
                alignment: .center,
                spacing: spacing,
            ) {
                ForEach(books) { book in
                    OptionalLink(destination: book.widgetURL) {
                        CoverTileView(
                            book: book,
                            cornerRadius: 7,
                            progressStyle: progressStyle,
                            showPin: book.id == pinnedBookID,
                        )
                        .frame(width: coverWidth)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, padding.horizontal)
            .padding(.vertical, padding.vertical)
        }
    }

    private func gridPadding(for size: CGSize) -> (horizontal: CGFloat, vertical: CGFloat) {
        let tightSide = min(size.width, size.height)
        if tightSide < 180 {
            return (14, 14)
        }
        return (20, 18)
    }
}

// The unfocused macOS desktop (and the iOS tinted home screen) renders
// widgets in accented mode, which flattens an opaque bitmap into a solid
// alpha-shaped slab unless the image opts into an accented rendering mode.
// Full color keeps cover art intact there, matching the Photos widget.
private struct CoverImageView: View {
    let image: Image

    var body: some View {
        if #available(iOS 18.0, *) {
            image
                .resizable()
                .widgetAccentedRenderingMode(.fullColor)
                .scaledToFill()
        } else {
            image
                .resizable()
                .scaledToFill()
        }
    }
}

private struct SmallCoverWidgetView: View {
    let book: StorytellerWidgetBookSnapshot?
    let progressStyle: StorytellerWidgetProgressStyle
    var isPinned: Bool = false

    var body: some View {
        if let book {
            GeometryReader { proxy in
                ZStack {
                    WidgetPalette.coverFallback
                    if let image = WidgetCoverLoader.image(for: book, preferSquare: true) {
                        CoverImageView(image: image)
                    } else {
                        Image(
                            systemName: book.readingKind == .audiobook
                                ? "headphones" : "book.closed.fill"
                        )
                        .font(
                            .system(
                                size: min(proxy.size.width, proxy.size.height) * 0.3,
                                weight: .semibold,
                            )
                        )
                        .foregroundStyle(WidgetPalette.primaryText.opacity(0.72))
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
            }
            .coverProgressOverlays(book: book, style: progressStyle)
            .overlay(alignment: .topTrailing) {
                if isPinned {
                    PinBadgeView()
                }
            }
            .widgetURL(book.widgetURL)
        } else {
            EmptyReadingWidgetView()
        }
    }
}

// macOS widget families are shorter than their iOS counterparts and macOS
// type runs denser, so the iOS sizes overflow the medium card vertically and
// minimumScaleFactor crushes the title below the author line.
private enum FocusedTypography {
    #if os(macOS)
    static let author: CGFloat = 12
    static let title: CGFloat = 16
    static let titleMinScale: CGFloat = 1
    static let summary: CGFloat = 12
    static let remainingCompact: CGFloat = 11
    static let remainingRegular: CGFloat = 12
    static let percent: CGFloat = 13
    static let percentMinWidth: CGFloat = 36
    #else
    static let author: CGFloat = 15
    static let title: CGFloat = 18
    static let titleMinScale: CGFloat = 0.78
    static let summary: CGFloat = 14
    static let remainingCompact: CGFloat = 12
    static let remainingRegular: CGFloat = 13
    static let percent: CGFloat = 16
    static let percentMinWidth: CGFloat = 42
    #endif
}

private struct FocusedBookWidgetView: View {
    let book: StorytellerWidgetBookSnapshot?
    var compact: Bool

    var body: some View {
        if let book {
            OptionalLink(destination: book.widgetURL) {
                HStack(spacing: compact ? 12 : 16) {
                    // No fixed width: the cover fills the section height so the text
                    // column lines up with its top and bottom edges.
                    CoverArtView(book: book, cornerRadius: 7)

                    VStack(alignment: .leading, spacing: compact ? 3 : 5) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(
                                book.authorLine.isEmpty
                                    ? book.sourceName ?? "Storyteller" : book.authorLine
                            )
                            .font(.system(size: FocusedTypography.author, weight: .medium))
                            .foregroundStyle(WidgetPalette.secondaryText)
                            .lineLimit(1)
                            Text(book.title)
                                .font(.system(size: FocusedTypography.title, weight: .semibold))
                                .foregroundStyle(WidgetPalette.primaryText)
                                .lineLimit(2)
                                .minimumScaleFactor(FocusedTypography.titleMinScale)
                        }

                        if compact {
                            // Capped so the title-to-blurb gap stays snug; leftover
                            // space pools below the blurb instead.
                            Spacer(minLength: 0)
                                .frame(maxHeight: 0)
                        }

                        if let summary = book.summary {
                            // Fixed three-line block so the description and the stats
                            // line sit in the same place on every card.
                            Text(summary)
                                .font(.system(size: FocusedTypography.summary, weight: .regular))
                                .foregroundStyle(WidgetPalette.secondaryText)
                                .lineLimit(3, reservesSpace: true)
                        }

                        Spacer(minLength: 0)

                        if let remaining = book.remainingLabel {
                            Text(remaining)
                                .font(
                                    .system(
                                        size: compact
                                            ? FocusedTypography.remainingCompact
                                            : FocusedTypography.remainingRegular,
                                        weight: .medium,
                                        design: .rounded,
                                    )
                                )
                                .foregroundStyle(WidgetPalette.secondaryText)
                        }
                        ProgressStripView(book: book)
                    }
                }
                .padding(.horizontal, compact ? 14 : 18)
                .padding(.vertical, compact ? 12 : 14)
            }
            .buttonStyle(.plain)
        } else {
            EmptyReadingWidgetView()
        }
    }
}

private struct LargeSummaryWidgetView: View {
    let entry: StorytellerReadingEntry

    var body: some View {
        let shelfRow = Array(entry.shelfExcludingFeatured.prefix(3))
        VStack(spacing: 10) {
            FocusedBookWidgetView(book: entry.featuredBook, compact: false)
                .frame(maxHeight: shelfRow.isEmpty ? .infinity : 225)

            if !shelfRow.isEmpty {
                CoverGridWidgetView(
                    books: shelfRow,
                    columns: 3,
                    spacing: 12,
                    progressStyle: entry.progressStyle,
                    contentPadding: (horizontal: 20, vertical: 0),
                )
            }
        }
        .padding(.vertical, 12)
    }
}

private struct CoverTileView: View {
    let book: StorytellerWidgetBookSnapshot
    let cornerRadius: CGFloat
    var preferSquare: Bool = false
    var progressStyle: StorytellerWidgetProgressStyle = .line
    var showPin: Bool = false

    var body: some View {
        CoverArtView(book: book, cornerRadius: cornerRadius, preferSquare: preferSquare)
            .coverProgressOverlays(book: book, style: progressStyle)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(alignment: .topTrailing) {
                if showPin {
                    PinBadgeView()
                }
            }
    }
}

private struct PinBadgeView: View {
    var body: some View {
        Image(systemName: "pin.fill")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .padding(4)
            .background(.black.opacity(0.6), in: Circle())
            .padding(4)
    }
}

extension View {
    fileprivate func coverProgressOverlays(
        book: StorytellerWidgetBookSnapshot,
        style: StorytellerWidgetProgressStyle,
    ) -> some View {
        overlay(alignment: .bottom) {
            if style == .line, book.progress > 0 {
                CoverLineProgressView(progress: book.progress)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if book.progress > 0 {
                switch style {
                    case .circle:
                        CoverCircleProgressView(progress: book.progress)
                    case .text:
                        CoverPercentTextView(percent: book.percentComplete)
                    case .line, .off:
                        EmptyView()
                }
            }
        }
    }
}

private struct CoverLineProgressView: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(.black.opacity(0.45))
                Rectangle()
                    .fill(WidgetPalette.progress)
                    .frame(width: max(3, proxy.size.width * progress))
            }
        }
        .frame(height: 4)
    }
}

private struct CoverCircleProgressView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle().fill(.black.opacity(0.55))
            Circle()
                .stroke(.white.opacity(0.25), lineWidth: 2.5)
                .padding(3.5)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    WidgetPalette.progress,
                    style: StrokeStyle(lineWidth: 2.5, lineCap: .round),
                )
                .rotationEffect(.degrees(-90))
                .padding(3.5)
        }
        .frame(width: 24, height: 24)
        .padding(5)
    }
}

private struct CoverPercentTextView: View {
    let percent: Int

    var body: some View {
        Text("\(percent)%")
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(.black.opacity(0.65), in: Capsule())
            .padding(5)
    }
}

private enum WidgetCoverLoader {
    static func image(for book: StorytellerWidgetBookSnapshot, preferSquare: Bool) -> Image? {
        let filename =
            preferSquare
            ? (book.audioCoverFilename ?? book.coverFilename)
            : (book.coverFilename ?? book.audioCoverFilename)
        guard let filename,
            let url = StorytellerWidgetSnapshotStore.coverURL(for: filename)
        else {
            return nil
        }
        #if canImport(UIKit)
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        return Image(uiImage: image)
        #elseif canImport(AppKit)
        // Path-based init derives a bogus ImageIO type hint from the .dat
        // extension; data-based init sniffs the actual format.
        guard let data = try? Data(contentsOf: url),
            let image = NSImage(data: data)
        else { return nil }
        return Image(nsImage: image)
        #else
        return nil
        #endif
    }
}

private struct CoverArtView: View {
    let book: StorytellerWidgetBookSnapshot
    let cornerRadius: CGFloat
    var preferSquare: Bool = false

    private var isSquare: Bool {
        if preferSquare {
            return book.audioCoverFilename != nil || book.coverFilename == nil
        }
        return book.coverFilename == nil && book.audioCoverFilename != nil
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(WidgetPalette.coverFallback)
                if let image = WidgetCoverLoader.image(for: book, preferSquare: preferSquare) {
                    CoverImageView(image: image)
                } else {
                    Image(
                        systemName: book.readingKind == .audiobook
                            ? "headphones" : "book.closed.fill"
                    )
                    .font(
                        .system(
                            size: min(proxy.size.width, proxy.size.height) * 0.24,
                            weight: .semibold,
                        )
                    )
                    .foregroundStyle(WidgetPalette.primaryText.opacity(0.72))
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(.white.opacity(0.10), lineWidth: 1)
            }
        }
        .aspectRatio(isSquare ? 1 : WidgetMetrics.coverAspect, contentMode: .fit)
    }
}

private struct ProgressStripView: View {
    let book: StorytellerWidgetBookSnapshot

    var body: some View {
        HStack(spacing: 10) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(WidgetPalette.primaryText.opacity(0.12))
                    Capsule()
                        .fill(WidgetPalette.progress)
                        .frame(width: max(6, proxy.size.width * book.progress))
                }
            }
            .frame(height: 6)

            Text("\(book.percentComplete)%")
                .font(.system(size: FocusedTypography.percent, weight: .medium, design: .rounded))
                .foregroundStyle(WidgetPalette.primaryText)
                .monospacedDigit()
                .frame(minWidth: FocusedTypography.percentMinWidth, alignment: .trailing)
        }
    }
}

private struct AccessoryCircularReadingView: View {
    let book: StorytellerWidgetBookSnapshot?

    var body: some View {
        if let book {
            Gauge(value: book.progress) {
                Image(systemName: "book.closed.fill")
            } currentValueLabel: {
                Text("\(book.percentComplete)")
            }
            .gaugeStyle(.accessoryCircular)
            .widgetURL(book.widgetURL)
        } else {
            Image(systemName: "book.closed")
        }
    }
}

private struct AccessoryRectangularReadingView: View {
    let book: StorytellerWidgetBookSnapshot?

    var body: some View {
        if let book {
            VStack(alignment: .leading, spacing: 3) {
                Text(book.title)
                    .font(.headline)
                    .lineLimit(1)
                Text("\(book.percentComplete)%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ProgressView(value: book.progress)
            }
            .widgetURL(book.widgetURL)
        } else {
            Text("Storyteller")
        }
    }
}

private struct AccessoryInlineReadingView: View {
    let book: StorytellerWidgetBookSnapshot?

    var body: some View {
        if let book {
            Text("\(book.title) \(book.percentComplete)%")
                .widgetURL(book.widgetURL)
        } else {
            Text("Storyteller")
        }
    }
}

private struct EmptyReadingWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "book.closed")
                .font(.title2)
                .foregroundStyle(WidgetPalette.secondaryText)
            Text("No books yet")
                .font(.headline)
                .foregroundStyle(WidgetPalette.primaryText)
            Text("Add a book in Storyteller to see it here.")
                .font(.caption)
                .foregroundStyle(WidgetPalette.secondaryText)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(18)
    }
}

private enum WidgetMetrics {
    static let coverAspect: CGFloat = 2.0 / 3.0
}

private enum WidgetPalette {
    static let background = LinearGradient(
        colors: [
            adaptiveColor(
                light: (red: 0.97, green: 0.97, blue: 0.98),
                dark: (red: 0.12, green: 0.12, blue: 0.13),
            ),
            adaptiveColor(
                light: (red: 0.91, green: 0.91, blue: 0.93),
                dark: (red: 0.16, green: 0.16, blue: 0.17),
            ),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing,
    )
    static let coverFallback = adaptiveColor(
        light: (red: 0.82, green: 0.83, blue: 0.86),
        dark: (red: 0.22, green: 0.23, blue: 0.25),
    )
    static let progress = Color.accentColor
    static let primaryText = Color.primary
    static let secondaryText = Color.secondary

    private static func adaptiveColor(
        light: (red: CGFloat, green: CGFloat, blue: CGFloat),
        dark: (red: CGFloat, green: CGFloat, blue: CGFloat),
    ) -> Color {
        #if canImport(UIKit)
        Color(
            uiColor: UIColor { traits in
                let value = traits.userInterfaceStyle == .dark ? dark : light
                return UIColor(red: value.red, green: value.green, blue: value.blue, alpha: 1)
            }
        )
        #elseif canImport(AppKit)
        Color(
            nsColor: NSColor(name: nil) { appearance in
                let bestMatch = appearance.bestMatch(from: [.darkAqua, .aqua])
                let value = bestMatch == .darkAqua ? dark : light
                return NSColor(red: value.red, green: value.green, blue: value.blue, alpha: 1)
            }
        )
        #else
        Color(red: light.red, green: light.green, blue: light.blue)
        #endif
    }
}

private struct OptionalLink<Content: View>: View {
    let destination: URL?
    let content: Content

    init(destination: URL?, @ViewBuilder content: () -> Content) {
        self.destination = destination
        self.content = content()
    }

    var body: some View {
        if let destination {
            Link(destination: destination) {
                content
            }
        } else {
            content
        }
    }
}

extension StorytellerWidgetBookSnapshot {
    fileprivate var widgetURL: URL? { StorytellerBookLink.url(for: bookID) }
}
