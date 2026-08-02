#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

private struct BookDetailPaletteKey: EnvironmentKey {
    static let defaultValue: CoverDerivedPalette? = nil
}

extension EnvironmentValues {
    var bookDetailPalette: CoverDerivedPalette? {
        get { self[BookDetailPaletteKey.self] }
        set { self[BookDetailPaletteKey.self] = newValue }
    }
}

struct BookDetailHeroColors {
    let primary: Color
    let secondary: Color
    let controlFill: Color

    static func resolved(for colorScheme: ColorScheme) -> BookDetailHeroColors {
        if colorScheme == .light {
            return BookDetailHeroColors(
                primary: .black.opacity(0.86),
                secondary: .black.opacity(0.58),
                controlFill: .black.opacity(0.1),
            )
        }
        return BookDetailHeroColors(
            primary: .white,
            secondary: .white.opacity(0.62),
            controlFill: .white.opacity(0.1),
        )
    }
}

private struct BookDetailHeroColorsKey: EnvironmentKey {
    static let defaultValue = BookDetailHeroColors.resolved(for: .dark)
}

extension EnvironmentValues {
    var bookDetailHeroColors: BookDetailHeroColors {
        get { self[BookDetailHeroColorsKey.self] }
        set { self[BookDetailHeroColorsKey.self] = newValue }
    }
}

/// Shared presentation pieces for the full-screen iOS book details and the compact macOS
/// inspector. Media actions deliberately stay in their platform-specific views.
struct BookDetailCard<Content: View>: View {
    let title: String
    let systemImage: String
    private let content: Content
    @Environment(\.bookDetailPalette) private var palette

    init(
        _ title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content,
    ) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(.secondary)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(cardBackground)
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(palette?.cardBorder ?? Color.primary.opacity(0.06))
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var cardBackground: Color {
        if let palette {
            palette.cardBackground
        } else {
            #if os(iOS)
            Color(uiColor: .secondarySystemGroupedBackground)
            #else
            Color(nsColor: .controlBackgroundColor)
            #endif
        }
    }
}

enum BookDetailDisclosureSection: String {
    case description
    case relatedSeries
    case relatedAuthor
    case bookInfo
    case mediaInfo
    case syncHistory
    case alignmentReport

    var storageKey: String {
        "bookDetails.section.\(rawValue).expanded"
    }
}

struct BookDetailCreatorSummary: View {
    let authors: [String]
    let narrators: [String]
    var labelColor: Color = .secondary
    var nameColor: Color = .primary
    @State private var authorsExpanded = false
    @State private var narratorsExpanded = false

    var body: some View {
        if !authors.isEmpty || !narrators.isEmpty {
            VStack(spacing: 2) {
                creatorLine(
                    label: "Written by ",
                    names: authors,
                    isExpanded: $authorsExpanded,
                    role: "authors",
                    target: MetadataLinkTarget.author,
                )
                creatorLine(
                    label: "Narrated by ",
                    names: narrators,
                    isExpanded: $narratorsExpanded,
                    role: "narrators",
                    target: MetadataLinkTarget.narrator,
                )
            }
            .font(.callout)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func creatorLine(
        label: String,
        names: [String],
        isExpanded: Binding<Bool>,
        role: String,
        target: @escaping (String) -> MetadataLinkTarget,
    ) -> some View {
        if !names.isEmpty {
            BookMetadataLinkRun(
                values: isExpanded.wrappedValue ? names : Array(names.prefix(2)),
                target: target,
                prefix: label,
                prefixColor: labelColor,
                valueColor: nameColor,
            )
            .padding(.trailing, shouldShowDisclosure(for: names) ? 18 : 0)
                .overlay(alignment: .topTrailing) {
                    if shouldShowDisclosure(for: names) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                isExpanded.wrappedValue.toggle()
                            }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.caption.weight(.semibold))
                                .rotationEffect(.degrees(isExpanded.wrappedValue ? 180 : 0))
                                .frame(width: 16, height: 20)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(
                            isExpanded.wrappedValue ? "Collapse \(role)" : "Expand \(role)"
                        )
                    }
                }
        }
    }

    private func shouldShowDisclosure(for names: [String]) -> Bool {
        names.count > 2
    }
}

