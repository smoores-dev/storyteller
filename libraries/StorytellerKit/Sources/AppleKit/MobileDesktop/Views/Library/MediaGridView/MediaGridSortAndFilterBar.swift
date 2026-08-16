#if os(iOS) || os(macOS)
import SwiftUI

struct MediaGridSortAndFilterBar: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Binding var selectedSortOption: MediaGridView.SortOption
    @Binding var selectedFormatFilter: MediaGridView.FormatFilterOption
    @Binding var selectedTag: String?
    @Binding var selectedSeries: String?
    @Binding var selectedAuthor: String?
    @Binding var selectedNarrator: String?
    @Binding var selectedTranslator: String?
    @Binding var selectedPublicationYear: String?
    @Binding var selectedRating: String?
    @Binding var selectedStatus: String?
    @Binding var selectedProgress: ProgressCondition?
    @Binding var selectedLocation: MediaGridView.LocationFilterOption
    @Binding var selectedSourceID: BookSourceID?
    let contextFilters: MediaGridView.ContextFilters
    @Binding var layoutStyle: LibraryLayoutStyle
    @Binding var coverPrefRaw: String
    @Binding var coverSize: Double
    @Binding var gridSpacingRaw: String
    @Binding var showAudioIndicator: Bool
    @Binding var showSourceBadge: Bool
    @Binding var showSeriesPositionBadge: Bool
    @Binding var progressStyleRaw: String
    @Binding var showOnItemRaw: String
    let availableTags: [String]
    let availableSeries: [String]
    let availableAuthors: [String]
    let availableNarrators: [String]
    let availableTranslators: [String]
    let availablePublicationYears: [String]
    let availableRatings: [String]
    let availableStatuses: [String]
    let availableSources: [BookSourceRecord]
    let filtersSummaryText: String
    var searchScopeTitle: String = ""
    let showLayoutOption: Bool
    var showSortOption: Bool = true
    var onAddBook: (() -> Void)? = nil
    /// iOS only; macOS enters multi-selection via Cmd/Shift-click on cards instead.
    var isSelectModeActive: Bool = false
    var onToggleSelectMode: (() -> Void)? = nil
    #if os(macOS)
    var columnCustomization: Binding<TableColumnCustomization<BookMetadata>>? = nil
    var availableCreatorRoles: Set<String> = []
    var enabledCreatorRoles: Binding<Set<String>>? = nil
    var onResetColumns: (() -> Void)? = nil
    #endif

    @State private var showViewOptions = false

    #if os(macOS)
    private let barSpacing: CGFloat = 8
    #else
    private let barSpacing: CGFloat = 12
    #endif

    var body: some View {
        HStack(spacing: barSpacing) {
            if showSortOption {
                sortMenu
            }
            formatMenu
            Spacer()
            #if os(iOS)
            selectModeButton
            #endif
            addBookButton
            #if os(macOS)
            if isTableLayout, columnCustomization != nil {
                columnsMenu
            }
            #endif
            viewOptionsButton
            #if os(macOS)
            contentSearchField
            #endif
        }
        .font(.callout)
    }

    #if os(macOS)
    @Environment(\.contentSearchText) private var contentSearchText
    @Environment(\.contentSearchFocus) private var contentSearchFocus

    private var contentSearchField: some View {
        CollapsibleSearchField(
            placeholder: searchScopeTitle.isEmpty ? "Search" : "Search \(searchScopeTitle)",
            searchText: contentSearchText,
            focusRequest: contentSearchFocus,
        )
    }
    #endif

    @ViewBuilder
    private var addBookButton: some View {
        if let onAddBook {
            Button {
                onAddBook()
            } label: {
                #if os(iOS)
                Label("Add Book", systemImage: "plus.circle")
                    .labelStyle(.iconOnly)
                #else
                Label("Add Book", systemImage: "plus")
                #endif
            }
            #if os(macOS)
            .libraryBarButton()
            #endif
            .help("Add book")
        }
    }

    private var isTableLayout: Bool {
        layoutStyle == .table
    }

    #if os(iOS)
    @ViewBuilder
    private var selectModeButton: some View {
        if let onToggleSelectMode {
            Button {
                onToggleSelectMode()
            } label: {
                Label(
                    isSelectModeActive ? "Done" : "Multiple",
                    systemImage: isSelectModeActive ? "checkmark.circle.fill" : "checklist",
                )
                .labelStyle(.iconOnly)
            }
        }
    }
    #endif

    @ViewBuilder
    private var sortMenu: some View {
        #if os(macOS)
        HStack(spacing: 4) {
            Menu {
                sortMenuContent
            } label: {
                Label(
                    "Sort: \(selectedSortOption.sortField.label)",
                    systemImage: "arrow.up.arrow.down",
                )
            }
            .libraryBarMenu()

            Button {
                selectedSortOption = selectedSortOption.toggled
            } label: {
                Image(systemName: selectedSortOption.isAscending ? "arrow.up" : "arrow.down")
            }
            .libraryBarButton()
            .help("Reverse sort direction")
        }
        #else
        HStack(spacing: 2) {
            Menu {
                sortMenuContent
            } label: {
                Label("Sort", systemImage: "arrow.up.arrow.down")
            }

            Button {
                selectedSortOption = selectedSortOption.toggled
            } label: {
                Image(systemName: selectedSortOption.isAscending ? "arrow.up" : "arrow.down")
            }
            .help("Reverse sort direction")
        }
        #endif
    }

    private func handleSortFieldTap(_ field: MediaGridView.SortOption.SortField) {
        if selectedSortOption.sortField == field {
            selectedSortOption = selectedSortOption.toggled
        } else {
            selectedSortOption = MediaGridView.SortOption.defaultOption(for: field)
        }
    }

    @ViewBuilder
    private var sortMenuContent: some View {
        let fields = LibraryMetadataField.sortFields
        ForEach(Array(fields.enumerated()), id: \.element.field) { index, descriptor in
            if index > 0, fields[index - 1].section != descriptor.section {
                Divider()
            }
            if descriptor.isSubmenu {
                Menu(descriptor.label) {
                    ForEach(MediaGridView.SortOption.alignmentSortFields, id: \.self) { field in
                        sortButton(for: field)
                    }
                }
            } else if let field = MediaGridView.SortOption.sortField(for: descriptor.field) {
                sortButton(for: field)
            }
        }
    }

    @ViewBuilder
    private func sortButton(for field: MediaGridView.SortOption.SortField) -> some View {
        Button {
            handleSortFieldTap(field)
        } label: {
            sortMenuRow(for: field)
        }
    }

    @ViewBuilder
    private func sortMenuRow(for field: MediaGridView.SortOption.SortField) -> some View {
        let isSelected = selectedSortOption.sortField == field
        HStack {
            Text(field.label)
            Spacer()
            if isSelected {
                Image(systemName: selectedSortOption.isAscending ? "arrow.up" : "arrow.down")
                    .imageScale(.small)
            }
        }
    }

    @ViewBuilder
    private var formatMenu: some View {
        Menu {
            clearMenuItem
            filterSubmenus
        } label: {
            #if os(iOS)
            Label("Filters", systemImage: "line.3.horizontal.decrease")
            #else
            Label(
                "Filters: \(filtersSummaryText)",
                systemImage: "line.3.horizontal.decrease",
            )
            #endif
        }
        #if os(macOS)
        .libraryBarMenu()
        #endif
    }

    @ViewBuilder
    private var formatSection: some View {
        Menu {
            ForEach(MediaGridView.FormatFilterOption.allCases) { option in
                Button {
                    selectedFormatFilter = option
                } label: {
                    menuRowLabel(text: option.label, isSelected: option == selectedFormatFilter)
                }
            }
        } label: {
            Label("Format", systemImage: "books.vertical")
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        let statuses = availableStatuses
        if statuses.isEmpty || contextFilters.status != nil {
            EmptyView()
        } else {
            Menu {
                Button {
                    selectedStatus = nil
                } label: {
                    menuRowLabel(
                        text: "All Statuses",
                        isSelected: selectedStatus == nil,
                    )
                }

                ForEach(statuses, id: \.self) { status in
                    Button {
                        selectedStatus = status
                    } label: {
                        menuRowLabel(text: status, isSelected: selectedStatus == status)
                    }
                }
            } label: {
                Label("Status", systemImage: "checkmark.circle")
            }
        }
    }

    @ViewBuilder
    private var filterSubmenus: some View {
        // Format and Rating are filter-only (not shared metadata) and lead the menu; the shared
        // fields then follow the canonical LibraryMetadataField order.
        formatSection

        let ratings = availableRatings
        if !ratings.isEmpty && contextFilters.rating == nil {
            ratingFilterMenu(ratings)
        }

        let fields = LibraryMetadataField.filterFields
        ForEach(Array(fields.enumerated()), id: \.element.field) { index, descriptor in
            if index > 0, descriptor.section != fields[index - 1].section {
                Divider()
            }
            filterEntry(for: descriptor.field)
            // Translator is a creator role with no registry entry; group it with the creators.
            if descriptor.field == .narrator {
                translatorFilterEntry
            }
        }
    }

    @ViewBuilder
    private func filterEntry(for field: LibraryMetadataField) -> some View {
        switch field {
            case .author:
                let authors = availableAuthors
                if !authors.isEmpty, contextFilters.author == nil {
                    authorFilterMenu(authors)
                }
            case .narrator:
                let narrators = availableNarrators
                if !narrators.isEmpty, contextFilters.narrator == nil {
                    narratorFilterMenu(narrators)
                }
            case .series:
                let series = availableSeries
                if !series.isEmpty, contextFilters.series == nil {
                    seriesFilterMenu(series)
                }
            case .publicationDate:
                let years = availablePublicationYears
                if !years.isEmpty, contextFilters.publicationYear == nil {
                    publicationYearFilterMenu(years)
                }
            case .tags:
                let tags = availableTags
                if !tags.isEmpty, contextFilters.tag == nil {
                    tagFilterMenu(tags)
                }
            case .status:
                statusSection
            case .progress:
                progressSection
            case .source:
                let sources = availableSources.sorted {
                    $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                }
                if !sources.isEmpty && contextFilters.sourceID == nil {
                    sourceFilterMenu(sources)
                }
            case .location:
                locationSection
            default:
                EmptyView()
        }
    }

    @ViewBuilder
    private var progressSection: some View {
        Menu {
            Button {
                selectedProgress = nil
            } label: {
                menuRowLabel(text: "All Progress", isSelected: selectedProgress == nil)
            }

            ForEach(ProgressCondition.allCases) { progress in
                Button {
                    selectedProgress = progress
                } label: {
                    menuRowLabel(text: progress.label, isSelected: selectedProgress == progress)
                }
            }
        } label: {
            Label("Progress", systemImage: "chart.bar")
        }
    }

    @ViewBuilder
    private var translatorFilterEntry: some View {
        let translators = availableTranslators
        if !translators.isEmpty, contextFilters.translator == nil {
            translatorFilterMenu(translators)
        }
    }

    @ViewBuilder
    private func authorFilterMenu(_ authors: [String]) -> some View {
        Menu {
            Button {
                selectedAuthor = nil
            } label: {
                menuRowLabel(
                    text: "All Authors",
                    isSelected: selectedAuthor == nil,
                )
            }

            ForEach(authors, id: \.self) { authorName in
                Button {
                    selectedAuthor = authorName
                } label: {
                    menuRowLabel(
                        text: authorName,
                        isSelected: selectedAuthor == authorName,
                    )
                }
            }
        } label: {
            Label("Author", systemImage: "person.2")
        }
    }

    @ViewBuilder
    private func seriesFilterMenu(_ series: [String]) -> some View {
        Menu {
            Button {
                selectedSeries = nil
            } label: {
                menuRowLabel(text: "All Series", isSelected: selectedSeries == nil)
            }

            ForEach(series, id: \.self) { seriesName in
                Button {
                    selectedSeries = seriesName
                } label: {
                    menuRowLabel(
                        text: seriesName,
                        isSelected: selectedSeries == seriesName,
                    )
                }
            }
        } label: {
            Label("Series", systemImage: "books.vertical")
        }
    }

    @ViewBuilder
    private func narratorFilterMenu(_ narrators: [String]) -> some View {
        Menu {
            Button {
                selectedNarrator = nil
            } label: {
                menuRowLabel(
                    text: "All Narrators",
                    isSelected: selectedNarrator == nil,
                )
            }

            ForEach(narrators, id: \.self) { narratorName in
                Button {
                    selectedNarrator = narratorName
                } label: {
                    menuRowLabel(
                        text: narratorName,
                        isSelected: selectedNarrator == narratorName,
                    )
                }
            }
        } label: {
            Label("Narrator", systemImage: "mic")
        }
    }

    @ViewBuilder
    private func translatorFilterMenu(_ translators: [String]) -> some View {
        Menu {
            Button {
                selectedTranslator = nil
            } label: {
                menuRowLabel(
                    text: "All Translators",
                    isSelected: selectedTranslator == nil,
                )
            }

            ForEach(translators, id: \.self) { translatorName in
                Button {
                    selectedTranslator = translatorName
                } label: {
                    menuRowLabel(
                        text: translatorName,
                        isSelected: selectedTranslator == translatorName,
                    )
                }
            }
        } label: {
            Label("Translator", systemImage: "character.book.closed.fill")
        }
    }

    @ViewBuilder
    private func publicationYearFilterMenu(_ publicationYears: [String]) -> some View {
        Menu {
            Button {
                selectedPublicationYear = nil
            } label: {
                menuRowLabel(
                    text: "All Years",
                    isSelected: selectedPublicationYear == nil,
                )
            }

            ForEach(publicationYears, id: \.self) { year in
                Button {
                    selectedPublicationYear = year
                } label: {
                    menuRowLabel(
                        text: year,
                        isSelected: selectedPublicationYear == year,
                    )
                }
            }
        } label: {
            Label("Pub Year", systemImage: "calendar")
        }
    }

    @ViewBuilder
    private func tagFilterMenu(_ tags: [String]) -> some View {
        Menu {
            Button {
                selectedTag = nil
            } label: {
                menuRowLabel(text: "All Tags", isSelected: selectedTag == nil)
            }

            ForEach(tags, id: \.self) { tag in
                Button {
                    selectedTag = tag
                } label: {
                    menuRowLabel(text: tag, isSelected: selectedTag == tag)
                }
            }
        } label: {
            Label("Tag", systemImage: "tag")
        }
    }

    @ViewBuilder
    private func ratingFilterMenu(_ ratings: [String]) -> some View {
        Menu {
            Button {
                selectedRating = nil
            } label: {
                menuRowLabel(text: "All User Ratings", isSelected: selectedRating == nil)
            }

            ForEach(ratings, id: \.self) { rating in
                Button {
                    selectedRating = rating
                } label: {
                    menuRowLabel(
                        text: rating == "Unrated" ? "Unrated" : "\(rating) Stars",
                        isSelected: selectedRating == rating,
                    )
                }
            }
        } label: {
            Label("User Rating", systemImage: "star")
        }
    }

    @ViewBuilder
    private func sourceFilterMenu(_ sources: [BookSourceRecord]) -> some View {
        Menu {
            Button {
                selectedSourceID = nil
            } label: {
                menuRowLabel(text: "All Sources", isSelected: selectedSourceID == nil)
            }

            ForEach(sources) { source in
                Button {
                    selectedSourceID = source.id
                } label: {
                    menuRowLabel(
                        text: source.name,
                        isSelected: selectedSourceID == source.id,
                    )
                }
            }
        } label: {
            Label("Source", systemImage: "externaldrive")
        }
    }

    @ViewBuilder
    private var locationSection: some View {
        if contextFilters.location == nil {
            Menu {
                ForEach(MediaGridView.LocationFilterOption.allCases) { option in
                    Button {
                        selectedLocation = option
                    } label: {
                        menuRowLabel(text: option.label, isSelected: selectedLocation == option)
                    }
                }
            } label: {
                Label("Location", systemImage: "externaldrive")
            }
        }
    }

    @ViewBuilder
    private var clearMenuItem: some View {
        if canClearFilters {
            Button {
                clearFilters()
            } label: {
                menuRowLabel(text: "Clear Filters", isSelected: false)
            }
        }
    }

    private var canClearFilters: Bool {
        selectedFormatFilter != .all
            || selectedTag != nil
            || selectedSeries != nil
            || selectedAuthor != nil
            || selectedNarrator != nil
            || selectedTranslator != nil
            || selectedPublicationYear != nil
            || selectedRating != nil
            || selectedStatus != nil
            || selectedProgress != nil
            || selectedLocation != .all
            || selectedSourceID != nil
    }

    private func clearFilters() {
        selectedFormatFilter = .all
        selectedTag = nil
        selectedSeries = nil
        selectedAuthor = nil
        selectedNarrator = nil
        selectedTranslator = nil
        selectedPublicationYear = nil
        selectedRating = nil
        selectedStatus = nil
        selectedProgress = nil
        selectedLocation = .all
        selectedSourceID = nil
    }

    @ViewBuilder
    private var viewOptionsButton: some View {
        Button {
            showViewOptions.toggle()
        } label: {
            #if os(macOS)
            Label("View Options", systemImage: LibraryBarIcon.viewOptions)
            #else
            Label("View Options", systemImage: "ellipsis.circle")
            #endif
        }
        #if os(macOS)
        .libraryBarButton()
        .help("View options")
        .popover(isPresented: $showViewOptions) {
            viewOptionsPopoverContent
        }
        #else
        .sheet(isPresented: $showViewOptions) {
            ScrollView {
                viewOptionsPopoverContent
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        #endif
    }

    private var viewOptionsPopoverContent: some View {
        LibraryViewOptions(
            coverPrefRaw: $coverPrefRaw,
            coverSizeValue: $coverSize,
            gridSpacingRaw: $gridSpacingRaw,
            showAudioIndicator: $showAudioIndicator,
            showSourceBadge: $showSourceBadge,
            showSeriesPositionBadge: $showSeriesPositionBadge,
            progressStyleRaw: $progressStyleRaw,
            showOnItemRaw: $showOnItemRaw,
            showsSizeOptions: !isTableLayout,
            showsShowOnItem: layoutStyle == .grid,
            onReset: { layoutStyle = .grid },
            header: {
                if showLayoutOption {
                    layoutPopoverSection
                }
            },
            footer: { accentColorPopoverSection },
        )
    }

    @ViewBuilder
    private var accentColorPopoverSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Accent Color")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ColorPicker(
                    "",
                    selection: Binding(
                        get: {
                            Color(hex: mediaViewModel.cachedConfig.library.accentColorHex)
                                ?? .storytellerOrange
                        },
                        set: { newColor in
                            if let hex = newColor.hexString() {
                                persistAccentColor(hex)
                            }
                        },
                    ),
                    supportsOpacity: false,
                )
                .labelsHidden()
                #if os(macOS)
                Button("System") {
                    if let hex = Color(nsColor: NSColor.controlAccentColor).hexString() {
                        persistAccentColor(hex)
                    }
                }
                .controlSize(.small)
                #endif
                Button("Reset") {
                    persistAccentColor(kDefaultAccentColorHex)
                }
                .controlSize(.small)
            }
        }
    }

    private func persistAccentColor(_ hex: String) {
        Task {
            try? await SettingsActor.shared.updateConfig(accentColorHex: hex)
        }
    }

    @ViewBuilder
    private var layoutPopoverSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Layout")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(
                    [
                        LibraryLayoutStyle.grid, LibraryLayoutStyle.compactGrid,
                        LibraryLayoutStyle.table,
                    ],
                    id: \.self,
                ) { style in
                    Button {
                        layoutStyle = style
                    } label: {
                        Image(systemName: style.iconName)
                            .frame(width: 32, height: 28)
                    }
                    .buttonStyle(.bordered)
                    .tint(layoutStyle == style ? .accentColor : .secondary)
                }
            }
        }
    }

    #if os(macOS)
    @ViewBuilder
    private var columnsMenu: some View {
        Menu {
            columnToggle(id: "cover", label: "Cover")
            columnsMenuContent
            Divider()
            Button("Reset to Defaults") {
                onResetColumns?()
            }
        } label: {
            Label("Columns", systemImage: "rectangle.split.3x1")
        }
        .libraryBarMenu()
    }

    @ViewBuilder
    private var columnsMenuContent: some View {
        let fields = LibraryMetadataField.columnFields
        ForEach(Array(fields.enumerated()), id: \.element.field) { index, descriptor in
            if index > 0, fields[index - 1].section != descriptor.section {
                // Media (table-only, not book metadata) sits at the end of section 2.
                if descriptor.section == 3 {
                    columnToggle(id: "media", label: "Media")
                }
                Divider()
            }
            switch descriptor.field {
                case .creators: creatorsSubmenu
                case .alignment: alignmentDataSubmenu
                default:
                    if let id = MediaTableView.columnID(for: descriptor.field) {
                        columnToggle(id: id, label: descriptor.label)
                    }
            }
        }
    }

    @ViewBuilder
    private var creatorsSubmenu: some View {
        Menu("Creators") {
            columnToggle(id: "allCreators", label: "All Creators")
            Divider()
            let allRoles = mergedCreatorRoles
            ForEach(allRoles, id: \.code) { role in
                creatorColumnToggle(code: role.code, label: role.label)
            }
        }
    }

    private var mergedCreatorRoles: [(code: String, label: String)] {
        availableCreatorRoles
            .filter { $0 != "aut" && $0 != "nrt" }
            .sorted()
            .map { code in
                (code: code, label: MediaTableView.labelForRole(code))
            }
    }

    @ViewBuilder
    private var alignmentDataSubmenu: some View {
        Menu("Alignment Data") {
            columnToggle(id: "alignedAt", label: "Aligned Date")
            columnToggle(id: "alignedByVersion", label: "ST Version")
            columnToggle(id: "alignedWith", label: "Transcription Engine")
        }
    }

    private static let defaultVisibleColumns: Set<String> = ["cover", "title", "series", "media"]

    private func isColumnVisible(_ id: String) -> Bool {
        guard let binding = columnCustomization else { return false }
        let visibility = binding.wrappedValue[visibility: id]
        switch visibility {
            case .visible:
                return true
            case .hidden:
                return false
            default:
                return Self.defaultVisibleColumns.contains(id)
        }
    }

    @ViewBuilder
    private func columnToggle(id: String, label: String) -> some View {
        if let binding = columnCustomization {
            let isVisible = isColumnVisible(id)
            Button {
                binding.wrappedValue[visibility: id] = isVisible ? .hidden : .visible
            } label: {
                HStack {
                    Text(label)
                    Spacer()
                    if isVisible {
                        Image(systemName: "checkmark")
                            .imageScale(.small)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func creatorColumnToggle(code: String, label: String) -> some View {
        let columnID = MediaTableView.creatorColumnID(for: code)
        if let binding = columnCustomization, let rolesBinding = enabledCreatorRoles {
            let isVisible = isColumnVisible(columnID)
            Button {
                if isVisible {
                    binding.wrappedValue[visibility: columnID] = .hidden
                    rolesBinding.wrappedValue.remove(code)
                } else {
                    rolesBinding.wrappedValue.insert(code)
                    binding.wrappedValue[visibility: columnID] = .visible
                }
            } label: {
                HStack {
                    Text(label)
                    Spacer()
                    if isVisible {
                        Image(systemName: "checkmark")
                            .imageScale(.small)
                    }
                }
            }
        }
    }
    #endif

}

#endif
