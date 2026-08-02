#if os(iOS) || os(macOS)
import SwiftUI

#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

struct MediaGridInfoSidebar: View {
    let item: BookMetadata
    let mediaKind: MediaKind?
    let onClose: () -> Void
    let onReadNow: () -> Void
    let onRename: () -> Void
    let onDelete: () -> Void
    let onSeriesSelected: ((String) -> Void)?
    let showsInspectorToolbar: Bool
    let roundsTopTrailingCorner: Bool
    let onRelatedItemChange: ((Bool) -> Void)?

    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif
    @State private var animatedProgress: Double = 0
    @State private var showingSyncHistory = false
    @State private var showingAlignmentReport = false
    @State private var showingIdentifierEditor = false
    @State private var attributedDescription: AttributedString? = nil
    @State private var descriptionTask: Task<Void, Never>? = nil
    @State private var isDescriptionExpanded = false
    @State private var isReviewExpanded = false
    @State private var isAuthorSummaryExpanded = false
    @State private var isNarratorSummaryExpanded = false
    @State private var relatedItemOverride: BookMetadata?
    @State private var coverPalette = CoverDerivedPalette.fallback()
    @State private var fallbackInlineEdit = InlineMetadataEditModel()
    @State private var personalRating = BookPersonalRatingModel()
    @State private var showingRatingEditor = false
    private let sharedInlineEdit: InlineMetadataEditModel?

    init(
        item: BookMetadata,
        mediaKind: MediaKind? = nil,
        onClose: @escaping () -> Void,
        onReadNow: @escaping () -> Void,
        onRename: @escaping () -> Void,
        onDelete: @escaping () -> Void,
        onSeriesSelected: ((String) -> Void)? = nil,
        showsInspectorToolbar: Bool = true,
        roundsTopTrailingCorner: Bool = false,
        onRelatedItemChange: ((Bool) -> Void)? = nil,
        inlineEditModel: InlineMetadataEditModel? = nil,
    ) {
        self.item = item
        self.mediaKind = mediaKind
        self.onClose = onClose
        self.onReadNow = onReadNow
        self.onRename = onRename
        self.onDelete = onDelete
        self.onSeriesSelected = onSeriesSelected
        self.showsInspectorToolbar = showsInspectorToolbar
        self.roundsTopTrailingCorner = roundsTopTrailingCorner
        self.onRelatedItemChange = onRelatedItemChange
        self.sharedInlineEdit = inlineEditModel
    }

    private var inlineEdit: InlineMetadataEditModel {
        sharedInlineEdit ?? fallbackInlineEdit
    }

    private var isServerBook: Bool {
        mediaViewModel.isServerBook(currentItem.id)
    }

    private var currentItem: BookMetadata {
        let requestedItem = relatedItemOverride ?? item
        return mediaViewModel.library.bookMetaData.first { $0.id == requestedItem.id }
            ?? requestedItem
    }

    private var resolvedPalette: CoverDerivedPalette {
        coverPalette.resolved(for: colorScheme)
    }

    private var heroColors: BookDetailHeroColors {
        BookDetailHeroColors.resolved(for: colorScheme)
    }