struct BookDetailHeroBackground: View {
    let item: BookMetadata
    @Binding var palette: CoverDerivedPalette
    let surfaceColor: Color
    let contentBackground: Color
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var coverCGImage: CGImage? {
        mediaViewModel.coverState(for: item, variant: .standard).cgImage
            ?? mediaViewModel.coverState(for: item, variant: .audioSquare).cgImage
    }

    private var coverIdentity: ObjectIdentifier? {
        coverCGImage.map(ObjectIdentifier.init)
    }

    private var colorfulnessKey: String {
        let library = mediaViewModel.cachedConfig.library
        return "\(library.colorMode)-\(library.colorIntensity)"
    }

    var body: some View {
        surfaceColor
            .overlay {
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.68),
                        .init(color: contentBackground.opacity(0.32), location: 0.84),
                        .init(color: contentBackground, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom,
                )
            }
            .onChange(of: coverIdentity, initial: true) { _, _ in
                updatePalette()
            }
            .onChange(of: colorfulnessKey) { _, _ in
                updatePalette()
            }
    }

    private func updatePalette() {
        guard let coverCGImage, let derived = CoverDerivedPalette.make(from: coverCGImage)
        else { return }
        palette = derived.adjusted(for: mediaViewModel.cachedConfig.library)
    }
}

#if os(iOS)
struct iOSBookDetailCompactMediaControls: View {
    let item: BookMetadata
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var options: [MediaDownloadOption] {
        MediaGridViewUtilities.mediaDownloadOptions(for: item)
    }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options) { option in
                CompactMediaButton(item: item, option: option)
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }
}

private struct CompactMediaButton: View {
    let item: BookMetadata
    let option: MediaDownloadOption
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var showConnectionAlert = false
    @Environment(\.bookDetailHeroColors) private var heroColors
    @Environment(\.bookDetailPalette) private var palette

    private var brightForeground: Color {
        palette?.brightAccent ?? heroColors.primary
    }

    private var mutedForeground: Color {
        palette?.mutedAccent ?? heroColors.primary.opacity(0.55)
    }

    private var isDownloaded: Bool {
        mediaViewModel.isCategoryDownloaded(option.category, for: item)
    }

    private var isDownloading: Bool {
        mediaViewModel.isCategoryDownloadInProgress(for: item, category: option.category)
    }

    private var isFailed: Bool {
        !isDownloading
            && mediaViewModel.isCategoryDownloadFailed(for: item, category: option.category)
    }

    var body: some View {
        Group {
            if isDownloaded {
                Button {
                    PlayerPresenter.shared.present(playerData)
                } label: {
                    buttonContent
                }
                .buttonStyle(.plain)
            } else {
                Button(action: performAction) { buttonContent }
                    .buttonStyle(.plain)
            }
        }
        .contextMenu {
            if isDownloaded && mediaViewModel.hasCachedMedia(option.category, for: item) {
                Button(role: .destructive) {
                    mediaViewModel.deleteDownload(for: item, category: option.category)
                } label: {
                    Label("Delete Download", systemImage: "trash")
                }
            }
        }
        .alert("Connection Error", isPresented: $showConnectionAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Cannot download while disconnected from the server.")
        }
    }

