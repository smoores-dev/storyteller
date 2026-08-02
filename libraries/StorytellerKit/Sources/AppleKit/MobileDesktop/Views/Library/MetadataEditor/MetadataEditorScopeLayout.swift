#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#endif
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

enum MetadataEditorScope: String, CaseIterable, Identifiable {
    case work
    case covers
    case audiobook
    case ebook

    var id: String { rawValue }

    var title: String {
        switch self {
            case .work: return "General"
            case .covers: return "Covers"
            case .audiobook: return "Audiobook Edition"
            case .ebook: return "Ebook Edition"
        }
    }

    var systemImage: String {
        switch self {
            case .work: return "books.vertical"
            case .covers: return "photo.on.rectangle.angled"
            case .audiobook: return "headphones"
            case .ebook: return "book"
        }
    }
}

struct WorkMetadataLayout: View {
    let bookId: BookID
    @Bindable var viewModel: MetadataEditorViewModel
    let openHardcoverImport: () -> Void
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif
    @State private var personalRating = BookPersonalRatingModel()
    @State private var showingRatingEditor = false

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }
    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        fullPageForm
            .task(id: bookId) {
                await personalRating.prepare(
                    for: bookId,
                    isServerBook: mediaViewModel.isServerBook(bookId),
                )
            }
            .sheet(isPresented: $showingRatingEditor) {
                BookRatingEditorSheet(model: personalRating)
            }
    }

    private var fullPageForm: some View {
        GeometryReader { proxy in
            let horizontalPadding: CGFloat = 20
            let columnSpacing: CGFloat = 24
            let contentWidth = max(proxy.size.width - (horizontalPadding * 2), 0)
            let columnWidth = max((contentWidth - columnSpacing) / 2, 0)
            ScrollView {
                if proxy.size.width < 1120 {
                    VStack(alignment: .leading, spacing: 24) {
                        workDetailsColumn
                        communityLibraryColumn
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(.horizontal, horizontalPadding)
                    .padding(.vertical, 24)
                } else {
                    HStack(alignment: .top, spacing: columnSpacing) {
                        workDetailsColumn
                            .frame(width: columnWidth, alignment: .top)
                        communityLibraryColumn
                            .frame(width: columnWidth, alignment: .top)
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.vertical, 24)
                }
            }
            .scrollIndicators(.visible)
        }
    }

    private var workDetailsColumn: some View {
        VStack(alignment: .leading, spacing: 18) {
            fieldGroup("Work Details") {
                scalarField("Title", field: "title", text: scalarBinding(\.title))
                scalarField(
                    "Subtitle",
                    field: "subtitle",
                    text: scalarBinding(\.subtitle),
                )
                expandedStringListField(
                    "Author",
                    field: "authors",
                    suggestions: viewModel.libraryAuthorNames,
                )
                expandedStringListField(
                    "Narrator(s)",
                    field: "narrators",
                    suggestions: viewModel.libraryNarratorNames,
                )
                creatorsField()
                publicationDateField()
                scalarField(
                    "Language",
                    field: "language",
                    text: scalarBinding(\.language),
                )
                seriesField()
                textAreaField(
                    "Description",
                    field: "description",
                    text: scalarBinding(\.description),
                )
            }
        }
    }

    private var communityLibraryColumn: some View {
        VStack(alignment: .leading, spacing: 18) {
            fieldGroup("Community") {
                hardcoverSlugField()
                expandedStringListField(
                    "Tags",
                    field: "tags",
                    suggestions: viewModel.libraryTagNames,
                )
            }

            fieldGroup("Personal") {
                statusField()
                personalRatingField()
                personalReviewField()
                readOnlyField("Date Last Read", value: lastReadDisplay)
                smartShelvesField()
            }

            fieldGroup("Library") {
                collectionsField()
                identifiersField()
            }
        }
    }

    private var hardcoverSlugValue: String? {
        guard let book else { return nil }
        let stored =
            book.identifiersLoaded
            ? book.identifiers.first { $0.kind == "hardcover-book-slug" }?.value
            : book.originalMetadata.identifierList.first { $0.kind == "hardcover-book-slug" }?.value
        for candidate in [stored, book.hardcoverImports[.text]?.slug] {
            let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmed.isEmpty { return trimmed }
        }
        return nil
    }

    private var hardcoverSlug: String {
        hardcoverSlugValue ?? "(empty)"
    }

    private var hardcoverSlugURL: URL? {
        guard let slug = hardcoverSlugValue else { return nil }
        return URL(string: "https://hardcover.app/books/\(slug)")
    }

    private var librarySeriesNames: [String] {
        var names = Set<String>()
        for metadata in mediaViewModel.library.bookMetaData {
            for series in metadata.series ?? [] {
                let trimmed = series.name.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    names.insert(trimmed)
                }
            }
        }
        return names.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func fieldGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
        -> some View
    {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.title3.weight(.semibold))
                .padding(.bottom, 2)
            content()
        }
    }

    private func scalarBinding(
        _ keyPath: WritableKeyPath<MetadataEditorViewModel.EditableBook, String>
    ) -> Binding<String> {
        Binding(
            get: {
                viewModel.books.first { $0.id == bookId }?[keyPath: keyPath] ?? ""
            },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                viewModel.books[index][keyPath: keyPath] = newValue
            },
        )
    }

    private func scalarField(_ label: String, field: String, text: Binding<String>) -> some View {
        editableFieldShell(label: label, field: field) {
            let binding = Binding(
                get: { text.wrappedValue },
                set: { newValue in
                    text.wrappedValue = newValue
                    viewModel.markDirty(field: field, for: bookId)
                },
            )
            TextField("(empty)", text: binding)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func publicationDateField() -> some View {
        let dateString = viewModel.books.first { $0.id == bookId }?.publicationDate ?? ""
        let hasDate = !dateString.isEmpty
        return editableFieldShell(label: "Publication Date", field: "publicationDate") {
            HStack(spacing: 10) {
                #if os(macOS)
                MetadataEditorDatePicker(
                    selection: Binding(
                        get: {
                            StorytellerDate.calendarDay(dateString) ?? Date()
                        },
                        set: { newDate in
                            guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                            else { return }
                            viewModel.books[index].publicationDate = StorytellerDate.isoDay(
                                from: newDate
                            )
                            viewModel.markDirty(field: "publicationDate", for: bookId)
                        },
                    )
                )
                .frame(width: 156)
                .disabled(!hasDate)
                #else
                DatePicker(
                    "",
                    selection: Binding(
                        get: {
                            StorytellerDate.calendarDay(dateString) ?? Date()
                        },
                        set: { newDate in
                            guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                            else { return }
                            viewModel.books[index].publicationDate = StorytellerDate.isoDay(
                                from: newDate
                            )
                            viewModel.markDirty(field: "publicationDate", for: bookId)
                        },
                    ),
                    displayedComponents: .date,
                )
                .labelsHidden()
                .disabled(!hasDate)
                #endif

                Toggle(
                    "No date",
                    isOn: Binding(
                        get: { !hasDate },
                        set: { noDate in
                            guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                            else { return }
                            viewModel.books[index].publicationDate =
                                noDate ? "" : StorytellerDate.isoDay(from: Date())
                            viewModel.markDirty(field: "publicationDate", for: bookId)
                        },
                    ),
                )
                #if os(macOS)
                .toggleStyle(.checkbox)
                #endif
            }
            .padding(8)
            .metadataEditorBoundary()
        }
    }

    private func statusField() -> some View {
        editableFieldShell(label: "Status", field: "status") {
            Picker("", selection: statusBinding) {
                ForEach(statusOptions, id: \.uuid) { status in
                    Text(status.name).tag(status.uuid ?? "")
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 2)
            .disabled(statusOptions.isEmpty)
        }
    }

    private var statusOptions: [BookStatus] {
        var statuses = viewModel.availableStatuses(for: bookId)
            .filter {
                !($0.uuid ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        guard let current = viewModel.books.first(where: { $0.id == bookId }),
            !current.statusUuid.isEmpty,
            !statuses.contains(where: { $0.uuid == current.statusUuid })
        else {
            return statuses
        }
        statuses.insert(
            current.originalMetadata.status
                ?? BookStatus(uuid: current.statusUuid, name: current.status),
            at: 0,
        )
        return statuses
    }

    private func smartShelvesField() -> some View {
        HStack(alignment: .top, spacing: 10) {
            fieldLabel("Smart Shelves")
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 8) {
                if matchingSmartShelfNames.isEmpty {
                    Text("No matching smart shelves")
                        .foregroundStyle(.secondary)
                        .italic()
                } else {
                    ChipWrap(values: matchingSmartShelfNames)
                }

                Button("Manage Smart Shelves") {
                    openSmartShelves()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .controlSize(.small)
                .help("Open Smart Shelves")
            }
            .padding(8)
            .metadataEditorBoundary()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func openSmartShelves() {
        #if os(macOS)
        openWindow(id: "MyLibrary")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            NotificationCenter.default.post(name: .openSmartShelves, object: nil)
        }
        #else
        NotificationCenter.default.post(name: .openSmartShelves, object: nil)
        #endif
    }

    private var matchingSmartShelfNames: [String] {
        guard
            let libraryBook = mediaViewModel.library.bookMetaData.first(where: { $0.id == bookId }
            )
        else {
            return []
        }

        let progress = mediaViewModel.progress(for: libraryBook.id)
        let isLocal = mediaViewModel.isLocalStandaloneBook(libraryBook.id)
        let hasDownloadedContent =
            mediaViewModel.isCategoryDownloaded(.ebook, for: libraryBook)
            || mediaViewModel.isCategoryDownloaded(.audio, for: libraryBook)
            || mediaViewModel.isCategoryDownloaded(.synced, for: libraryBook)
        let locationInfo = ShelfLocationInfo(
            isDownloaded: hasDownloadedContent && !isLocal,
            isLocalStandalone: isLocal,
        )

        return mediaViewModel.smartShelves
            .filter { $0.matchesAll(libraryBook, progress: progress, locationInfo: locationInfo) }
            .map(\.name)
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private var statusBinding: Binding<String> {
        Binding(
            get: { viewModel.books.first { $0.id == bookId }?.statusUuid ?? "" },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                viewModel.books[index].statusUuid = newValue
                if let status = viewModel.availableStatuses(for: bookId).first(where: {
                    $0.uuid == newValue
                }) {
                    viewModel.books[index].status = status.name
                }
                viewModel.markDirty(field: "status", for: bookId)
            },
        )
    }

    private var lastReadDisplay: String {
        StorytellerDate.dateTimeWithZone(
            StorytellerDate.parse(book?.originalMetadata.position?.updatedAt, field: .lastRead)
        )
    }

    // The rating endpoints are per-user and save on their own, so this field stays outside the
    // editor's dirty/save pipeline.
    private func personalRatingField() -> some View {
        fieldRow(label: "User Rating", isEditable: false) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    ThemedRatingStars(
                        value: personalRating.starRating,
                        fillColor: Color.accentColor,
                        emptyColor: Color.accentColor.opacity(0.3),
                        resetToken: personalRating.saveGeneration,
                    ) { value in
                        Task { await personalRating.setStarRating(value) }
                    }

                    if let stars = personalRating.starRating {
                        Text(UserBookRating.format(stars))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Not rated")
                            .foregroundStyle(.secondary)
                    }

                    if let average = personalRating.dimensionAverage {
                        Text("Detailed \(UserBookRating.format(average))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if personalRating.isSaving {
                        ProgressView()
                            .controlSize(.small)
                    }

                    Button("Rate & Review...") { showingRatingEditor = true }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.accentColor)
                        .controlSize(.small)
                }

                if let errorMessage = personalRating.errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(8)
            .metadataEditorBoundary()
        }
    }

    private func personalReviewField() -> some View {
        fieldRow(
            label: "User Review",
            isEditable: false,
            labelAlignment: .top,
            labelTopPadding: 8,
        ) {
            Text(personalRating.review ?? "(empty)")
                .foregroundStyle(personalRating.review == nil ? .secondary : .primary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
                .padding(8)
                .metadataEditorBoundary()
        }
    }

    private func textAreaField(_ label: String, field: String, text: Binding<String>) -> some View {
        editableFieldShell(label: label, field: field, labelAlignment: .top) {
            TextEditor(
                text: Binding(
                    get: { text.wrappedValue },
                    set: { newValue in
                        text.wrappedValue = newValue
                        viewModel.markDirty(field: field, for: bookId)
                    },
                )
            )
            .font(.body)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 280)
            .metadataEditorBoundary()
        }
    }

    private func readOnlyField(_ label: String, value: String) -> some View {
        fieldRow(label: label, isEditable: false) {
            Text(value.isEmpty ? "(empty)" : value)
                .foregroundStyle(value.isEmpty ? .secondary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .metadataEditorBoundary()
        }
    }

    private func hardcoverSlugField() -> some View {
        fieldRow(label: "Hardcover Slug", isEditable: false) {
            Group {
                if let url = hardcoverSlugURL {
                    HStack(spacing: 6) {
                        Link(hardcoverSlug, destination: url)
                        Button {
                            copyToPasteboard(url.absoluteString)
                        } label: {
                            Image(systemName: "doc.on.doc")
                        }
                        .buttonStyle(.borderless)
                        .help("Copy Hardcover URL")
                    }
                } else {
                    Text(hardcoverSlug)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .metadataEditorBoundary()
        }
    }

    private func copyToPasteboard(_ value: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #endif
    }

    private func editableFieldShell<Content: View>(
        label: String,
        field: String,
        labelAlignment: VerticalAlignment = .firstTextBaseline,
        labelTopPadding: CGFloat = 0,
        @ViewBuilder content: () -> Content,
    ) -> some View {
        fieldRow(
            label: label,
            field: field,
            isEditable: true,
            labelAlignment: labelAlignment,
            labelTopPadding: labelTopPadding,
            content: content,
        )
    }

    @ViewBuilder
    private func fieldRow<Content: View>(
        label: String,
        field: String = "",
        isEditable: Bool,
        labelAlignment: VerticalAlignment = .firstTextBaseline,
        labelTopPadding: CGFloat = 0,
        @ViewBuilder content: () -> Content,
    ) -> some View {
        if isCompactIOS {
            VStack(alignment: .leading, spacing: 6) {
                if isEditable {
                    editableFieldLabel(label: label, field: field)
                } else {
                    fieldLabel(label)
                }
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(alignment: labelAlignment, spacing: 10) {
                if isEditable {
                    editableFieldLabel(label: label, field: field)
                        .padding(.top, labelTopPadding)
                } else {
                    fieldLabel(label)
                        .padding(.top, labelTopPadding)
                }
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func editableFieldLabel(label: String, field: String) -> some View {
        DirtyFieldHeading(
            label: label,
            isDirty: viewModel.isDirty(field: field, for: bookId),
            diff: viewModel.fieldDiffDisplay(field: field, for: bookId),
            leadingAligned: isCompactIOS,
            revertAction: {
                viewModel.revertFieldToOriginal(field: field, for: bookId)
            },
        )
        .frame(width: isCompactIOS ? nil : 132, alignment: isCompactIOS ? .leading : .trailing)
    }

    private func fieldLabel(_ label: String) -> some View {
        Text(label + ":")
            .frame(width: isCompactIOS ? nil : 132, alignment: isCompactIOS ? .leading : .trailing)
            .foregroundStyle(.primary)
    }

    private func expandedStringListField(
        _ label: String,
        field: String,
        suggestions: [String] = [],
    ) -> some View {
        editableFieldShell(label: label, field: field, labelAlignment: .top, labelTopPadding: 8) {
            let values = stringListBinding(field: field)
            VStack(alignment: .leading, spacing: 5) {
                ExpandedStringListEditor(
                    values: values,
                    placeholder: label,
                    suggestions: suggestions,
                    onChange: { viewModel.markDirty(field: field, for: bookId) },
                )
                .id("\(bookId).\(field)")

                if field == "tags", !values.wrappedValue.isEmpty {
                    Button("Remove all tags") {
                        values.wrappedValue = []
                        viewModel.markDirty(field: field, for: bookId)
                    }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .help("Remove every tag from this book")
                }
            }
        }
    }

    private func stringListBinding(field: String) -> Binding<[String]> {
        Binding(
            get: { viewModel.books.first { $0.id == bookId }?.stringList(for: field) ?? [] },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                switch field {
                    case "authors": viewModel.books[index].authors = newValue
                    case "narrators": viewModel.books[index].narrators = newValue
                    case "tags": viewModel.books[index].tags = newValue
                    default: break
                }
            },
        )
    }

    private func creatorsField() -> some View {
        editableFieldShell(
            label: "Other Creators",
            field: "creators",
            labelAlignment: .top,
            labelTopPadding: 8,
        ) {
            CreatorsExpandedEditor(
                creators: Binding(
                    get: { viewModel.books.first { $0.id == bookId }?.creators ?? [] },
                    set: { newValue in
                        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                        else { return }
                        viewModel.books[index].creators = newValue
                    },
                ),
                suggestionsByRole: viewModel.libraryCreatorNamesByRole,
                onChange: { viewModel.markDirty(field: "creators", for: bookId) },
            )
            .id("\(bookId).creators")
        }
    }

    private func seriesField() -> some View {
        editableFieldShell(
            label: "Series",
            field: "series",
            labelAlignment: .top,
            labelTopPadding: 8,
        ) {
            SeriesExpandedEditor(
                series: Binding(
                    get: { viewModel.books.first { $0.id == bookId }?.series ?? [] },
                    set: { newValue in
                        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                        else { return }
                        viewModel.books[index].series = newValue
                    },
                ),
                suggestions: librarySeriesNames,
                onChange: { viewModel.markDirty(field: "series", for: bookId) },
            )
            .id("\(bookId).series")
        }
    }

    private func identifiersField() -> some View {
        editableFieldShell(
            label: "Identifiers",
            field: "identifiers",
            labelAlignment: .top,
            labelTopPadding: 8,
        ) {
            Group {
                if let book, book.identifiersLoaded {
                    IdentifiersExpandedEditor(
                        identifiers: Binding(
                            get: {
                                viewModel.books.first { $0.id == bookId }?.identifiers ?? []
                            },
                            set: { newValue in
                                guard
                                    let index = viewModel.books.firstIndex(where: {
                                        $0.id == bookId
                                    })
                                else { return }
                                viewModel.books[index].identifiers = newValue
                            },
                        ),
                        types: viewModel.identifierTypesBySourceID[bookId.sourceID] ?? [],
                        scopes: availableIdentifierScopes,
                        onChange: { viewModel.markDirty(field: "identifiers", for: bookId) },
                        createType: { name, urlTemplate in
                            await viewModel.createIdentifierType(
                                named: name,
                                urlTemplate: urlTemplate,
                                sourceID: bookId.sourceID,
                            )
                        },
                        deleteType: { type in
                            await viewModel.deleteIdentifierType(type, sourceID: bookId.sourceID)
                        },
                        refreshTypes: {
                            await viewModel.refreshIdentifierTypes(for: bookId.sourceID)
                        },
                    )
                    .id("\(bookId).identifiers")
                } else if viewModel.identifierSupportBySourceID[bookId.sourceID] == false {
                    Text("Not supported by this server.")
                        .foregroundStyle(.secondary)
                        .italic()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .metadataEditorBoundary()
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .metadataEditorBoundary()
                }
            }
            .task(id: bookId) { await viewModel.loadIdentifiers(for: bookId) }
        }
    }

    private var availableIdentifierScopes: [MetadataEditorViewModel.EditableIdentifier.Scope] {
        var scopes: [MetadataEditorViewModel.EditableIdentifier.Scope] = [.book]
        if book?.originalMetadata.ebook?.uuid != nil { scopes.append(.ebook) }
        if book?.originalMetadata.audiobook?.uuid != nil { scopes.append(.audiobook) }
        if book?.originalMetadata.readaloud?.uuid != nil { scopes.append(.readaloud) }
        return scopes
    }

    private func collectionsField() -> some View {
        editableFieldShell(
            label: "Collections",
            field: "collections",
            labelAlignment: .top,
            labelTopPadding: 8,
        ) {
            CollectionsExpandedEditor(
                collectionUuids: Binding(
                    get: { book?.collectionUuids ?? [] },
                    set: { newValue in
                        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                        else { return }
                        viewModel.books[index].collectionUuids = newValue
                    },
                ),
                choices: viewModel.libraryCollectionChoices(for: bookId),
                namesByUuid: viewModel.libraryCollectionNamesByUuid(for: bookId),
                createCollection: { name in
                    await viewModel.createCollection(named: name, for: bookId) != nil
                },
                deleteCollection: { uuid in
                    await viewModel.deleteCollection(uuid: uuid, for: bookId)
                },
                refreshCollections: {
                    await viewModel.refreshLibraryCollectionsFromServer(for: bookId)
                },
                onChange: { viewModel.markDirty(field: "collections", for: bookId) },
            )
            .id("\(bookId).collections")
        }
    }

}

struct EditionMetadataLayout: View {
    enum EditionScope {
        case audiobook
        case ebook

        var title: String {
            switch self {
                case .audiobook: return "Audiobook Edition"
                case .ebook: return "Ebook Edition"
            }
        }

        var coverScope: MetadataCoverScope {
            switch self {
                case .audiobook: return .audiobook
                case .ebook: return .ebook
            }
        }
    }

    let bookId: BookID
    @Bindable var viewModel: MetadataEditorViewModel
    let scope: EditionScope
    @Binding var selectedCoverScope: MetadataCoverScope
    let openHardcoverImport: () -> Void
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showCoverPicker = false
    @State private var showCoverDiff = false

    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        GeometryReader { proxy in
            let horizontalPadding: CGFloat = 24
            let columnSpacing: CGFloat = 32
            let contentWidth = max(proxy.size.width - (horizontalPadding * 2), 0)
            ScrollView {
                if proxy.size.width < 980 {
                    VStack(alignment: .leading, spacing: 24) {
                        editionDetailsColumn
                        coverManagementColumn
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.vertical, 24)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                } else {
                    let detailsWidth = max((contentWidth - columnSpacing) * 0.62, 0)
                    let coverWidth = max(contentWidth - columnSpacing - detailsWidth, 0)
                    HStack(alignment: .top, spacing: columnSpacing) {
                        editionDetailsColumn
                            .frame(width: detailsWidth, alignment: .topLeading)

                        coverManagementColumn
                            .frame(width: coverWidth, alignment: .top)
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.vertical, 24)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            .scrollIndicators(.visible)
        }
        .onAppear {
            selectedCoverScope = scope.coverScope
            loadScopedCover()
        }
        .onChange(of: scope.coverScope) {
            loadScopedCover()
        }
        #if canImport(UniformTypeIdentifiers)
        .fileImporter(
            isPresented: $showCoverPicker,
            allowedContentTypes: [.png, .jpeg, .webP, .heic],
            onCompletion: handleCoverPick,
        )
        #endif
    }

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }

    private var originalMetadata: BookMetadata? {
        book?.originalMetadata
    }

    private var replacementCover: (data: Data, filename: String)? {
        switch scope {
            case .audiobook: return book?.replacementAudiobookCover
            case .ebook: return book?.replacementEbookCover
        }
    }

    private var currentServerCover: Image? {
        originalMetadata.flatMap {
            mediaViewModel.coverState(for: $0, variant: scope.coverScope.variant).image
        }
    }

    private var coverResolution: String? {
        if let data = replacementCover?.data {
            return resolutionString(from: data)
        }

        guard let metadata = originalMetadata else { return nil }
        #if canImport(AppKit)
        let state = mediaViewModel.coverState(for: metadata, variant: scope.coverScope.variant)
        guard let nsImage = state.nsImage, let rep = nsImage.representations.first else {
            return nil
        }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #else
        return nil
        #endif
    }

    private var editionDetailsColumn: some View {
        editionGroup(scope.title) {
            switch scope {
                case .audiobook:
                    audiobookFields
                case .ebook:
                    ebookFields
            }
        }
    }

    private var audiobookFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            unsupportedEditionField(
                "Edition Title",
                value: "Audiobook Edition",
                note: "(not editable by Storyteller yet)",
            )
            unsupportedEditionField(
                "Edition Subtitle",
                value: book?.subtitle ?? "",
                note: "(not editable by Storyteller yet)",
            )
            unsupportedEditionField(
                "Edition Nickname",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            editionChipList("Narrator(s)", field: "narrators")
            unsupportedEditionField(
                "Additional Creators",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            editionPublicationDateField()
            unsupportedEditionField(
                "Publisher",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            unsupportedEditionField(
                "Language",
                value: book?.language ?? "",
                note: "(not editable by Storyteller yet)",
            )
            editionIdentifiersField(.audiobook)
        }
    }

    private var ebookFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            unsupportedEditionField(
                "Edition Title",
                value: "Ebook Edition",
                note: "(not editable by Storyteller yet)",
            )
            unsupportedEditionField(
                "Edition Subtitle",
                value: book?.subtitle ?? "",
                note: "(not editable by Storyteller yet)",
            )
            unsupportedEditionField(
                "Edition Nickname",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            unsupportedEditionField(
                "Additional Creators",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            editionPublicationDateField()
            unsupportedEditionField(
                "Publisher",
                value: "Not exposed by Storyteller yet",
                isPlaceholder: true,
            )
            unsupportedEditionField(
                "Language",
                value: book?.language ?? "",
                note: "(not editable by Storyteller yet)",
            )
            editionIdentifiersField(.ebook)
        }
    }

    private func editionIdentifiersField(
        _ scope: MetadataEditorViewModel.EditableIdentifier.Scope
    ) -> some View {
        let values = book?.identifiers(scope: scope).map(\.displayText) ?? []
        return unsupportedEditionField(
            "Identifier(s)",
            value: values.joined(separator: ", "),
            placeholder: "(none)",
            note: "(edit in the Work tab)",
        )
    }

    private var coverManagementColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            coverArtHeading
                .padding(.bottom, 2)
                .popover(isPresented: $showCoverDiff, arrowEdge: .trailing) {
                    coverDiffPopover
                }
            VStack(alignment: .center, spacing: 8) {
                coverPreview

                HStack(spacing: 10) {
                    Button("Replace from File...") {
                        showCoverPicker = true
                    }
                }

                if let coverResolution {
                    Text(coverResolution)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if originalMetadata?.hasAvailableEbook == true,
                    originalMetadata?.hasAvailableAudiobook == true
                {
                    Divider()
                        .padding(.vertical, 1)
                    VStack(spacing: 5) {
                        Text("Storyteller Classic Preview")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let metadata = originalMetadata {
                            StagedDoubleCoverPreview(
                                item: metadata,
                                audiobookReplacement: book?.replacementAudiobookCover?.data,
                                ebookReplacement: book?.replacementEbookCover?.data,
                                placeholderColor: Color.secondary.opacity(0.18),
                                coverWidth: classicPreviewWidth,
                                containerAspectRatio: CoverPreference.storytellerDouble
                                    .preferredContainerAspectRatio,
                                cornerRadius: 6,
                                mediaViewModel: mediaViewModel,
                            )
                            .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private var coverArtHeading: some View {
        HStack(spacing: 4) {
            if replacementCover != nil {
                Button(action: handleCoverDirtyClick) {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title3)
                        .foregroundStyle(metadataEditorChangeColor(for: colorScheme))
                }
                .buttonStyle(.borderless)
                .help(showCoverDiff ? "Revert cover art" : "Show cover art changes")
            }

            Text("Cover Art")
                .font(.title3.weight(.semibold))
                .foregroundStyle(
                    replacementCover == nil
                        ? Color.primary : metadataEditorChangeColor(for: colorScheme)
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: handleCoverDirtyClick)
                .onTapGesture(count: 2) {
                    clearReplacementCover()
                    showCoverDiff = false
                }
                .help(replacementCover == nil ? "" : "Show cover art changes")
        }
    }

    private func handleCoverDirtyClick() {
        guard replacementCover != nil else { return }
        if showCoverDiff {
            clearReplacementCover()
            showCoverDiff = false
        } else {
            showCoverDiff = true
        }
    }

    private var coverDiffPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Cover Art")
                    .font(.headline)
                Spacer()
                Button("Revert Field") {
                    clearReplacementCover()
                    showCoverDiff = false
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Text("Original to Current")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(alignment: .top, spacing: 14) {
                coverDiffImage(title: "Original", data: nil, image: currentServerCover)
                coverDiffImage(
                    title: "Current",
                    data: replacementCover?.data,
                    image: currentServerCover,
                )
            }
        }
        .padding()
        .frame(width: 440)
    }

    private func coverDiffImage(title: String, data: Data?, image: Image?) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.secondary.opacity(0.1))
                if let data {
                    dataImage(data)
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .padding(6)
                } else if let image {
                    image
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .padding(6)
                } else {
                    Image(systemName: "photo")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 190, height: scope.coverScope == .audiobook ? 190 : 230)
            .metadataEditorBoundary(cornerRadius: 6)
        }
    }

    private func editionGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
        -> some View
    {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.title3.weight(.semibold))
                .padding(.bottom, 2)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private var coverPreview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.secondary.opacity(0.12))

            if let data = replacementCover?.data {
                dataImage(data)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else if let currentServerCover {
                currentServerCover
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                    Text("No cover art")
                        .font(.caption)
                }
                .foregroundStyle(.secondary)
            }
        }
        .frame(
            width: primaryCoverSize.width,
            height: primaryCoverSize.height,
        )
        .metadataEditorBoundary(cornerRadius: 8)
    }

    private var primaryCoverSize: CGSize {
        switch scope {
            case .audiobook:
                return CGSize(width: 205, height: 205)
            case .ebook:
                return CGSize(width: 150, height: 225)
        }
    }

    private var classicPreviewWidth: CGFloat {
        switch scope {
            case .audiobook: return 96
            case .ebook: return 84
        }
    }

    private func editionPublicationDateField() -> some View {
        let dateString = viewModel.books.first { $0.id == bookId }?.publicationDate ?? ""
        let hasDate = !dateString.isEmpty
        return editionFieldRow(label: "Release Date", field: "", isEditable: false) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    #if os(macOS)
                    MetadataEditorDatePicker(
                        selection: Binding(
                            get: {
                                StorytellerDate.calendarDay(dateString) ?? Date()
                            },
                            set: { _ in },
                        )
                    )
                    .frame(width: 156)
                    #else
                    DatePicker(
                        "",
                        selection: Binding(
                            get: {
                                StorytellerDate.calendarDay(dateString) ?? Date()
                            },
                            set: { _ in },
                        ),
                        displayedComponents: .date,
                    )
                    .labelsHidden()
                    #endif

                    Toggle("No date", isOn: .constant(!hasDate))
                        #if os(macOS)
                    .toggleStyle(.checkbox)
                        #endif

                    if !isCompactIOS {
                        Text("(not editable by Storyteller yet)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }

                if isCompactIOS {
                    Text("(not editable by Storyteller yet)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .disabled(true)
            .padding(8)
            .metadataEditorBoundary()
        }
    }

    private func editionChipList(_ label: String, field: String) -> some View {
        editionFieldRow(label: label, field: field, alignment: .top) {
            ExpandedStringListEditor(
                values: Binding(
                    get: {
                        viewModel.books.first { $0.id == bookId }?.stringList(for: field) ?? []
                    },
                    set: { newValue in
                        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId })
                        else { return }
                        switch field {
                            case "narrators": viewModel.books[index].narrators = newValue
                            default: break
                        }
                    },
                ),
                placeholder: label,
                suggestions: editionSuggestions(for: field),
                onChange: { viewModel.markDirty(field: field, for: bookId) },
            )
            .id("\(bookId).\(scope.title).\(field)")
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func editionSuggestions(for field: String) -> [String] {
        switch field {
            case "narrators": return viewModel.libraryNarratorNames
            default: return []
        }
    }

    private func unsupportedEditionField(
        _ label: String,
        value: String,
        placeholder: String? = nil,
        isPlaceholder: Bool = false,
        note: String? = nil,
    ) -> some View {
        editionFieldRow(label: label, field: "", isEditable: false) {
            HStack(spacing: 10) {
                Text(value.isEmpty ? (placeholder ?? "(empty)") : value)
                    .foregroundStyle(.secondary)
                    .italic(value.isEmpty || isPlaceholder)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if let note {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .metadataEditorFieldBoundary()
        }
    }

    @ViewBuilder
    private func editionFieldRow<Content: View>(
        label: String,
        field: String,
        isEditable: Bool = true,
        alignment: VerticalAlignment = .firstTextBaseline,
        @ViewBuilder content: () -> Content,
    ) -> some View {
        if isCompactIOS {
            VStack(alignment: .leading, spacing: 6) {
                editionFieldLabel(label: label, field: field, isEditable: isEditable)
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(alignment: alignment, spacing: 10) {
                editionFieldLabel(label: label, field: field, isEditable: isEditable)
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func editionFieldLabel(label: String, field: String, isEditable: Bool = true)
        -> some View
    {
        HStack(spacing: 4) {
            if isEditable, viewModel.isDirty(field: field, for: bookId) {
                Button {
                    viewModel.revertFieldToOriginal(field: field, for: bookId)
                } label: {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title3)
                        .foregroundStyle(metadataEditorChangeColor(for: colorScheme))
                }
                .buttonStyle(.borderless)
                .help("Revert \(label.lowercased())")
            }
            Text(label + ":")
                .foregroundStyle(isEditable ? Color.primary : Color.secondary)
        }
        .frame(width: isCompactIOS ? nil : 144, alignment: .leading)
    }

    private func loadScopedCover() {
        guard let originalMetadata else { return }
        mediaViewModel.ensureCoverLoaded(for: originalMetadata, variant: .standard)
        mediaViewModel.ensureCoverLoaded(for: originalMetadata, variant: .audioSquare)
    }

    private func handleCoverPick(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        guard let data = try? Data(contentsOf: url),
            let index = viewModel.books.firstIndex(where: { $0.id == bookId })
        else { return }

        switch scope {
            case .audiobook:
                viewModel.books[index].replacementAudiobookCover = (
                    data: data, filename: url.lastPathComponent,
                )
            case .ebook:
                viewModel.books[index].replacementEbookCover = (
                    data: data, filename: url.lastPathComponent,
                )
        }
    }

    private func clearReplacementCover() {
        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
        switch scope {
            case .audiobook:
                viewModel.books[index].replacementAudiobookCover = nil
            case .ebook:
                viewModel.books[index].replacementEbookCover = nil
        }
    }

    private func dataImage(_ data: Data) -> Image {
        #if canImport(AppKit)
        if let nsImage = NSImage(data: data) {
            return Image(nsImage: nsImage)
        }
        #elseif canImport(UIKit)
        if let uiImage = UIImage(data: data) {
            return Image(uiImage: uiImage)
        }
        #endif
        return Image(systemName: "photo")
    }

    private func resolutionString(from data: Data) -> String? {
        #if canImport(AppKit)
        guard let image = NSImage(data: data),
            let rep = image.representations.first
        else { return nil }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #elseif canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        return "\(Int(image.size.width * image.scale)) x \(Int(image.size.height * image.scale))"
        #else
        return nil
        #endif
    }
}

struct CoversMetadataLayout: View {
    let bookId: BookID
    @Bindable var viewModel: MetadataEditorViewModel
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }

    private var originalMetadata: BookMetadata? {
        book?.originalMetadata
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if isCompactIOS || proxy.size.width < 640 {
                        VStack(alignment: .leading, spacing: 28) {
                            coverPanels
                        }
                    } else {
                        HStack(alignment: .top, spacing: 32) {
                            coverPanels
                        }
                    }

                    classicPreviewSection
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .scrollIndicators(.visible)
        }
        .onAppear {
            guard let originalMetadata else { return }
            mediaViewModel.ensureCoverLoaded(for: originalMetadata, variant: .standard)
            mediaViewModel.ensureCoverLoaded(for: originalMetadata, variant: .audioSquare)
        }
    }

    @ViewBuilder
    private var coverPanels: some View {
        CoverEditPanel(bookId: bookId, viewModel: viewModel, coverScope: .audiobook)
            .frame(maxWidth: .infinity)
        CoverEditPanel(bookId: bookId, viewModel: viewModel, coverScope: .ebook)
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var classicPreviewSection: some View {
        if let metadata = originalMetadata {
            VStack(alignment: .leading, spacing: 5) {
                Text("Storyteller Classic Preview")
                    .font(.subheadline.weight(.semibold))
                StagedDoubleCoverPreview(
                    item: metadata,
                    audiobookReplacement: book?.replacementAudiobookCover?.data,
                    ebookReplacement: book?.replacementEbookCover?.data,
                    placeholderColor: Color.secondary.opacity(0.18),
                    coverWidth: 96,
                    containerAspectRatio: CoverPreference.storytellerDouble
                        .preferredContainerAspectRatio,
                    cornerRadius: 6,
                    mediaViewModel: mediaViewModel,
                )
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }
}

private struct CoverEditPanel: View {
    let bookId: BookID
    @Bindable var viewModel: MetadataEditorViewModel
    let coverScope: MetadataCoverScope
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var showCoverPicker = false
    @State private var showCoverDiff = false

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }

    private var originalMetadata: BookMetadata? {
        book?.originalMetadata
    }

    private var replacementCover: (data: Data, filename: String)? {
        coverScope.isAudio ? book?.replacementAudiobookCover : book?.replacementEbookCover
    }

    private var currentServerCover: Image? {
        originalMetadata.flatMap {
            mediaViewModel.coverState(for: $0, variant: coverScope.variant).image
        }
    }

    private var coverResolution: String? {
        if let data = replacementCover?.data {
            return resolutionString(from: data)
        }

        guard let metadata = originalMetadata else { return nil }
        #if canImport(AppKit)
        let state = mediaViewModel.coverState(for: metadata, variant: coverScope.variant)
        guard let nsImage = state.nsImage, let rep = nsImage.representations.first else {
            return nil
        }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #else
        return nil
        #endif
    }

    private var coverSize: CGSize {
        coverScope.isAudio
            ? CGSize(width: 205, height: 205)
            : CGSize(width: 150, height: 225)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading
                .padding(.bottom, 2)
                .popover(isPresented: $showCoverDiff, arrowEdge: .trailing) {
                    coverDiffPopover
                }

            VStack(alignment: .center, spacing: 8) {
                coverPreview

                Button("Replace from File...") {
                    showCoverPicker = true
                }

                if let coverResolution {
                    Text(coverResolution)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
        }
        #if canImport(UniformTypeIdentifiers)
        .fileImporter(
            isPresented: $showCoverPicker,
            allowedContentTypes: [.png, .jpeg, .webP, .heic],
            onCompletion: handleCoverPick,
        )
        #endif
    }

    private var heading: some View {
        HStack(spacing: 4) {
            if replacementCover != nil {
                Button(action: handleCoverDirtyClick) {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title3)
                        .foregroundStyle(metadataEditorChangeColor(for: colorScheme))
                }
                .buttonStyle(.borderless)
                .help(showCoverDiff ? "Revert cover art" : "Show cover art changes")
            }

            Text(coverScope.label)
                .font(.title3.weight(.semibold))
                .foregroundStyle(
                    replacementCover == nil
                        ? Color.primary : metadataEditorChangeColor(for: colorScheme)
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: handleCoverDirtyClick)
                .onTapGesture(count: 2) {
                    clearReplacementCover()
                    showCoverDiff = false
                }
                .help(replacementCover == nil ? "" : "Show cover art changes")
        }
    }

    private func handleCoverDirtyClick() {
        guard replacementCover != nil else { return }
        if showCoverDiff {
            clearReplacementCover()
            showCoverDiff = false
        } else {
            showCoverDiff = true
        }
    }

    private var coverPreview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.secondary.opacity(0.12))

            if let data = replacementCover?.data {
                dataImage(data)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else if let currentServerCover {
                currentServerCover
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                    Text("No cover art")
                        .font(.caption)
                }
                .foregroundStyle(.secondary)
            }
        }
        .frame(width: coverSize.width, height: coverSize.height)
        .metadataEditorBoundary(cornerRadius: 8)
    }

    private var coverDiffPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(coverScope.label)
                    .font(.headline)
                Spacer()
                Button("Revert Field") {
                    clearReplacementCover()
                    showCoverDiff = false
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Text("Original to Current")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(alignment: .top, spacing: 14) {
                coverDiffImage(title: "Original", data: nil, image: currentServerCover)
                coverDiffImage(
                    title: "Current",
                    data: replacementCover?.data,
                    image: currentServerCover,
                )
            }
        }
        .padding()
        .frame(width: 440)
    }

    private func coverDiffImage(title: String, data: Data?, image: Image?) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.secondary.opacity(0.1))
                if let data {
                    dataImage(data)
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .padding(6)
                } else if let image {
                    image
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .padding(6)
                } else {
                    Image(systemName: "photo")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 190, height: coverScope.isAudio ? 190 : 230)
            .metadataEditorBoundary(cornerRadius: 6)
        }
    }

    private func handleCoverPick(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        guard let data = try? Data(contentsOf: url),
            let index = viewModel.books.firstIndex(where: { $0.id == bookId })
        else { return }

        if coverScope.isAudio {
            viewModel.books[index].replacementAudiobookCover = (
                data: data, filename: url.lastPathComponent,
            )
        } else {
            viewModel.books[index].replacementEbookCover = (
                data: data, filename: url.lastPathComponent,
            )
        }
    }

    private func clearReplacementCover() {
        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
        if coverScope.isAudio {
            viewModel.books[index].replacementAudiobookCover = nil
        } else {
            viewModel.books[index].replacementEbookCover = nil
        }
    }

    private func dataImage(_ data: Data) -> Image {
        #if canImport(AppKit)
        if let nsImage = NSImage(data: data) {
            return Image(nsImage: nsImage)
        }
        #elseif canImport(UIKit)
        if let uiImage = UIImage(data: data) {
            return Image(uiImage: uiImage)
        }
        #endif
        return Image(systemName: "photo")
    }

    private func resolutionString(from data: Data) -> String? {
        #if canImport(AppKit)
        guard let image = NSImage(data: data),
            let rep = image.representations.first
        else { return nil }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #elseif canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        return "\(Int(image.size.width * image.scale)) x \(Int(image.size.height * image.scale))"
        #else
        return nil
        #endif
    }
}

private struct StagedDoubleCoverPreview: View {
    let item: BookMetadata
    let audiobookReplacement: Data?
    let ebookReplacement: Data?
    let placeholderColor: Color
    let coverWidth: CGFloat
    let containerAspectRatio: CGFloat
    let cornerRadius: CGFloat
    let mediaViewModel: MediaViewModel

    var body: some View {
        let containerHeight = coverWidth / containerAspectRatio
        let scale: CGFloat = 0.80
        let scaledWidth = coverWidth * scale
        let ebookHeight = scaledWidth / 0.67
        let audioSize = scaledWidth
        let xShift = coverWidth * 0.10

        ZStack {
            coverImage(
                data: audiobookReplacement,
                fallback: mediaViewModel.coverImage(for: item, variant: .audioSquare),
            )
            .frame(width: audioSize, height: audioSize)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius * 0.8, style: .continuous))
            .stableCoverRendering()
            .offset(x: xShift)
            .zIndex(10)

            coverImage(
                data: ebookReplacement,
                fallback: mediaViewModel.coverImage(for: item, variant: .standard),
            )
            .frame(width: scaledWidth, height: ebookHeight)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius * 0.8, style: .continuous))
            .stableCoverRendering()
            .offset(x: -xShift)
            .zIndex(20)
        }
        .frame(width: coverWidth, height: containerHeight)
        .task {
            mediaViewModel.ensureCoverLoaded(for: item, variant: .standard)
            mediaViewModel.ensureCoverLoaded(for: item, variant: .audioSquare)
        }
    }

    @ViewBuilder
    private func coverImage(data: Data?, fallback: Image?) -> some View {
        if let data {
            dataImage(data)
                .resizable()
                .interpolation(.high)
                .scaledToFill()
        } else if let fallback {
            fallback
                .resizable()
                .interpolation(.high)
                .scaledToFill()
        } else {
            placeholderColor
        }
    }

    private func dataImage(_ data: Data) -> Image {
        #if canImport(AppKit)
        if let nsImage = NSImage(data: data) {
            return Image(nsImage: nsImage)
        }
        #elseif canImport(UIKit)
        if let uiImage = UIImage(data: data) {
            return Image(uiImage: uiImage)
        }
        #endif
        return Image(systemName: "photo")
    }
}

private struct DirtyFieldHeading: View {
    let label: String
    let isDirty: Bool
    let diff: MetadataEditorViewModel.FieldDiffDisplay?
    var leadingAligned = false
    let revertAction: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var showsDiff = false

    var body: some View {
        HStack(spacing: 4) {
            if !leadingAligned {
                Spacer(minLength: 0)
            }
            if isDirty {
                Button(action: handleDirtyClick) {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title3)
                        .foregroundStyle(metadataEditorChangeColor(for: colorScheme))
                }
                .buttonStyle(.borderless)
                .help(
                    showsDiff
                        ? "Revert \(label.lowercased())" : "Show \(label.lowercased()) changes"
                )
            }

            Text(label + ":")
                .foregroundStyle(
                    isDirty ? metadataEditorChangeColor(for: colorScheme) : Color.primary
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: handleDirtyClick)
                .help(
                    isDirty
                        ? (showsDiff
                            ? "Revert \(label.lowercased())" : "Show \(label.lowercased()) changes")
                        : ""
                )
        }
        .popover(isPresented: $showsDiff, arrowEdge: .trailing) {
            FieldDiffPopover(label: label, diff: diff) {
                revertAction()
                showsDiff = false
            }
        }
    }

    private func handleDirtyClick() {
        guard isDirty else { return }
        if showsDiff {
            revertAction()
            showsDiff = false
        } else {
            showsDiff = true
        }
    }
}

private struct FieldDiffPopover: View {
    let label: String
    let diff: MetadataEditorViewModel.FieldDiffDisplay?
    let revertAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(label)
                    .font(.headline)
                Spacer()
                Button("Revert Field", action: revertAction)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
            Text("Original to Current")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView {
                if let diff {
                    WordDiffView(oldText: diff.original, newText: diff.current)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .metadataEditorBoundary()
                } else {
                    Text("No diff is available for this field.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .metadataEditorBoundary()
                }
            }
            .frame(width: 420)
            .frame(maxHeight: 260)
        }
        .padding(12)
    }
}

struct ExpandedStringListEditor: View {
    @Binding var values: [String]
    let placeholder: String
    var suggestions: [String] = []
    let onChange: () -> Void
    @State private var draft = ""
    @State private var showsAutocomplete = false
    @State private var selectedSuggestionIndex: Int?
    @FocusState private var draftIsFocused: Bool

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var availableSuggestions: [String] {
        let existing = Set(values.map { $0.lowercased() })
        let query = trimmedDraft.lowercased()
        return suggestions.filter { suggestion in
            let lowercasedSuggestion = suggestion.lowercased()
            return !existing.contains(lowercasedSuggestion)
                && (query.isEmpty || lowercasedSuggestion.hasPrefix(query))
        }
    }

    private var displayedSuggestions: [String] {
        Array(availableSuggestions.prefix(10))
    }

    private var autocompleteHeight: CGFloat {
        autocompletePopoverHeight(rowCount: displayedSuggestions.count)
    }

    private var autocompleteIsPresented: Binding<Bool> {
        Binding(
            get: {
                showsAutocomplete && draftIsFocused && !trimmedDraft.isEmpty
                    && !availableSuggestions.isEmpty
            },
            set: { isPresented in
                if !isPresented {
                    showsAutocomplete = false
                    selectedSuggestionIndex = nil
                }
            },
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MetadataEditorFlowLayout(horizontalSpacing: 8, verticalSpacing: 8) {
                ForEach(Array(values.enumerated()), id: \.offset) { index, _ in
                    HStack(spacing: 8) {
                        let value = index < values.count ? values[index] : ""
                        Text(value)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: 260, alignment: .leading)
                            .help(value)

                        Button {
                            guard index < values.count else { return }
                            values.remove(at: index)
                            onChange()
                        } label: {
                            Image(systemName: "minus.circle")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.borderless)
                        .help("Remove \(placeholder.lowercased())")
                    }
                    .fullTextPill()
                }

                HStack(spacing: 8) {
                    TextField("Add \(placeholder.lowercased())", text: $draft)
                        .textFieldStyle(.plain)
                        .focused($draftIsFocused)
                        .onSubmit { submitDraft() }
                        .onChange(of: draftIsFocused) { _, isFocused in
                            if !isFocused {
                                showsAutocomplete = false
                                selectedSuggestionIndex = nil
                            }
                        }
                        .onChange(of: draft) { _, _ in
                            selectedSuggestionIndex = nil
                            if draftIsFocused && !trimmedDraft.isEmpty {
                                showsAutocomplete = true
                            } else {
                                showsAutocomplete = false
                            }
                        }
                        .frame(minWidth: 160)
                        .fixedSize(horizontal: true, vertical: false)
                        .popover(isPresented: autocompleteIsPresented, arrowEdge: .bottom) {
                            autocompleteSuggestions
                                .metadataEditorCompactPopover()
                        }
                        .onKeyPress(.tab) {
                            guard !trimmedDraft.isEmpty,
                                let suggestion = selectedSuggestion ?? displayedSuggestions.first
                            else {
                                return .ignored
                            }
                            append(suggestion)
                            return .handled
                        }
                        .onKeyPress(.upArrow) {
                            guard !displayedSuggestions.isEmpty, !trimmedDraft.isEmpty else {
                                return .ignored
                            }
                            showsAutocomplete = true
                            moveSelection(delta: -1)
                            return .handled
                        }
                        .onKeyPress(.downArrow) {
                            guard !displayedSuggestions.isEmpty, !trimmedDraft.isEmpty else {
                                return .ignored
                            }
                            showsAutocomplete = true
                            moveSelection(delta: 1)
                            return .handled
                        }

                    if !availableSuggestions.isEmpty {
                        ScrollableStringPickerButton(
                            title: "Choose \(placeholder.lowercased())",
                            systemImage: "text.badge.plus",
                            values: availableSuggestions,
                            help: "Choose existing \(placeholder.lowercased())",
                            onSelect: append,
                        )
                    }

                    Button {
                        append(draft)
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .buttonStyle(.borderless)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .fullTextPill()
                .metadataEditorAutocompleteExitCommand(active: showsAutocomplete) {
                    showsAutocomplete = false
                }
            }
        }
        .padding(8)
        .metadataEditorBoundary()
    }

    private var autocompleteSuggestions: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(Array(displayedSuggestions.enumerated()), id: \.element) {
                    index,
                    suggestion in
                    Button {
                        append(suggestion)
                        showsAutocomplete = false
                        draftIsFocused = true
                    } label: {
                        Text(suggestion)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background {
                        if selectedSuggestionIndex == index {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.accentColor.opacity(0.18))
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
        }
        .frame(width: 224)
        .frame(height: autocompleteHeight)
        .padding(8)
    }

    private func append(_ rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            draft = ""
            showsAutocomplete = false
            selectedSuggestionIndex = nil
            return
        }
        values.append(trimmed)
        draft = ""
        showsAutocomplete = false
        selectedSuggestionIndex = nil
        onChange()
    }

    private func submitDraft() {
        if let selectedSuggestion {
            append(selectedSuggestion)
        } else {
            append(draft)
        }
    }

    private var selectedSuggestion: String? {
        guard let selectedSuggestionIndex,
            displayedSuggestions.indices.contains(selectedSuggestionIndex)
        else {
            return nil
        }
        return displayedSuggestions[selectedSuggestionIndex]
    }

    private func moveSelection(delta: Int) {
        guard !displayedSuggestions.isEmpty else {
            selectedSuggestionIndex = nil
            return
        }
        let currentIndex = selectedSuggestionIndex ?? (delta > 0 ? -1 : displayedSuggestions.count)
        let nextIndex =
            (currentIndex + delta + displayedSuggestions.count)
            % displayedSuggestions.count
        selectedSuggestionIndex = nextIndex
    }
}

private struct CreatorNameAutocompleteField: View {
    @Binding var name: String
    let suggestions: [String]
    let placeholder: String
    var onSubmit: (() -> Void)? = nil
    @State private var showsAutocomplete = false
    @State private var selectedSuggestionIndex: Int?
    @FocusState private var isFocused: Bool

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasSuggestions: Bool {
        !suggestions.isEmpty
    }

    private var filteredSuggestions: [String] {
        let query = trimmedName.lowercased()
        guard hasSuggestions else { return [] }
        return suggestions.filter { suggestion in
            query.isEmpty || suggestion.lowercased().hasPrefix(query)
        }
    }

    private var displayedSuggestions: [String] {
        Array(filteredSuggestions.prefix(10))
    }

    private var autocompleteHeight: CGFloat {
        autocompletePopoverHeight(rowCount: displayedSuggestions.count)
    }

    private var autocompleteIsPresented: Binding<Bool> {
        Binding(
            get: {
                showsAutocomplete && isFocused && !trimmedName.isEmpty
                    && !filteredSuggestions.isEmpty
            },
            set: { isPresented in
                if !isPresented {
                    showsAutocomplete = false
                    selectedSuggestionIndex = nil
                }
            },
        )
    }

    var body: some View {
        HStack(spacing: 8) {
            TextField(placeholder, text: $name)
                .textFieldStyle(.plain)
                .focused($isFocused)
                .onSubmit {
                    submitName()
                }
                .onChange(of: isFocused) { _, isFocused in
                    if !isFocused {
                        showsAutocomplete = false
                        selectedSuggestionIndex = nil
                    }
                }
                .onChange(of: name) { _, _ in
                    selectedSuggestionIndex = nil
                    if isFocused && !trimmedName.isEmpty {
                        showsAutocomplete = true
                    } else {
                        showsAutocomplete = false
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .popover(isPresented: autocompleteIsPresented, arrowEdge: .bottom) {
                    autocompleteSuggestions
                        .metadataEditorCompactPopover()
                }
                .onKeyPress(.tab) {
                    guard !trimmedName.isEmpty,
                        let suggestion = selectedSuggestion ?? displayedSuggestions.first
                    else {
                        return .ignored
                    }
                    selectSuggestion(suggestion)
                    return .handled
                }
                .onKeyPress(.upArrow) {
                    guard !displayedSuggestions.isEmpty, !trimmedName.isEmpty else {
                        return .ignored
                    }
                    showsAutocomplete = true
                    moveSelection(delta: -1)
                    return .handled
                }
                .onKeyPress(.downArrow) {
                    guard !displayedSuggestions.isEmpty, !trimmedName.isEmpty else {
                        return .ignored
                    }
                    showsAutocomplete = true
                    moveSelection(delta: 1)
                    return .handled
                }

            if hasSuggestions {
                ScrollableStringPickerButton(
                    title: "Choose \(placeholder.lowercased())",
                    systemImage: "text.badge.plus",
                    values: suggestions,
                    help: "Choose existing \(placeholder.lowercased()) for this role",
                    onSelect: selectSuggestion,
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .metadataEditorAutocompleteExitCommand(active: showsAutocomplete) {
            showsAutocomplete = false
        }
    }

    private var autocompleteSuggestions: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(Array(displayedSuggestions.enumerated()), id: \.element) {
                    index,
                    suggestion in
                    Button {
                        selectSuggestion(suggestion)
                        showsAutocomplete = false
                        isFocused = true
                    } label: {
                        Text(suggestion)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background {
                        if selectedSuggestionIndex == index {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.accentColor.opacity(0.18))
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
        }
        .frame(width: 224)
        .frame(height: autocompleteHeight)
        .padding(8)
    }

    private func selectSuggestion(_ suggestion: String) {
        name = suggestion
        showsAutocomplete = false
        selectedSuggestionIndex = nil
    }

    private func submitName() {
        if let selectedSuggestion {
            selectSuggestion(selectedSuggestion)
        } else {
            showsAutocomplete = false
            onSubmit?()
        }
    }

    private var selectedSuggestion: String? {
        guard let selectedSuggestionIndex,
            displayedSuggestions.indices.contains(selectedSuggestionIndex)
        else {
            return nil
        }
        return displayedSuggestions[selectedSuggestionIndex]
    }

    private func moveSelection(delta: Int) {
        guard !displayedSuggestions.isEmpty else {
            selectedSuggestionIndex = nil
            return
        }
        let currentIndex = selectedSuggestionIndex ?? (delta > 0 ? -1 : displayedSuggestions.count)
        let nextIndex =
            (currentIndex + delta + displayedSuggestions.count)
            % displayedSuggestions.count
        selectedSuggestionIndex = nextIndex
    }
}

struct CreatorsExpandedEditor: View {
    @Binding var creators: [MetadataEditorViewModel.EditableCreator]
    let suggestionsByRole: [String: [String]]
    let onChange: () -> Void
    @State private var draftName = ""
    @State private var draftRole = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(creators) { creator in
                HStack(spacing: 8) {
                    CreatorNameAutocompleteField(
                        name: creatorBinding(creator.id, \.name),
                        suggestions: suggestions(for: creator.role, excluding: creator.id),
                        placeholder: "Creator name",
                    )

                    MarcRelatorRoleEditor(role: creatorBinding(creator.id, \.role))
                        .frame(width: 92)

                    Button {
                        creators.removeAll { $0.id == creator.id }
                        onChange()
                    } label: {
                        Image(systemName: "minus.circle")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                }
                .fullTextPill()
            }

            HStack(spacing: 8) {
                CreatorNameAutocompleteField(
                    name: $draftName,
                    suggestions: suggestions(for: draftRole),
                    placeholder: "Add Creator",
                    onSubmit: appendDraftCreator,
                )

                MarcRelatorRoleEditor(role: $draftRole)
                    .frame(width: 92)

                Button {
                    appendDraftCreator()
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fullTextPill()
        }
        .padding(8)
        .metadataEditorBoundary()
    }

    private func suggestions(for role: String, excluding creatorId: UUID? = nil) -> [String] {
        let roleKey = MetadataEditorViewModel.creatorRoleSuggestionKey(role)
        let suggestions =
            if roleKey.isEmpty {
                allOtherCreatorSuggestions()
            } else {
                suggestionsByRole[roleKey] ?? []
            }
        guard !suggestions.isEmpty else { return [] }
        let existingNames = Set(
            creators.compactMap { creator -> String? in
                guard creator.id != creatorId else {
                    return nil
                }
                let creatorRoleKey = MetadataEditorViewModel.creatorRoleSuggestionKey(creator.role)
                if roleKey.isEmpty {
                    guard !MetadataEditorViewModel.isAuthorOrNarratorCreatorRole(creatorRoleKey)
                    else { return nil }
                } else {
                    guard creatorRoleKey == roleKey else { return nil }
                }
                let name = creator.name.trimmingCharacters(in: .whitespacesAndNewlines)
                return name.isEmpty ? nil : name.lowercased()
            }
        )
        return suggestions.filter { !existingNames.contains($0.lowercased()) }
    }

    private func allOtherCreatorSuggestions() -> [String] {
        var namesByKey: [String: String] = [:]
        for (roleKey, suggestions) in suggestionsByRole {
            guard !MetadataEditorViewModel.isAuthorOrNarratorCreatorRole(roleKey) else {
                continue
            }
            for suggestion in suggestions {
                let trimmed = suggestion.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let nameKey = trimmed.lowercased()
                if namesByKey[nameKey] == nil {
                    namesByKey[nameKey] = trimmed
                }
            }
        }
        return namesByKey.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func appendDraftCreator() {
        let name = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        creators.append(
            MetadataEditorViewModel.EditableCreator(
                name: name,
                fileAs: "",
                role: draftRole.trimmingCharacters(in: .whitespacesAndNewlines),
                uuid: nil,
            )
        )
        draftName = ""
        draftRole = ""
        onChange()
    }

    private func creatorBinding(
        _ id: UUID,
        _ keyPath: WritableKeyPath<MetadataEditorViewModel.EditableCreator, String>,
    ) -> Binding<String> {
        Binding(
            get: {
                creators.first { $0.id == id }?[keyPath: keyPath] ?? ""
            },
            set: { newValue in
                guard let index = creators.firstIndex(where: { $0.id == id }) else { return }
                creators[index][keyPath: keyPath] = newValue
                onChange()
            },
        )
    }
}

struct IdentifiersExpandedEditor: View {
    typealias EditableIdentifier = MetadataEditorViewModel.EditableIdentifier

    @Binding var identifiers: [EditableIdentifier]
    let types: [IdentifierType]
    let scopes: [EditableIdentifier.Scope]
    let onChange: () -> Void
    let createType: (String, String?) async -> Bool
    let deleteType: (IdentifierType) async -> Bool
    let refreshTypes: () async -> Void
    @State private var draftTypeUuid: String?
    @State private var draftValue = ""
    @State private var draftScope: EditableIdentifier.Scope = .book

    // Sentinel tag for rows whose imported type does not exist on the server yet.
    private static let pendingTag = "pending-type"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(identifiers) { identifier in
                HStack(spacing: 8) {
                    typePicker(for: identifier)
                    valueField(for: identifier)
                    scopePicker(for: identifier)
                    Button {
                        identifiers.removeAll { $0.id == identifier.id }
                        onChange()
                    } label: {
                        Image(systemName: "minus.circle")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                }
                .fullTextPill()
            }

            HStack(spacing: 8) {
                Picker("", selection: $draftTypeUuid) {
                    Text("Type").tag(String?.none)
                    ForEach(types) { type in
                        Text(type.name).tag(String?.some(type.uuid))
                    }
                }
                .labelsHidden()
                .fixedSize()

                TextField("Add Identifier", text: $draftValue)
                    .textFieldStyle(.plain)
                    .onSubmit(appendDraft)

                Picker("", selection: $draftScope) {
                    ForEach(scopes, id: \.self) { scope in
                        Text(scope.label).tag(scope)
                    }
                }
                .labelsHidden()
                .fixedSize()

                Button {
                    appendDraft()
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(
                    draftTypeUuid == nil
                        || draftValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fullTextPill()

            ManageIdentifiersButton(
                types: types,
                createType: createType,
                deleteType: deleteType,
                refreshTypes: refreshTypes,
            )
            .help("Manage identifier types on the Storyteller server")
        }
        .padding(8)
        .metadataEditorBoundary()
    }

    private func typePicker(for identifier: EditableIdentifier) -> some View {
        Picker("", selection: typeSelectionBinding(identifier.id)) {
            if identifier.typeUuid == nil {
                Text("\(identifier.typeName) (new)").tag(Self.pendingTag)
            }
            ForEach(types) { type in
                Text(type.name).tag(type.uuid)
            }
        }
        .labelsHidden()
        .fixedSize()
    }

    private func valueField(for identifier: EditableIdentifier) -> some View {
        TextField(
            "Value",
            text: identifierBinding(identifier.id, \.value),
        )
        .textFieldStyle(.plain)
    }

    private func scopePicker(for identifier: EditableIdentifier) -> some View {
        // A loaded row can sit on a scope the picker no longer offers (e.g. readaloud);
        // keep it selectable so the row round-trips unchanged.
        let rowScopes =
            scopes.contains(identifier.scope) ? scopes : scopes + [identifier.scope]
        return Picker("", selection: scopeBinding(identifier.id)) {
            ForEach(rowScopes, id: \.self) { scope in
                Text(scope.label).tag(scope)
            }
        }
        .labelsHidden()
        .fixedSize()
    }

    private func appendDraft() {
        let value = draftValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let typeUuid = draftTypeUuid, !value.isEmpty else { return }
        guard let type = types.first(where: { $0.uuid == typeUuid }) else { return }
        identifiers.append(
            EditableIdentifier(
                typeUuid: type.uuid,
                kind: type.kind,
                typeName: type.name,
                value: value,
                scope: draftScope,
            )
        )
        draftValue = ""
        onChange()
    }

    private func typeSelectionBinding(_ id: UUID) -> Binding<String> {
        Binding(
            get: {
                identifiers.first { $0.id == id }?.typeUuid ?? Self.pendingTag
            },
            set: { newValue in
                guard newValue != Self.pendingTag,
                    let index = identifiers.firstIndex(where: { $0.id == id }),
                    let type = types.first(where: { $0.uuid == newValue })
                else { return }
                identifiers[index].typeUuid = type.uuid
                identifiers[index].kind = type.kind
                identifiers[index].typeName = type.name
                onChange()
            },
        )
    }

    private func scopeBinding(_ id: UUID) -> Binding<EditableIdentifier.Scope> {
        Binding(
            get: {
                identifiers.first { $0.id == id }?.scope ?? .book
            },
            set: { newValue in
                guard let index = identifiers.firstIndex(where: { $0.id == id }) else { return }
                identifiers[index].scope = newValue
                onChange()
            },
        )
    }

    private func identifierBinding(
        _ id: UUID,
        _ keyPath: WritableKeyPath<EditableIdentifier, String>,
    ) -> Binding<String> {
        Binding(
            get: {
                identifiers.first { $0.id == id }?[keyPath: keyPath] ?? ""
            },
            set: { newValue in
                guard let index = identifiers.firstIndex(where: { $0.id == id }) else { return }
                identifiers[index][keyPath: keyPath] = newValue
                onChange()
            },
        )
    }
}

struct SeriesExpandedEditor: View {
    @Binding var series: [MetadataEditorViewModel.EditableSeries]
    let suggestions: [String]
    let onChange: () -> Void
    @State private var showsPositionHelp = false
    @State private var showsFeaturedHelp = false

    private var availableSuggestions: [String] {
        let existing = Set(series.map { $0.name.lowercased() })
        return suggestions.filter { !existing.contains($0.lowercased()) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Name")
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 4) {
                    Text("Position")
                    Button {
                        showsPositionHelp = true
                    } label: {
                        Image(systemName: "questionmark.circle")
                            .imageScale(.small)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showsPositionHelp, arrowEdge: .bottom) {
                        Text("The book's order within this series, such as 1, 2, or 2.5.")
                            .font(.callout)
                            .padding(10)
                            .frame(width: 240, alignment: .leading)
                    }
                }
                .frame(width: 86, alignment: .leading)
                HStack(spacing: 4) {
                    Text("Featured")
                    Button {
                        showsFeaturedHelp = true
                    } label: {
                        Image(systemName: "questionmark.circle")
                            .imageScale(.small)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showsFeaturedHelp, arrowEdge: .bottom) {
                        Text(
                            "Marks this as the primary series relationship for display when a book belongs to more than one series."
                        )
                        .font(.callout)
                        .padding(10)
                        .frame(width: 260, alignment: .leading)
                    }
                }
                .frame(width: 82, alignment: .leading)
                Color.clear
                    .frame(width: 20, height: 1)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)

            ForEach(series) { item in
                HStack(spacing: 8) {
                    HStack(spacing: 8) {
                        TextField("Series name", text: seriesBinding(item.id, \.name))
                            .textFieldStyle(.plain)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        if !availableSuggestions.isEmpty {
                            ScrollableStringPickerButton(
                                title: "Choose existing series",
                                systemImage: "text.badge.plus",
                                values: availableSuggestions,
                                help: "Choose existing series",
                                onSelect: { setSeriesName(item.id, $0) },
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    TextField("#", text: seriesBinding(item.id, \.position))
                        .textFieldStyle(.plain)
                        .frame(width: 86, alignment: .leading)

                    Toggle(
                        "",
                        isOn: Binding(
                            get: { series.first { $0.id == item.id }?.featured ?? false },
                            set: { newValue in
                                guard let index = series.firstIndex(where: { $0.id == item.id })
                                else { return }
                                series[index].featured = newValue
                                onChange()
                            },
                        ),
                    )
                    .frame(width: 82, alignment: .leading)
                    #if os(macOS)
                    .toggleStyle(.checkbox)
                    #endif

                    Button {
                        series.removeAll { $0.id == item.id }
                        onChange()
                    } label: {
                        Image(systemName: "minus.circle")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                    .frame(width: 20, alignment: .trailing)
                }
                .fullTextPill()
            }

            HStack(spacing: 8) {
                Button {
                    series.append(
                        MetadataEditorViewModel.EditableSeries(
                            name: "",
                            position: "",
                            featured: false,
                            uuid: nil,
                        )
                    )
                    onChange()
                } label: {
                    Label("Add Series", systemImage: "plus.circle")
                }
                .controlSize(.small)

                if !availableSuggestions.isEmpty {
                    ScrollableStringPickerButton(
                        title: "Add Existing Series",
                        label: "Add Existing",
                        values: availableSuggestions,
                        help: "Add an existing series",
                        onSelect: { suggestion in
                            series.append(
                                MetadataEditorViewModel.EditableSeries(
                                    name: suggestion,
                                    position: "",
                                    featured: false,
                                    uuid: nil,
                                )
                            )
                            onChange()
                        },
                    )
                    .controlSize(.small)
                }
            }
        }
        .padding(8)
        .metadataEditorBoundary()
    }

    private func seriesBinding(
        _ id: UUID,
        _ keyPath: WritableKeyPath<MetadataEditorViewModel.EditableSeries, String>,
    ) -> Binding<String> {
        Binding(
            get: {
                series.first { $0.id == id }?[keyPath: keyPath] ?? ""
            },
            set: { newValue in
                guard let index = series.firstIndex(where: { $0.id == id }) else { return }
                series[index][keyPath: keyPath] = newValue
                onChange()
            },
        )
    }

    private func setSeriesName(_ id: UUID, _ name: String) {
        guard let index = series.firstIndex(where: { $0.id == id }) else { return }
        series[index].name = name
        onChange()
    }
}

struct CollectionsExpandedEditor: View {
    @Binding var collectionUuids: [String]
    let choices: [MetadataEditorViewModel.CollectionChoice]
    let namesByUuid: [String: String]
    let createCollection: (String) async -> Bool
    let deleteCollection: (String) async -> Bool
    let refreshCollections: () async -> Void
    let onChange: () -> Void

    private var availableChoices: [MetadataEditorViewModel.CollectionChoice] {
        choices.filter { !collectionUuids.contains($0.uuid) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(collectionUuids, id: \.self) { uuid in
                HStack(spacing: 8) {
                    Text(namesByUuid[uuid] ?? uuid)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        collectionUuids.removeAll { $0 == uuid }
                        onChange()
                    } label: {
                        Image(systemName: "minus.circle")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                }
                .fullTextPill()
            }

            ScrollableCollectionPickerButton(
                title: "Add Collection",
                choices: availableChoices,
                help: "Add an existing collection",
                onSelect: { choice in
                    collectionUuids.append(choice.uuid)
                    onChange()
                },
            )
            .disabled(availableChoices.isEmpty)

            ManageCollectionsButton(
                choices: choices,
                createCollection: createCollection,
                deleteCollection: deleteCollection,
                refreshCollections: refreshCollections,
            )
            .help("Manage collections on the Storyteller server")
        }
        .padding(8)
        .metadataEditorBoundary()
        .task {
            await refreshCollections()
        }
    }
}

private struct ManageCollectionsButton: View {
    let choices: [MetadataEditorViewModel.CollectionChoice]
    let createCollection: (String) async -> Bool
    let deleteCollection: (String) async -> Bool
    let refreshCollections: () async -> Void
    @State private var isPresented = false
    @State private var query = ""
    @State private var newCollectionName = ""
    @State private var pendingDeleteChoice: MetadataEditorViewModel.CollectionChoice?
    @State private var showsDeleteConfirmation = false

    private var filteredChoices: [MetadataEditorViewModel.CollectionChoice] {
        let names = fuzzyFilter(choices.map(\.name), query: query)
        let allowedNames = Set(names)
        return choices.filter { allowedNames.contains($0.name) }
    }

    var body: some View {
        Button("Manage Collections") {
            isPresented = true
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.accentColor)
        .controlSize(.small)
        .popover(isPresented: $isPresented, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                pickerHeader(title: "Manage Collections", query: $query)

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(filteredChoices, id: \.uuid) { choice in
                            HStack(spacing: 8) {
                                Text(choice.name)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                Button {
                                    pendingDeleteChoice = choice
                                    showsDeleteConfirmation = true
                                } label: {
                                    Image(systemName: "trash")
                                        .foregroundStyle(.red)
                                }
                                .buttonStyle(.borderless)
                                .help("Delete collection from Storyteller")
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                    }
                }
                .frame(width: 360)
                .frame(maxHeight: 260)

                Divider()

                HStack(spacing: 8) {
                    Text("Add Collection")
                        .font(.subheadline.weight(.semibold))
                    TextField("New collection name", text: $newCollectionName)
                        .textFieldStyle(.roundedBorder)
                    Button("Create") {
                        Task {
                            guard await createCollection(newCollectionName) else { return }
                            newCollectionName = ""
                            await refreshCollections()
                        }
                    }
                    .disabled(
                        newCollectionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
            .padding(10)
            .alert("Delete Collection?", isPresented: $showsDeleteConfirmation) {
                Button("Delete Collection", role: .destructive) {
                    guard let choice = pendingDeleteChoice else { return }
                    Task {
                        if await deleteCollection(choice.uuid) {
                            pendingDeleteChoice = nil
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    pendingDeleteChoice = nil
                }
            } message: {
                if let choice = pendingDeleteChoice {
                    Text(
                        "This will permanently delete \"\(choice.name)\" from the Storyteller server."
                    )
                } else {
                    Text("This will permanently delete the collection from the Storyteller server.")
                }
            }
            .task {
                await refreshCollections()
            }
            .metadataEditorCompactPopover()
        }
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                query = ""
                newCollectionName = ""
                pendingDeleteChoice = nil
                showsDeleteConfirmation = false
            }
        }
    }
}

private struct ManageIdentifiersButton: View {
    let types: [IdentifierType]
    let createType: (String, String?) async -> Bool
    let deleteType: (IdentifierType) async -> Bool
    let refreshTypes: () async -> Void
    @State private var isPresented = false
    @State private var query = ""
    @State private var newTypeName = ""
    @State private var newTypeURLTemplate = ""
    @State private var pendingDeleteType: IdentifierType?
    @State private var showsDeleteConfirmation = false

    private var filteredTypes: [IdentifierType] {
        let names = fuzzyFilter(types.map(\.displayName), query: query)
        let allowedNames = Set(names)
        return types.filter { allowedNames.contains($0.displayName) }
    }

    var body: some View {
        Button("Manage Identifiers") {
            isPresented = true
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.accentColor)
        .controlSize(.small)
        .popover(isPresented: $isPresented, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                pickerHeader(title: "Manage Identifiers", query: $query)

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(filteredTypes) { type in
                            HStack(spacing: 8) {
                                Text(type.displayName)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                if type.kind == nil {
                                    Button {
                                        pendingDeleteType = type
                                        showsDeleteConfirmation = true
                                    } label: {
                                        Image(systemName: "trash")
                                            .foregroundStyle(.red)
                                    }
                                    .buttonStyle(.borderless)
                                    .help("Delete identifier type from Storyteller")
                                } else {
                                    Text("Built-in")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                    }
                }
                .frame(width: 360)
                .frame(maxHeight: 260)

                Divider()

                VStack(alignment: .leading, spacing: 6) {
                    Text("Add Identifier Type")
                        .font(.subheadline.weight(.semibold))
                    TextField("Name", text: $newTypeName)
                        .textFieldStyle(.roundedBorder)
                    HStack(spacing: 8) {
                        TextField(
                            "URL template (optional), e.g. https://example.com/{value}",
                            text: $newTypeURLTemplate,
                        )
                        .textFieldStyle(.roundedBorder)
                        Button("Create") {
                            Task {
                                let template = newTypeURLTemplate.trimmingCharacters(
                                    in: .whitespacesAndNewlines)
                                guard
                                    await createType(
                                        newTypeName.trimmingCharacters(
                                            in: .whitespacesAndNewlines),
                                        template.isEmpty ? nil : template,
                                    )
                                else { return }
                                newTypeName = ""
                                newTypeURLTemplate = ""
                            }
                        }
                        .disabled(
                            newTypeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                }
            }
            .padding(10)
            .alert("Delete Identifier Type?", isPresented: $showsDeleteConfirmation) {
                Button("Delete Type", role: .destructive) {
                    guard let type = pendingDeleteType else { return }
                    Task {
                        if await deleteType(type) {
                            pendingDeleteType = nil
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    pendingDeleteType = nil
                }
            } message: {
                if let type = pendingDeleteType {
                    Text(
                        "This will permanently delete \"\(type.displayName)\" and every identifier of this type from the Storyteller server."
                    )
                } else {
                    Text(
                        "This will permanently delete the identifier type and every identifier of this type from the Storyteller server."
                    )
                }
            }
            .task {
                await refreshTypes()
            }
            .metadataEditorCompactPopover()
        }
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                query = ""
                newTypeName = ""
                newTypeURLTemplate = ""
                pendingDeleteType = nil
                showsDeleteConfirmation = false
            }
        }
    }
}

private struct ScrollableStringPickerButton: View {
    let title: String
    var label: String?
    var systemImage: String?
    let values: [String]
    let help: String
    let onSelect: (String) -> Void
    @State private var isPresented = false
    @State private var query = ""

    var body: some View {
        Button {
            isPresented = true
        } label: {
            if let systemImage {
                Image(systemName: systemImage)
            } else {
                Text(label ?? title)
            }
        }
        .buttonStyle(.borderless)
        .help(help)
        .popover(isPresented: $isPresented, arrowEdge: .bottom) {
            ScrollableSuggestionList(title: title, values: values, query: $query) { value in
                onSelect(value)
                query = ""
                isPresented = false
            }
            .metadataEditorCompactPopover()
        }
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                query = ""
            }
        }
    }
}

private func autocompletePopoverHeight(rowCount: Int) -> CGFloat {
    let rowHeight: CGFloat = 30
    let verticalPadding: CGFloat = 16
    let maxHeight: CGFloat = 220
    let count = max(rowCount, 1)
    return min(CGFloat(count) * rowHeight + verticalPadding, maxHeight)
}

private struct ScrollableSuggestionList: View {
    let title: String
    let values: [String]
    @Binding var query: String
    let onSelect: (String) -> Void

    private var filteredValues: [String] {
        fuzzyFilter(values, query: query)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            pickerHeader(title: title, query: $query)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(filteredValues, id: \.self) { value in
                        Button {
                            onSelect(value)
                        } label: {
                            Text(value)
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .contentShape(Rectangle())
                    }
                }
            }
            .frame(width: 320)
            .frame(maxHeight: 260)
        }
        .padding(10)
    }
}

private struct ScrollableCollectionPickerButton: View {
    let title: String
    let choices: [MetadataEditorViewModel.CollectionChoice]
    let help: String
    let onSelect: (MetadataEditorViewModel.CollectionChoice) -> Void
    @State private var isPresented = false
    @State private var query = ""

    private var filteredChoices: [MetadataEditorViewModel.CollectionChoice] {
        let names = fuzzyFilter(choices.map(\.name), query: query)
        let allowedNames = Set(names)
        return choices.filter { allowedNames.contains($0.name) }
    }

    var body: some View {
        Button(title) {
            isPresented = true
        }
        .help(help)
        .popover(isPresented: $isPresented, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
                pickerHeader(title: title, query: $query)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(filteredChoices, id: \.uuid) { choice in
                            Button {
                                onSelect(choice)
                                query = ""
                                isPresented = false
                            } label: {
                                Text(choice.name)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                    }
                }
                .frame(width: 320)
                .frame(maxHeight: 260)
            }
            .padding(10)
            .metadataEditorCompactPopover()
        }
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                query = ""
            }
        }
    }
}

private func pickerHeader(title: String, query: Binding<String>) -> some View {
    HStack(spacing: 10) {
        Text(title)
            .font(.headline)
        TextField("Search", text: query)
            .textFieldStyle(.roundedBorder)
            .frame(width: 170)
    }
}

extension View {
    @ViewBuilder
    fileprivate func metadataEditorCompactPopover() -> some View {
        #if os(iOS)
        self.presentationCompactAdaptation(.popover)
        #else
        self
        #endif
    }
}

private func fuzzyFilter(_ values: [String], query: String) -> [String] {
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty else { return values }
    return values.filter { fuzzyMatches(trimmedQuery, in: $0) }
}

private func fuzzyMatches(_ query: String, in value: String) -> Bool {
    var searchIndex = value.lowercased().startIndex
    let searchable = value.lowercased()
    for character in query.lowercased() {
        guard let foundIndex = searchable[searchIndex...].firstIndex(of: character) else {
            return false
        }
        searchIndex = searchable.index(after: foundIndex)
    }
    return true
}

#if os(macOS)
struct MetadataEditorDatePicker: NSViewRepresentable {
    @Binding var selection: Date

    func makeNSView(context: Context) -> NSDatePicker {
        let picker = NSDatePicker()
        picker.datePickerStyle = .textFieldAndStepper
        picker.datePickerElements = [.yearMonthDay]
        picker.isBordered = true
        picker.drawsBackground = true
        picker.target = context.coordinator
        picker.action = #selector(Coordinator.dateChanged(_:))
        return picker
    }

    func updateNSView(_ picker: NSDatePicker, context: Context) {
        if picker.dateValue != selection {
            picker.dateValue = selection
        }
        picker.isEnabled = context.environment.isEnabled
        context.coordinator.selection = $selection
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(selection: $selection)
    }

    final class Coordinator: NSObject {
        var selection: Binding<Date>

        init(selection: Binding<Date>) {
            self.selection = selection
        }

        @MainActor @objc func dateChanged(_ sender: NSDatePicker) {
            selection.wrappedValue = sender.dateValue
        }
    }
}
#endif

struct ChipWrap: View {
    let values: [String]
    var removable = false
    var onRemove: (String) -> Void = { _ in }

    private let columns = [GridItem(.adaptive(minimum: 92), spacing: 6, alignment: .leading)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
            if values.isEmpty {
                Text("(empty)")
                    .foregroundStyle(.secondary)
                    .italic()
            } else {
                ForEach(values, id: \.self) { value in
                    HStack(spacing: 5) {
                        Text(value)
                            .lineLimit(1)
                        if removable {
                            Button {
                                onRemove(value)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption)
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                    .font(.callout)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.secondary.opacity(0.10))
                    )
                    .overlay {
                        Capsule()
                            .stroke(Color.secondary.opacity(0.25), lineWidth: 0.75)
                    }
                }
            }
        }
    }
}

private struct MetadataEditorFlowLayout: Layout {
    let horizontalSpacing: CGFloat
    let verticalSpacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout (),
    ) -> CGSize {
        arrangeSubviews(in: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout (),
    ) {
        let arrangement = arrangeSubviews(in: bounds.width, subviews: subviews)
        for item in arrangement.items {
            subviews[item.index].place(
                at: CGPoint(x: bounds.minX + item.origin.x, y: bounds.minY + item.origin.y),
                proposal: ProposedViewSize(item.size),
            )
        }
    }

    private struct Arrangement {
        struct Item {
            let index: Int
            let origin: CGPoint
            let size: CGSize
        }

        let items: [Item]
        let size: CGSize
    }

    private func arrangeSubviews(in maxWidth: CGFloat, subviews: Subviews) -> Arrangement {
        var items: [Arrangement.Item] = []
        var origin = CGPoint.zero
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        let availableWidth = maxWidth.isFinite ? maxWidth : .greatestFiniteMagnitude

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if origin.x > 0, origin.x + size.width > availableWidth {
                origin.x = 0
                origin.y += rowHeight + verticalSpacing
                rowHeight = 0
            }

            items.append(Arrangement.Item(index: index, origin: origin, size: size))
            usedWidth = max(usedWidth, origin.x + size.width)
            origin.x += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }

        return Arrangement(
            items: items,
            size: CGSize(width: min(usedWidth, availableWidth), height: origin.y + rowHeight),
        )
    }
}

extension View {
    fileprivate func fullTextPill() -> some View {
        self
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background {
                Capsule()
                    .fill(Color.secondary.opacity(0.08))
            }
            .overlay {
                Capsule()
                    .stroke(Color.secondary.opacity(0.28), lineWidth: 0.75)
            }
    }

    @ViewBuilder
    fileprivate func metadataEditorAutocompleteExitCommand(
        active: Bool,
        _ action: @escaping () -> Void,
    ) -> some View {
        #if os(macOS)
        self.onKeyPress(.escape) {
            guard active else { return .ignored }
            action()
            return .handled
        }
        #else
        self
        #endif
    }
}

#endif