    var body: some View {
        Group {
            #if os(macOS)
            ScrollView {
                VStack(spacing: 0) {
                    macHeroSection
                    content
                }
                .background(MacBookDetailScrollViewConfiguration())
            }
            .id(currentItem.id)
            .background {
                resolvedPalette.contentBackground
            }
            #else
            ScrollView {
                VStack(spacing: 0) {
                    iosHeroSection
                    content
                }
            }
            .id(currentItem.id)
            .background(resolvedPalette.contentBackground)
            .ignoresSafeArea(edges: showsInspectorToolbar ? [] : .top)
            #endif
        }
        .environment(\.bookDetailPalette, resolvedPalette)
        .sheet(isPresented: $showingSyncHistory) {
            SyncHistorySheet(bookId: currentItem.id, bookTitle: currentItem.title)
        }
        .sheet(isPresented: $showingRatingEditor) {
            BookRatingEditorSheet(model: personalRating)
                .environment(\.bookDetailPalette, resolvedPalette)
        }
        .sheet(isPresented: $showingAlignmentReport) {
            BookAlignmentReportScreen(book: currentItem)
        }
        .sheet(isPresented: $showingIdentifierEditor) {
            IdentifierEditorSheet(book: currentItem)
        }
        .task(id: currentItem.id) {
            await personalRating.prepare(
                for: currentItem.id,
                isServerBook: mediaViewModel.isServerBook(currentItem.id),
            )
        }
        .onAppear {
            prepareForDisplay()
            loadDescription()
        }
        .onChange(of: item.id) { _, _ in
            relatedItemOverride = nil
        }
        .onChange(of: relatedItemOverride?.id) { _, newValue in
            onRelatedItemChange?(newValue != nil)
        }
        .onChange(of: currentItem.id) { _, _ in
            coverPalette = CoverDerivedPalette.fallback()
            isAuthorSummaryExpanded = false
            isNarratorSummaryExpanded = false
            isReviewExpanded = false
            inlineEdit.endEditMode()
            prepareForDisplay()
            loadDescription()
        }
        .onChange(of: currentItem.description) { _, _ in
            loadDescription()
        }
        .onChange(of: mediaViewModel.progress(for: currentItem.id)) { _, newValue in
            withAnimation(.easeOut(duration: 0.45)) {
                animatedProgress = newValue
            }
        }
    }