    private var buttonContent: some View {
        HStack(spacing: 6) {
            icon

            Text(option.title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .foregroundStyle(
            isDownloaded || isDownloading ? brightForeground : mutedForeground
        )
        .frame(maxWidth: .infinity)
        .frame(height: 38)
        .padding(.horizontal, 8)
        .background {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(palette?.accentBackground ?? heroColors.controlFill)
        }
        .contentShape(Rectangle())
        .accessibilityLabel(actionLabel)
    }

    @ViewBuilder
    private var icon: some View {
        if isDownloading {
            if let progress = mediaViewModel.downloadProgressFraction(
                for: item,
                category: option.category,
            ) {
                ZStack {
                    Circle().stroke(brightForeground.opacity(0.25), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            brightForeground,
                            style: StrokeStyle(lineWidth: 2, lineCap: .round),
                        )
                        .rotationEffect(.degrees(-90))
                    Image(systemName: "xmark")
                        .font(.system(size: 7, weight: .bold))
                }
                .frame(width: 18, height: 18)
            } else {
                ZStack {
                    ProgressView()
                        .tint(brightForeground)
                        .environment(\.colorScheme, .dark)
                    Image(systemName: "xmark")
                        .font(.system(size: 7, weight: .bold))
                }
            }
        } else if isFailed {
            Image(systemName: "arrow.clockwise")
        } else if isDownloaded {
            Image(systemName: "play.fill")
        } else {
            Image(systemName: "arrow.down")
        }
    }

    private var actionLabel: String {
        if isDownloading { return "Cancel \(option.downloadTitle)" }
        if isFailed { return "Retry \(option.downloadTitle)" }
        if isDownloaded { return option.openTitle }
        return option.downloadTitle
    }

    private func performAction() {
        if isDownloading {
            mediaViewModel.cancelDownload(for: item, category: option.category)
        } else if mediaViewModel.hasConnectionError(forSourceID: item.sourceID) {
            showConnectionAlert = true
        } else {
            mediaViewModel.startDownload(for: item, category: option.category)
        }
    }

    private var playerData: PlayerBookData {
        let fresh = mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
        let variant: MediaViewModel.CoverVariant =
            fresh.hasAvailableAudiobook ? .audioSquare : .standard
        return PlayerBookData(
            metadata: fresh,
            localMediaPath: mediaViewModel.localMediaPath(for: item.id, category: option.category),
            category: option.category,
            coverArt: mediaViewModel.coverImage(for: fresh, variant: variant),
            ebookCoverArt: fresh.hasAvailableAudiobook
                ? mediaViewModel.coverImage(for: fresh, variant: .standard) : nil,
        )
    }
}
#endif

struct BookDetailRelatedShelf: View {
    let title: String
    let systemImage: String
    let section: BookDetailDisclosureSection
    let books: [BookMetadata]
    let onSelect: (BookMetadata) -> Void
    var seriesName: String? = nil

    var body: some View {
        BookDetailDisclosureCard(title, systemImage: systemImage, section: section) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(books) { book in
                        Button {
                            onSelect(book)
                        } label: {
                            RelatedBookThumbnail(
                                book: book,
                                seriesPositionBadge: seriesPositionBadge(for: book),
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func seriesPositionBadge(for book: BookMetadata) -> String? {
        guard let seriesName else { return nil }
        let normalized = seriesName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard
            let position = book.series?.first(where: {
                $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized
            })?.formattedPosition
        else { return nil }
        return position.hasPrefix("#") ? position : "#\(position)"
    }
}

struct BookDetailTagDisclosure: View {
    let tags: [String]
    @State private var isExpanded = false
    @Environment(\.bookDetailHeroColors) private var heroColors

    private var uniqueTags: [String] {
        var seen: Set<String> = []
        return tags.filter { seen.insert($0).inserted }
    }

    private var visibleTags: [String] {
        isExpanded ? uniqueTags : Array(uniqueTags.prefix(3))
    }

    var body: some View {
        VStack(spacing: 7) {
            BookDetailTagFlowLayout(spacing: 5) {
                ForEach(visibleTags, id: \.self) { tag in
                    BookMetadataLink(target: .tag(tag)) {
                        Text(tag)
                            .font(.caption)
                            .lineLimit(1)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(heroColors.controlFill, in: Capsule())
                    }
                }
            }

            if uniqueTags.count > 3 {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExpanded ? "Show less" : "\(uniqueTags.count - 3) more")
                        Image(systemName: "chevron.down")
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .font(.caption)
                    .foregroundStyle(heroColors.primary.opacity(0.82))
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(heroColors.primary)
        .onChange(of: tags) { _, _ in isExpanded = false }
    }
}

private struct BookDetailTagFlowLayout: Layout {
    private struct Element {
        let index: Int
        let size: CGSize
    }

    private struct Row {
        var elements: [Element] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    let spacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache _: inout (),
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = makeRows(maxWidth: maxWidth, subviews: subviews)
        let measuredWidth = rows.map(\.width).max() ?? 0
        let measuredHeight =
            rows.map(\.height).reduce(0, +)
            + spacing * CGFloat(max(rows.count - 1, 0))

        return CGSize(
            width: maxWidth.isFinite ? maxWidth : measuredWidth,
            height: measuredHeight,
        )
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal _: ProposedViewSize,
        subviews: Subviews,
        cache _: inout (),
    ) {
        let rows = makeRows(maxWidth: bounds.width, subviews: subviews)
        var currentY = bounds.minY

        for row in rows {
            var currentX = bounds.midX - row.width / 2
            for element in row.elements {
                subviews[element.index].place(
                    at: CGPoint(x: currentX, y: currentY),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(element.size),
                )
                currentX += element.size.width + spacing
            }
            currentY += row.height + spacing
        }
    }

    private func makeRows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()

        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let proposedWidth = row.elements.isEmpty ? size.width : row.width + spacing + size.width
            if !row.elements.isEmpty, proposedWidth > maxWidth {
                rows.append(row)
                row = Row()
            }

            row.elements.append(Element(index: index, size: size))
            row.width = row.elements.count == 1 ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
        }

        if !row.elements.isEmpty { rows.append(row) }
        return rows
    }
}

private struct RelatedBookThumbnail: View {
    let book: BookMetadata
    let seriesPositionBadge: String?
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var variant: MediaViewModel.CoverVariant { mediaViewModel.coverVariant(for: book) }
    private var artworkHeight: CGFloat { variant == .standard ? 105 : 70 }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            RoundedCoverArtwork(
                image: mediaViewModel.coverImage(for: book, variant: variant),
                placeholderColor: .secondary.opacity(0.18),
                variant: variant,
                cornerRadius: 5,
            )
            .frame(width: 70, height: artworkHeight)
            .overlay(alignment: .topLeading) {
                if let seriesPositionBadge {
                    Text(seriesPositionBadge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 4))
                        .padding(3)
                }
            }
            .frame(height: 105, alignment: .top)

            Text(book.title)
                .font(.caption)
                .lineLimit(2)
                .frame(width: 70, alignment: .leading)
        }
        .task(id: book.id) {
            mediaViewModel.ensureCoverLoaded(
                for: book,
                variant: variant,
                debugSource: "bookDetailsRelated",
            )
        }
    }
}

struct BookDetailMediaInfoRows: View {
    let item: BookMetadata

    private struct Row: Identifiable {
        let title: String
        let icon: String
        let summary: String
        var id: String { title }
    }

    private var rows: [Row] {
        [
            Row(title: "Ebook", icon: "book.fill", summary: ebookSummary),
            Row(title: "Audiobook", icon: "headphones", summary: audiobookSummary),
            Row(title: "Readaloud", icon: "waveform", summary: readaloudSummary),
        ]
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 { Divider().padding(.leading, 30) }
                HStack(spacing: 10) {
                    Image(systemName: row.icon)
                        .foregroundStyle(.secondary)
                        .frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).font(.callout.weight(.medium))
                        Text(row.summary).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 8)
            }
        }
    }

    private var ebookSummary: String {
        guard let asset = item.ebook else { return "Not available" }
        var parts: [String] = []
        let format = URL(fileURLWithPath: asset.filepath).pathExtension.uppercased()
        if !format.isEmpty { parts.append(format) }
        if let pages = asset.pageCount, pages > 0 { parts.append("\(pages) pages") }
        if let size = asset.fileSize, size > 0 {
            parts.append(BookMetadata.formatFileSize(bytes: size))
        }
        return parts.isEmpty ? "Available" : parts.joined(separator: " • ")
    }

    private var audiobookSummary: String {
        guard let asset = item.audiobook else { return "Not available" }
        var parts: [String] = []
        if let duration = asset.duration, duration > 0 {
            parts.append(BookMetadata.formatDuration(seconds: Int(duration.rounded())))
        }
        if let size = asset.fileSize, size > 0 {
            parts.append(BookMetadata.formatFileSize(bytes: size))
        }
        return parts.isEmpty ? "Available" : parts.joined(separator: " • ")
    }

    private var readaloudSummary: String {
        guard let asset = item.readaloud else { return "Not available" }
        var parts: [String] = []
        if let status = asset.status, !status.isEmpty { parts.append(status.capitalized) }
        if let pages = asset.pageCount, pages > 0 { parts.append("\(pages) pages") }
        if let duration = asset.duration, duration > 0 {
            parts.append(BookMetadata.formatDuration(seconds: Int(duration.rounded())))
        }
        if let size = asset.fileSize, size > 0 {
            parts.append(BookMetadata.formatFileSize(bytes: size))
        }
        return parts.isEmpty ? "Available" : parts.joined(separator: " • ")
    }
}

struct BookDetailDisclosureCard<Content: View>: View {
    let title: String
    let systemImage: String
    private let content: Content
    @AppStorage private var isExpanded: Bool
    @Environment(\.bookDetailPalette) private var palette

    init(
        _ title: String,
        systemImage: String,
        section: BookDetailDisclosureSection,
        isExpanded: Bool = true,
        @ViewBuilder content: () -> Content,
    ) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
        _isExpanded = AppStorage(wrappedValue: isExpanded, section.storageKey)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isExpanded ? 12 : 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Label(title, systemImage: systemImage)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .rotationEffect(.degrees(isExpanded ? 0 : -90))
                }
                .font(.headline)
                .foregroundStyle(.secondary)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(isExpanded ? "Collapse" : "Expand") \(title)")

            if isExpanded {
                content
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(cardBackground)
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(palette?.cardBorder ?? Color.primary.opacity(0.06))
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var cardBackground: Color {
        if let palette {
            palette.cardBackground
        } else {
            #if os(iOS)
            Color(uiColor: .secondarySystemGroupedBackground)
            #else
            Color(nsColor: .controlBackgroundColor)
            #endif
        }
    }
}

struct BookDetailCoverArtwork: View {
    let item: BookMetadata
    let height: CGFloat
    var cornerRadius: CGFloat = 12
    var progress: Double? = nil
    var progressBackgroundColor: Color = .black.opacity(0.78)