    @ViewBuilder
    private var heroRatingView: some View {
        if isServerBook {
            #if os(macOS)
            InlineMetadataHoverEdit(
                help: "Rate and review",
                action: { showingRatingEditor = true },
            ) {
                heroPersonalStars
            }
            #else
            HStack(spacing: 8) {
                heroPersonalStars
                Button {
                    showingRatingEditor = true
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(heroColors.secondary)
                .accessibilityLabel("Rate and review")
            }
            #endif
        } else {
            BookDetailRatingView(rating: currentItem.rating)
        }
    }

    private var heroPersonalStars: some View {
        let fill = resolvedPalette.ratingAccent(for: colorScheme)
        return ThemedRatingStars(
            value: personalRating.starRating,
            fillColor: fill,
            emptyColor: fill.opacity(0.3),
            resetToken: personalRating.saveGeneration,
        ) { value in
            Task { await personalRating.setStarRating(value) }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 18) {
            descriptionSection
            #if os(macOS)
            relatedBooksSections
            macBookInfoSection
            macMediaInfoSection
            macSyncHistorySection
            #else
            iosRelatedBooksSections
            iosBookInfoSection
            iosMediaInfoSection
            iosSyncHistorySection
            #endif
            alignmentReportSection
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 24)
    }

    #if os(macOS)
    private var macHeroSection: some View {
        ZStack {
            MacBookDetailHeroBackground(
                item: currentItem,
                palette: $coverPalette,
                surfaceColor: resolvedPalette.surface,
                contentBackground: resolvedPalette.contentBackground,
            )

            VStack(spacing: 13) {
                macInspectorToolbar
                inlineEditPermissionHint

                BookDetailCoverArtwork(
                    item: currentItem,
                    height: 165,
                    cornerRadius: 10,
                    progress: animatedProgress,
                    progressBackgroundColor: coverPalette.accentBackground,
                )
                .tint(coverPalette.accent)

                VStack(spacing: 5) {
                    if inlineEdit.showsEditor(for: .title) {
                        InlineMetadataFieldRow(
                            model: inlineEdit,
                            field: .title,
                            placeholder: "Title",
                            font: .title3.weight(.semibold),
                            autofocus: true,
                        )
                    } else {
                        hoverEditable(.title, help: "Edit title") {
                            Text(currentItem.title)
                                .font(.title3)
                                .fontWeight(.semibold)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                        }
                    }

                    if inlineEdit.showsEditor(for: .subtitle) {
                        InlineMetadataFieldRow(
                            model: inlineEdit,
                            field: .subtitle,
                            placeholder: "Subtitle",
                            font: .callout,
                            autofocus: true,
                        )
                    } else if let subtitle = currentItem.subtitle, !subtitle.isEmpty {
                        hoverEditable(.subtitle, help: "Edit subtitle") {
                            Text(subtitle)
                                .font(.callout)
                                .foregroundStyle(heroColors.secondary.opacity(0.84))
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                        }
                    }

                    macCreatorSummary
                    macSeriesSummary
                    heroRatingView
                        .padding(.top, 2)

                    if let mediaSummary = macHeroMediaSummary {
                        Text(mediaSummary)
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(heroColors.secondary)
                            .padding(.top, 2)
                    }
                }

                let options = MediaGridViewUtilities.mediaDownloadOptions(for: currentItem)
                if !options.isEmpty {
                    MacBookDetailMediaControls(item: currentItem, presentation: .hero)
                }

                if inlineEdit.showsEditor(for: .tags) {
                    InlineMetadataFieldRow(
                        model: inlineEdit,
                        field: .tags,
                        placeholder: "Comma-separated tags",
                        label: "Tags",
                        font: .caption,
                        autofocus: true,
                    )
                    .padding(.top, 2)
                } else {
                    let tags = currentItem.tagNames
                    if !tags.isEmpty {
                        hoverEditable(.tags, help: "Edit tags") {
                            MacBookDetailTagDisclosure(tags: tags)
                        }
                        .padding(.top, 2)
                    }
                }
            }
            .foregroundStyle(heroColors.primary)
            .padding(.horizontal, 16)
            .padding(.bottom, 18)
        }
        .frame(maxWidth: .infinity)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 16,
                topTrailingRadius: roundsTopTrailingCorner ? 16 : 0,
                style: .continuous,
            )
        )
        .background(Color(nsColor: .windowBackgroundColor))
        .environment(\.bookDetailHeroColors, heroColors)
    }

    private var macHeroMediaSummary: String? {
        var values: [String] = []
        if let pages = currentItem.pageCountValue, pages > 0 {
            values.append("\(pages) \(pages == 1 ? "page" : "pages")")
        }
        let duration = currentItem.durationDisplay
        if !duration.isEmpty {
            values.append(duration)
        }
        return values.isEmpty ? nil : values.joined(separator: " • ")
    }

    private var macInspectorToolbar: some View {
        HStack(spacing: 8) {
            if relatedItemOverride != nil {
                Button {
                    relatedItemOverride = nil
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to previous book")
            }

            Spacer()
            BookStatusSection(item: currentItem, presentation: .toolbarMenu)
                .tint(coverPalette.accent)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 24, height: 24)
                    .background(heroColors.controlFill, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close details")
        }
        .padding(.top, 10)
    }

    @ViewBuilder
    private var macCreatorSummary: some View {
        let authorNames = currentItem.authors?.compactMap(\.name) ?? []
        let narratorNames = currentItem.narrators?.compactMap(\.name) ?? []

        VStack(spacing: 2) {
            if inlineEdit.showsEditor(for: .authors) {
                InlineMetadataFieldRow(
                    model: inlineEdit,
                    field: .authors,
                    placeholder: "Comma-separated authors",
                    label: "Written by",
                    font: .callout,
                    autofocus: true,
                )
            } else if !authorNames.isEmpty {
                hoverEditable(.authors, help: "Edit authors") {
                    creatorLinkRun(
                        prefix: "Written by ",
                        names: authorNames,
                        isExpanded: isAuthorSummaryExpanded,
                        target: MetadataLinkTarget.author,
                    )
                    .padding(.trailing, shouldShowAuthorDisclosure ? 18 : 0)
                    .overlay(alignment: .topTrailing) {
                        if shouldShowAuthorDisclosure {
                            creatorDisclosureButton(
                                isExpanded: $isAuthorSummaryExpanded,
                                role: "authors",
                            )
                        }
                    }
                }
            }
            if inlineEdit.showsEditor(for: .narrators) {
                InlineMetadataFieldRow(
                    model: inlineEdit,
                    field: .narrators,
                    placeholder: "Comma-separated narrators",
                    label: "Narrated by",
                    font: .callout,
                    autofocus: true,
                )
            } else if !narratorNames.isEmpty {
                hoverEditable(.narrators, help: "Edit narrators") {
                    creatorLinkRun(
                        prefix: "Narrated by ",
                        names: narratorNames,
                        isExpanded: isNarratorSummaryExpanded,
                        target: MetadataLinkTarget.narrator,
                    )
                    .padding(.trailing, shouldShowNarratorDisclosure ? 18 : 0)
                    .overlay(alignment: .topTrailing) {
                        if shouldShowNarratorDisclosure {
                            creatorDisclosureButton(
                                isExpanded: $isNarratorSummaryExpanded,
                                role: "narrators",
                            )
                        }
                    }
                }
            }
        }
        .font(.callout)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Collapsed runs cap the name count; linked names wrap as separate views and cannot
    /// share one truncating line.
    private func creatorLinkRun(
        prefix: String,
        names: [String],
        isExpanded: Bool,
        target: @escaping (String) -> MetadataLinkTarget,
    ) -> some View {
        BookMetadataLinkRun(
            values: isExpanded ? names : Array(names.prefix(2)),
            target: target,
            prefix: prefix,
            prefixColor: heroColors.secondary,
            valueColor: heroColors.primary.opacity(0.88),
        )
    }

    private var shouldShowAuthorDisclosure: Bool {
        (currentItem.authors?.compactMap(\.name) ?? []).count > 2
    }

    private var shouldShowNarratorDisclosure: Bool {
        (currentItem.narrators?.compactMap(\.name) ?? []).count > 2
    }

    private func creatorDisclosureButton(
        isExpanded: Binding<Bool>,
        role: String,
    ) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.18)) {
                isExpanded.wrappedValue.toggle()
            }
        } label: {
            Image(systemName: "chevron.down")
                .font(.caption.weight(.semibold))
                .rotationEffect(.degrees(isExpanded.wrappedValue ? 180 : 0))
                .frame(width: 16, height: 20)
                .offset(y: -2)
        }
        .buttonStyle(.plain)
        .foregroundStyle(heroColors.secondary)
        .help(isExpanded.wrappedValue ? "Show fewer \(role)" : "Show all \(role)")
        .accessibilityLabel(isExpanded.wrappedValue ? "Collapse \(role)" : "Expand \(role)")
    }

    @ViewBuilder
    private var macSeriesSummary: some View {
        if inlineEdit.showsEditor(for: .series) {
            InlineMetadataSeriesRow(model: inlineEdit, autofocus: true)
        } else if let seriesList = currentItem.series, !seriesList.isEmpty {
            hoverEditable(.series, help: "Edit series") {
                VStack(spacing: 3) {
                    ForEach(seriesList, id: \.name) { series in
                        let label =
                            series.formattedPosition.map {
                                "\(series.name) • Book \($0)"
                            } ?? series.name

                        if let onSeriesSelected {
                            Button(label) {
                                onSeriesSelected(series.name)
                            }
                            .buttonStyle(.plain)
                        } else {
                            BookMetadataLink(target: .series(series.name)) {
                                Text(label)
                            }
                        }
                    }
                }
                .font(.callout)
                .foregroundStyle(heroColors.primary.opacity(0.86))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private func hoverEditable<C: View>(
        _ field: InlineMetadataField,
        help: String,
        @ViewBuilder content: @escaping () -> C,
    ) -> some View {
        if isServerBook {
            InlineMetadataHoverEdit(help: help, action: {
                Task {
                    await inlineEdit.beginFieldEdit(
                        field,
                        for: currentItem,
                        mediaViewModel: mediaViewModel,
                    )
                }
            }) {
                content()
            }
        } else {
            content()
        }
    }

    @ViewBuilder
    private var relatedBooksSections: some View {
        let series = relatedSeriesBooks
        if !series.isEmpty {
            MacBookDetailRelatedShelf(
                title: relatedSeriesTitle,
                systemImage: "books.vertical.fill",
                section: .relatedSeries,
                books: series,
                onSelect: { relatedItemOverride = $0 },
                seriesName: currentItem.series?.first?.name,
            )
        }

        let authors = relatedAuthorBooks
        if !authors.isEmpty {
            MacBookDetailRelatedShelf(
                title: relatedAuthorTitle,
                systemImage: "person.2.fill",
                section: .relatedAuthor,
                books: authors,
                onSelect: { relatedItemOverride = $0 },
            )
        }
    }

    private var macBookInfoSection: some View {
        BookDetailDisclosureCard("Book Info", systemImage: "info.circle", section: .bookInfo) {
            VStack(alignment: .leading, spacing: 8) {
                BookDetailMetadataRows(
                    item: currentItem,
                    showsTags: false,
                    showsAggregateMediaValues: false,
                    showsCollections: false,
                    inlineEdit: inlineEdit,
                    onEditPublished: isServerBook
                        ? {
                            Task {
                                await inlineEdit.beginFieldEdit(
                                    .publicationDate,
                                    for: currentItem,
                                    mediaViewModel: mediaViewModel,
                                )
                            }
                        }
                        : nil,
                    onEditIdentifiers: isServerBook ? { showingIdentifierEditor = true } : nil,
                )
            }
        }
    }

    private var macMediaInfoSection: some View {
        BookDetailDisclosureCard(
            "Media Info",
            systemImage: "rectangle.stack.fill",
            section: .mediaInfo,
        ) {
            MacBookDetailMediaControls(item: currentItem, presentation: .details)
        }
    }

    private var macSyncHistorySection: some View {
        BookDetailDisclosureCard(
            "Sync History",
            systemImage: "clock.arrow.circlepath",
            section: .syncHistory,
        ) {
            syncHistoryButton
        }
    }

    private var relatedSeriesTitle: String {
        guard let name = currentItem.series?.first?.name, !name.isEmpty else {
            return "Other Books in This Series"
        }
        return "More in \(name) series"
    }

    private var relatedAuthorTitle: String {
        guard let name = currentItem.authors?.first?.name, !name.isEmpty else {
            return "More by This Author"
        }
        return "More by \(name)"
    }

    private var relatedSeriesBooks: [BookMetadata] {
        guard let series = currentItem.series?.first else { return [] }
        let normalizedName = series.name.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !normalizedName.isEmpty else { return [] }

        let group = mediaViewModel.booksBySeries(for: mediaKind ?? .ebook).first { group in
            group.series?.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalizedName
        }
        return Array(
            (group?.books ?? [])
                .filter { $0.id != currentItem.id }
                .prefix(12)
        )
    }

    private var relatedAuthorBooks: [BookMetadata] {
        guard let author = currentItem.authors?.first else { return [] }
        let seriesBookIDs = Set(relatedSeriesBooks.map(\.id))
        let normalizedName = author.name?.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard let normalizedName, !normalizedName.isEmpty else { return [] }

        let group = mediaViewModel.booksByAuthor(for: mediaKind ?? .ebook).first { group in
            if let authorID = author.uuid, let groupID = group.author?.uuid {
                return authorID == groupID
            }
            return group.author?.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalizedName
        }
        return Array(
            (group?.books ?? [])
                .filter { $0.id != currentItem.id && !seriesBookIDs.contains($0.id) }
                .prefix(12)
        )
    }
    #endif

    #if os(iOS)
    private var iosHeroSection: some View {
        ZStack {
            BookDetailHeroBackground(
                item: currentItem,
                palette: $coverPalette,
                surfaceColor: resolvedPalette.surface,
                contentBackground: resolvedPalette.contentBackground,
            )

            VStack(spacing: 13) {
                if showsInspectorToolbar || relatedItemOverride != nil {
                    HStack(spacing: 8) {
                        if relatedItemOverride != nil {
                            Button {
                                relatedItemOverride = nil
                            } label: {
                                Image(systemName: "chevron.left")
                                    .frame(width: 32, height: 32)
                                    .background(heroColors.controlFill, in: Circle())
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer()
                        if showsInspectorToolbar, inlineEdit.isEditing {
                            Button {
                                inlineEdit.endEditMode()
                            } label: {
                                Image(systemName: "checkmark")
                                    .frame(width: 32, height: 32)
                                    .background(heroColors.controlFill, in: Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Done editing")
                        }
                        if showsInspectorToolbar {
                            Button(action: onClose) {
                                Image(systemName: "xmark")
                                    .frame(width: 32, height: 32)
                                    .background(heroColors.controlFill, in: Circle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                inlineEditPermissionHint

                BookDetailCoverArtwork(
                    item: currentItem,
                    height: showsInspectorToolbar ? 180 : 230,
                    cornerRadius: 12,
                    progress: animatedProgress,
                    progressBackgroundColor: coverPalette.accentBackground,
                )
                .tint(coverPalette.accent)

                VStack(spacing: 5) {
                    if inlineEdit.isEditing {
                        InlineMetadataFieldRow(
                            model: inlineEdit,
                            field: .title,
                            placeholder: "Title",
                            font: .title2.weight(.bold),
                        )
                        InlineMetadataFieldRow(
                            model: inlineEdit,
                            field: .subtitle,
                            placeholder: "Subtitle",
                            font: .headline,
                        )
                        inlineCreatorAndSeriesEditors
                    } else {
                        Text(currentItem.title)
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)

                        if let subtitle = currentItem.subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.headline)
                                .foregroundStyle(heroColors.secondary.opacity(0.84))
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        BookDetailCreatorSummary(
                            authors: currentItem.authors?.compactMap(\.name) ?? [],
                            narrators: currentItem.narrators?.compactMap(\.name) ?? [],
                            labelColor: heroColors.secondary,
                            nameColor: heroColors.primary.opacity(0.9),
                        )
                        iosHeroSeriesSummary
                    }
                    heroRatingView
                        .padding(.top, 2)

                    if let mediaSummary = iosHeroMediaSummary {
                        Text(mediaSummary)
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(heroColors.secondary)
                            .padding(.top, 2)
                    }
                }

                if !MediaGridViewUtilities.mediaDownloadOptions(for: currentItem).isEmpty {
                    iOSBookDetailCompactMediaControls(item: currentItem)
                }

                if inlineEdit.isEditing {
                    InlineMetadataFieldRow(
                        model: inlineEdit,
                        field: .tags,
                        placeholder: "Comma-separated tags",
                        label: "Tags",
                        font: .caption,
                    )
                    .padding(.top, 2)
                } else if !currentItem.tagNames.isEmpty {
                    BookDetailTagDisclosure(tags: currentItem.tagNames)
                        .padding(.top, 2)
                }
            }
            .foregroundStyle(heroColors.primary)
            .padding(.horizontal, 20)
            .padding(.top, showsInspectorToolbar ? 12 : 96)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: showsInspectorToolbar ? 16 : 0,
                bottomLeadingRadius: 16,
                bottomTrailingRadius: 16,
                topTrailingRadius: showsInspectorToolbar ? 16 : 0,
                style: .continuous,
            )
        )
        .environment(\.bookDetailHeroColors, heroColors)
    }

    private var iosHeroMediaSummary: String? {
        var values: [String] = []
        if let pages = currentItem.pageCountValue, pages > 0 {
            values.append("\(pages) \(pages == 1 ? "page" : "pages")")
        }
        let duration = currentItem.durationDisplay
        if !duration.isEmpty { values.append(duration) }
        return values.isEmpty ? nil : values.joined(separator: " • ")
    }

    @ViewBuilder
    private var iosHeroSeriesSummary: some View {
        if let seriesList = currentItem.series, !seriesList.isEmpty {
            VStack(spacing: 3) {
                ForEach(seriesList, id: \.name) { series in
                    let label =
                        series.formattedPosition.map {
                            "\(series.name) • Book \($0)"
                        } ?? series.name
                    if let onSeriesSelected {
                        Button(label) { onSeriesSelected(series.name) }
                            .buttonStyle(.plain)
                    } else {
                        NavigationLink(value: SeriesNavIdentifier(name: series.name)) {
                            Text(label)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .font(.callout)
            .foregroundStyle(heroColors.primary.opacity(0.86))
            .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder
    private var iosRelatedBooksSections: some View {
        let series = iosRelatedSeriesBooks
        if !series.isEmpty {
            BookDetailRelatedShelf(
                title: iosRelatedSeriesTitle,
                systemImage: "books.vertical.fill",
                section: .relatedSeries,
                books: series,
                onSelect: { relatedItemOverride = $0 },
                seriesName: currentItem.series?.first?.name,
            )
        }

        let authors = iosRelatedAuthorBooks
        if !authors.isEmpty {
            BookDetailRelatedShelf(
                title: iosRelatedAuthorTitle,
                systemImage: "person.2.fill",
                section: .relatedAuthor,
                books: authors,
                onSelect: { relatedItemOverride = $0 },
            )
        }
    }

    private var iosRelatedSeriesTitle: String {
        guard let name = currentItem.series?.first?.name, !name.isEmpty else {
            return "Other Books in This Series"
        }
        return "More in \(name) series"
    }

    private var iosRelatedAuthorTitle: String {
        guard let name = currentItem.authors?.first?.name, !name.isEmpty else {
            return "More by This Author"
        }
        return "More by \(name)"
    }

    private var iosRelatedSeriesBooks: [BookMetadata] {
        guard let series = currentItem.series?.first else { return [] }
        let normalized = series.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return [] }
        let group = mediaViewModel.booksBySeries(for: mediaKind ?? .ebook).first {
            $0.series?.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalized
        }
        return Array((group?.books ?? []).filter { $0.id != currentItem.id }.prefix(12))
    }

    private var iosRelatedAuthorBooks: [BookMetadata] {
        guard let author = currentItem.authors?.first else { return [] }
        let seriesBookIDs = Set(iosRelatedSeriesBooks.map(\.id))
        let normalized = author.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let normalized, !normalized.isEmpty else { return [] }
        let group = mediaViewModel.booksByAuthor(for: mediaKind ?? .ebook).first {
            if let authorID = author.uuid, let groupID = $0.author?.uuid {
                return authorID == groupID
            }
            return $0.author?.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalized
        }
        return Array(
            (group?.books ?? [])
                .filter { $0.id != currentItem.id && !seriesBookIDs.contains($0.id) }
                .prefix(12)
        )
    }
    #endif

    @ViewBuilder
    private var alignmentReportSection: some View {
        if let summary = currentItem.alignmentSummary {
            BookDetailDisclosureCard(
                "Alignment",
                systemImage: "checkmark.seal",
                section: .alignmentReport,
            ) {
                Button {
                    showingAlignmentReport = true
                } label: {
                    HStack {
                        GradePill(grade: summary.grade)
                        Text("Alignment report")
                        if let score = summary.score {
                            Text("\(score)%")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Identifiers have no inline per-field editor; edit mode surfaces the sheet that
    /// replaces the whole set instead.
    private var syncHistoryButton: some View {
        Button {
            showingSyncHistory = true
        } label: {
            HStack {
                Image(systemName: "clock.arrow.circlepath")
                Text("View Sync History")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var inlineEditPermissionHint: some View {
        if let hint = inlineEdit.permissionHint {
            Text(hint)
                .font(.caption)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var inlineCreatorAndSeriesEditors: some View {
        VStack(spacing: 5) {
            InlineMetadataFieldRow(
                model: inlineEdit,
                field: .authors,
                placeholder: "Comma-separated authors",
                label: "Written by",
                font: .callout,
            )
            InlineMetadataFieldRow(
                model: inlineEdit,
                field: .narrators,
                placeholder: "Comma-separated narrators",
                label: "Narrated by",
                font: .callout,
            )
            InlineMetadataSeriesRow(model: inlineEdit)
        }
    }

    @ViewBuilder
    private var descriptionSection: some View {
        let hasDescription = currentItem.description?.isEmpty == false
        let review = personalRating.review
        if inlineEdit.showsEditor(for: .description) {
            descriptionCard {
                InlineMetadataDescriptionEditor(model: inlineEdit)
            }
        } else if hasDescription || isServerBook {
            descriptionCard {
                VStack(alignment: .leading, spacing: 12) {
                    if hasDescription {
                        #if os(macOS)
                        hoverEditable(.description, help: "Edit description") {
                            descriptionBlock(labeled: review != nil)
                        }
                        #else
                        descriptionBlock(labeled: review != nil)
                        #endif
                    }
                    if let review {
                        if hasDescription {
                            Divider()
                        }
                        #if os(macOS)
                        InlineMetadataHoverEdit(
                            help: "Edit review",
                            action: { showingRatingEditor = true },
                        ) {
                            reviewBlock(review)
                        }
                        #else
                        reviewBlock(review)
                        #endif
                    } else if !hasDescription {
                        Text("No description available.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func descriptionCard<C: View>(@ViewBuilder content: () -> C) -> some View {
        BookDetailDisclosureCard(
            isServerBook ? "Description & Reviews" : "Description",
            systemImage: "text.alignleft",
            section: .description,
        ) {
            content()
        }
    }

    private func descriptionBlock(labeled: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if labeled {
                Text("Description")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            descriptionContent
        }
    }

    private func reviewBlock(_ review: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(
                    personalRating.reviewerName.map { "Review by \($0)" } ?? "User Review"
                )
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                #if os(iOS)
                Button {
                    showingRatingEditor = true
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Edit review")
                #endif
            }

            Text(review)
                .font(.body)
                .lineLimit(isReviewExpanded ? nil : 8)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)

            if review.count > 280 {
                Button(isReviewExpanded ? "Show Less" : "Show More") {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isReviewExpanded.toggle()
                    }
                }
                .buttonStyle(.plain)
                .font(.callout.weight(.medium))
                .foregroundStyle(.tint)
            }
        }
    }

    #if os(iOS)
    private var iosBookInfoSection: some View {
        BookDetailDisclosureCard("Book Info", systemImage: "info.circle", section: .bookInfo) {
            BookDetailMetadataRows(
                item: currentItem,
                showsTags: true,
                showsAggregateMediaValues: false,
                inlineEdit: inlineEdit,
            )
        }
    }

    private var iosMediaInfoSection: some View {
        BookDetailDisclosureCard(
            "Media Info",
            systemImage: "rectangle.stack.fill",
            section: .mediaInfo,
        ) {
            BookDetailMediaInfoRows(item: currentItem)
        }
    }

    private var iosSyncHistorySection: some View {
        BookDetailDisclosureCard(
            "Sync History",
            systemImage: "clock.arrow.circlepath",
            section: .syncHistory,
        ) {
            syncHistoryButton
        }
    }
    #endif

    @ViewBuilder
    private var descriptionContent: some View {
        if let attributedDescription {
            VStack(alignment: .leading, spacing: 10) {
                Text(attributedDescription)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(isDescriptionExpanded ? nil : 8)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)

                if (currentItem.description?.count ?? 0) > 280 {
                    Button(isDescriptionExpanded ? "Show Less" : "Show More") {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isDescriptionExpanded.toggle()
                        }
                    }
                    .buttonStyle(.plain)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.tint)
                }
            }
        } else {
            Text("Loading description...")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private func prepareForDisplay() {
        animatedProgress = 0
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.45)) {
                self.animatedProgress = self.mediaViewModel.progress(for: self.currentItem.id)
            }
        }
    }

    private func loadDescription() {
        descriptionTask?.cancel()
        descriptionTask = nil
        attributedDescription = nil
        isDescriptionExpanded = false

        guard let description = currentItem.description, !description.isEmpty else { return }
        let itemID = currentItem.id
        let html = description

        descriptionTask = Task.detached(priority: .userInitiated) { [html, itemID] in
            let parsed = BookDescriptionText.attributed(from: html)
            await MainActor.run {
                guard !Task.isCancelled, itemID == self.currentItem.id else {
                    self.descriptionTask = nil
                    return
                }
                self.attributedDescription = parsed
                self.descriptionTask = nil
            }
        }
    }

}

#if os(macOS)
private struct MacBookDetailScrollViewConfiguration: NSViewRepresentable {
    func makeNSView(context: Context) -> MacBookDetailScrollViewConfigurationView {
        MacBookDetailScrollViewConfigurationView()
    }

    func updateNSView(
        _ nsView: MacBookDetailScrollViewConfigurationView,
        context: Context,
    ) {
        nsView.applyConfiguration()
    }
}

private final class MacBookDetailScrollViewConfigurationView: NSView {
    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        applyConfiguration()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        applyConfiguration()
    }

    func applyConfiguration() {
        DispatchQueue.main.async { [weak self] in
            var ancestor: NSView? = self
            while let current = ancestor {
                if let scrollView = current as? NSScrollView {
                    scrollView.scrollerStyle = .overlay
                    scrollView.hasVerticalScroller = true
                    return
                }
                ancestor = current.superview
            }
        }
    }
}
#endif

#endif