    @Environment(MediaViewModel.self) private var mediaViewModel
    @AppStorage("showEbookCoverInAudioView") private var showEbookCover = false

    private var audioCover: Image? {
        mediaViewModel.coverImage(for: item, variant: .audioSquare)
    }

    private var ebookCover: Image? {
        mediaViewModel.coverImage(for: item, variant: .standard)
    }

    private var canToggleCover: Bool {
        audioCover != nil && ebookCover != nil
    }

    private var displayedVariant: MediaViewModel.CoverVariant {
        if showEbookCover {
            return ebookCover != nil || audioCover == nil ? .standard : .audioSquare
        }
        return audioCover != nil || ebookCover == nil ? .audioSquare : .standard
    }

    private var displayedImage: Image? {
        switch displayedVariant {
            case .standard: ebookCover
            case .audioSquare: audioCover
        }
    }

    var body: some View {
        RoundedCoverArtwork(
            image: displayedImage,
            placeholderColor: Color.secondary.opacity(0.15),
            variant: displayedVariant,
            cornerRadius: cornerRadius,
            progress: progress,
            progressBackgroundColor: progressBackgroundColor,
        )
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .shadow(color: .black.opacity(0.18), radius: 10, y: 5)
        .contentShape(Rectangle())
        .onTapGesture {
            guard canToggleCover else { return }
            withAnimation(.easeInOut(duration: 0.2)) {
                showEbookCover.toggle()
            }
        }
        .accessibilityLabel("Cover for \(item.title)")
        .accessibilityHint(canToggleCover ? "Double tap to switch cover artwork" : "")
        .task(id: item.id) {
            mediaViewModel.ensureCoverLoaded(for: item, variant: .standard)
            if item.hasAvailableAudiobook {
                mediaViewModel.ensureCoverLoaded(for: item, variant: .audioSquare)
            }
        }
    }
}

struct BookDetailRatingView: View {
    let rating: Double?
    @Environment(\.bookDetailPalette) private var palette
    @Environment(\.colorScheme) private var colorScheme

    private var fillColor: Color {
        palette?.ratingAccent(for: colorScheme) ?? .yellow
    }

    var body: some View {
        RatingStarStrip(
            value: rating,
            starSize: 13,
            spacing: 3,
            fillColor: fillColor,
            emptyColor: fillColor.opacity(0.3),
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rating.map { "Rating, \($0.formatted()) out of 5" } ?? "Not rated")
    }
}

struct BookDetailMetadataCard: View {
    let item: BookMetadata
    var showsTags = true
    var showsAggregateMediaValues = true

    var body: some View {
        BookDetailCard("Book Details", systemImage: "info.circle") {
            BookDetailMetadataRows(
                item: item,
                showsTags: showsTags,
                showsAggregateMediaValues: showsAggregateMediaValues,
            )
        }
    }
}

struct BookDetailMetadataRows: View {
    let item: BookMetadata
    var showsTags = true
    var showsAggregateMediaValues = true
    var showsCollections = true
    var inlineEdit: InlineMetadataEditModel? = nil
    var onEditPublished: (() -> Void)? = nil
    var onEditIdentifiers: (() -> Void)? = nil

    #if os(macOS)
    @State private var isHoveringPublished = false
    @State private var isHoveringIdentifiers = false
    #endif

    private enum Row: Identifiable {
        case plain(label: String, value: String)
        case linked(label: String, values: [String], target: (String) -> MetadataLinkTarget)
        case published(String?)

        var id: String {
            switch self {
                case .plain(let label, _): return label
                case .linked(let label, _, _): return label
                case .published: return "Published"
            }
        }
    }

    private var rows: [Row] {
        var result: [Row] = []

        func append(_ label: String, _ value: String?) {
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                !value.isEmpty
            else { return }
            result.append(.plain(label: label, value: value))
        }

        func appendLinked(
            _ label: String,
            _ values: [String]?,
            _ target: @escaping (String) -> MetadataLinkTarget,
        ) {
            let cleaned =
                (values ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            guard !cleaned.isEmpty else { return }
            result.append(.linked(label: label, values: cleaned, target: target))
        }

        append("Language", item.language)
        let published = StorytellerDate.full(item.publicationDateValue)
        if !published.isEmpty || publishedIsEditable {
            result.append(.published(published.isEmpty ? nil : published))
        }
        if showsAggregateMediaValues {
            append("Pages", item.pagesDisplay)
            append("Duration", item.durationDisplay)
            append("Size", item.fileSizeDisplay)
        }
        if showsTags {
            appendLinked("Tags", item.tags?.map(\.name), MetadataLinkTarget.tag)
        }
        if showsCollections {
            appendLinked(
                "Collections",
                item.collections?.map(\.name),
                MetadataLinkTarget.collection,
            )
        }
        append("Added", StorytellerDate.dateTimeWithZone(item.createdAtValue))
        append(
            "Updated",
            StorytellerDate.dateTimeWithZone(
                StorytellerDate.parse(item.updatedAt, field: .updatedAt, context: item.title)
            ),
        )

        return result
    }

    private var publishedIsEditable: Bool {
        onEditPublished != nil || inlineEdit?.isEditing == true
    }

    private var publicationYear: String {
        item.sortablePublicationYear
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 {
                    Divider()
                        .padding(.leading, 112)
                }

                switch row {
                    case .plain(let label, let value):
                        plainRow(label: label, value: value)
                    case .linked(let label, let values, let target):
                        linkedRow(label: label, values: values, target: target)
                    case .published(let value):
                        publishedRow(value: value)
                }
            }

            if !item.displayIdentifiers.isEmpty || onEditIdentifiers != nil {
                if !rows.isEmpty {
                    Divider()
                        .padding(.leading, 112)
                }
                identifiersRow
            }
        }
    }

    @ViewBuilder
    private var identifiersRow: some View {
        let display = LabeledContent("Identifiers") {
            HStack(spacing: 6) {
                if item.displayIdentifiers.isEmpty {
                    Text("Not set")
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .trailing, spacing: 3) {
                        ForEach(item.displayIdentifiers, id: \.self) { entry in
                            BookDetailIdentifierValue(entry: entry)
                        }
                    }
                }
                #if os(macOS)
                if let onEditIdentifiers {
                    Button(action: onEditIdentifiers) {
                        Image(systemName: "pencil")
                            .font(.caption.weight(.semibold))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .opacity(isHoveringIdentifiers ? 1 : 0)
                    .help("Edit identifiers")
                    .accessibilityLabel("Edit identifiers")
                }
                #endif
            }
        }
        .foregroundStyle(.secondary)
        .padding(.vertical, 7)

        #if os(macOS)
        display.onHover { isHoveringIdentifiers = $0 }
        #else
        display
        #endif
    }

    private func plainRow(label: String, value: String) -> some View {
        LabeledContent(label) {
            Text(value)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .foregroundStyle(.secondary)
        .padding(.vertical, 7)
    }

    private func linkedRow(
        label: String,
        values: [String],
        target: @escaping (String) -> MetadataLinkTarget,
    ) -> some View {
        LabeledContent(label) {
            BookMetadataLinkRun(
                values: values,
                target: target,
                valueColor: .primary,
                alignment: .trailing,
            )
        }
        .foregroundStyle(.secondary)
        .padding(.vertical, 7)
    }

    @ViewBuilder
    private func publishedRow(value: String?) -> some View {
        if let inlineEdit, inlineEdit.showsEditor(for: .publicationDate) {
            InlineMetadataFieldRow(
                model: inlineEdit,
                field: .publicationDate,
                placeholder: "Year or yyyy-mm-dd",
                label: "Published",
                autofocus: inlineEdit.activeField == .publicationDate,
            )
            .padding(.vertical, 7)
        } else {
            let display = LabeledContent("Published") {
                HStack(spacing: 6) {
                    if let value, !publicationYear.isEmpty {
                        BookMetadataLink(target: .publicationYear(publicationYear)) {
                            Text(value)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.trailing)
                        }
                    } else {
                        Text(value ?? "Not set")
                            .foregroundStyle(value == nil ? .secondary : .primary)
                            .multilineTextAlignment(.trailing)
                            .textSelection(.enabled)
                    }
                    #if os(macOS)
                    if let onEditPublished {
                        Button(action: onEditPublished) {
                            Image(systemName: "pencil")
                                .font(.caption.weight(.semibold))
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .opacity(isHoveringPublished ? 1 : 0)
                        .help("Edit publication date")
                        .accessibilityLabel("Edit publication date")
                    }
                    #endif
                }
            }
            .foregroundStyle(.secondary)
            .padding(.vertical, 7)
            #if os(macOS)
            display.onHover { isHoveringPublished = $0 }
            #else
            display
            #endif
        }
    }
}

private struct BookDetailIdentifierValue: View {
    let entry: BookDisplayIdentifier

    private var label: String {
        "\(entry.identifier.displayName): \(entry.identifier.value)"
    }

    var body: some View {
        if let url = entry.url {
            Link(destination: url) { content }
        } else {
            content
                .foregroundStyle(.primary)
                .textSelection(.enabled)
        }
    }

    private var content: some View {
        HStack(spacing: 3) {
            if entry.identifier.kind == "isbn-13" {
                Image(systemName: entry.audiobookScoped ? "headphones" : "book")
                    .font(.caption)
            }
            Text(label)
                .multilineTextAlignment(.trailing)
            if entry.url != nil {
                Image(systemName: "arrow.up.right.square")
                    .font(.caption)
            }
        }
    }
}

#endif
