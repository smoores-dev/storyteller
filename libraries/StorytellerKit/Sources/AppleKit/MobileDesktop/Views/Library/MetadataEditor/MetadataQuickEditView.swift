#if os(macOS)
import SwiftUI

/// A single library-table field targeted by a cmd/option-click quick edit. Each case knows the
/// ``MetadataEditorViewModel`` dirty-field key it drives and how it should be rendered, mirroring the
/// full metadata editor's per-field controls.
enum MetadataQuickEditField: Equatable {
    case scalar(key: String, label: String)
    case publicationDate
    case status
    case stringList(key: String, label: String)
    case series
    case collections
    case creators(roleLabel: String)

    var dirtyKey: String {
        switch self {
            case .scalar(let key, _): return key
            case .publicationDate: return "publicationDate"
            case .status: return "status"
            case .stringList(let key, _): return key
            case .series: return "series"
            case .collections: return "collections"
            case .creators: return "creators"
        }
    }

    var label: String {
        switch self {
            case .scalar(_, let label): return label
            case .publicationDate: return "Publication Date"
            case .status: return "Status"
            case .stringList(_, let label): return label
            case .series: return "Series"
            case .collections: return "Collections"
            case .creators(let roleLabel): return roleLabel
        }
    }

    /// Single-line fields commit on plain Return; multi-value editors reserve Return for adding an
    /// item and commit on Cmd+Return instead.
    var isSingleLine: Bool {
        switch self {
            case .scalar, .publicationDate, .status: return true
            default: return false
        }
    }
}

struct MetadataQuickEditTarget: Identifiable {
    let id = UUID()
    let bookId: BookID
    let field: MetadataQuickEditField
}

/// Lightweight sheet for editing one metadata field of one book, built for rapid-fire edits from the
/// library table. Reuses ``MetadataEditorViewModel`` (dirty tracking, validation, payload build, save)
/// and the same per-field editor controls as the full metadata editor.
struct MetadataQuickEditView: View {
    let bookId: BookID
    let field: MetadataQuickEditField
    let onClose: () -> Void

    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var viewModel = MetadataEditorViewModel()
    @State private var isReady = false
    @FocusState private var singleLineFocused: Bool

    @State private var lookupLoading = false
    @State private var lookupResults: [AudnexusSearchResult] = []
    // Only the tags field needs the full Audnexus record; every other field is derivable straight
    // from the lightweight search result, so details are fetched lazily per row and cached here.
    @State private var lookupTagDetailsByAsin: [String: BookMetadataCandidate] = [:]
    @State private var lookupError: String?
    @State private var audnexusRegion = "us"
    @State private var editorContentHeight: CGFloat = 0

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            Divider()

            if isReady, book != nil {
                editorArea
                if fieldSupportsLookup {
                    if let lookupError {
                        Text(lookupError)
                            .font(.callout)
                            .foregroundStyle(.orange)
                    }
                    if !lookupResults.isEmpty {
                        lookupResultsList
                    }
                }
                if let message = validationError {
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
                if let saveError = viewModel.saveError {
                    Text(saveError)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 60)
            }

            Divider()
            footer
        }
        .padding(20)
        .frame(width: 460)
        .onExitCommand { onClose() }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(field.label)
                .font(.headline)
            if let title = book?.displayTitle {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var editorArea: some View {
        if field.isSingleLine {
            editor
        } else {
            ScrollView {
                editor
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: QuickEditContentHeightKey.self,
                                value: geo.size.height,
                            )
                        }
                    )
            }
            // A bare ScrollView expands to fill; size it to its content instead so a short editor
            // (one narrator pill) doesn't reserve the full height, only scrolling past the cap.
            .frame(height: min(max(editorContentHeight, 44), 360))
            .onPreferenceChange(QuickEditContentHeightKey.self) { editorContentHeight = $0 }
        }
    }

    @ViewBuilder
    private var editor: some View {
        switch field {
            case .scalar(let key, let label):
                TextField(label, text: scalarBinding(key: key))
                    .textFieldStyle(.roundedBorder)
                    .focused($singleLineFocused)
            case .publicationDate:
                publicationDateEditor
            case .status:
                statusEditor
            case .stringList(let key, let label):
                ExpandedStringListEditor(
                    values: stringListBinding(key: key),
                    placeholder: label,
                    suggestions: suggestions(for: key),
                    onChange: { viewModel.markDirty(field: key, for: bookId) },
                )
            case .series:
                SeriesExpandedEditor(
                    series: seriesBinding,
                    suggestions: librarySeriesNames,
                    onChange: { viewModel.markDirty(field: "series", for: bookId) },
                )
            case .collections:
                CollectionsExpandedEditor(
                    collectionUuids: collectionsBinding,
                    choices: viewModel.libraryCollectionChoices(for: bookId),
                    namesByUuid: viewModel.libraryCollectionNamesByUuid(for: bookId),
                    createCollection: {
                        await viewModel.createCollection(named: $0, for: bookId) != nil
                    },
                    deleteCollection: { await viewModel.deleteCollection(uuid: $0, for: bookId) },
                    refreshCollections: {
                        await viewModel.refreshLibraryCollectionsFromServer(for: bookId)
                    },
                    onChange: { viewModel.markDirty(field: "collections", for: bookId) },
                )
            case .creators:
                CreatorsExpandedEditor(
                    creators: creatorsBinding,
                    suggestionsByRole: viewModel.libraryCreatorNamesByRole,
                    onChange: { viewModel.markDirty(field: "creators", for: bookId) },
                )
        }
    }

    private var publicationDateEditor: some View {
        let dateString = book?.publicationDate ?? ""
        let hasDate = !dateString.isEmpty
        return HStack(spacing: 10) {
            MetadataEditorDatePicker(
                selection: Binding(
                    get: { StorytellerDate.calendarDay(dateString) ?? Date() },
                    set: { newDate in
                        setPublicationDate(StorytellerDate.isoDay(from: newDate))
                    },
                )
            )
            .frame(width: 156)
            .disabled(!hasDate)

            Toggle(
                "No date",
                isOn: Binding(
                    get: { !hasDate },
                    set: { noDate in
                        setPublicationDate(noDate ? "" : StorytellerDate.isoDay(from: Date()))
                    },
                ),
            )
            .toggleStyle(.checkbox)
        }
    }

    private var statusEditor: some View {
        Picker("", selection: statusBinding) {
            ForEach(statusOptions, id: \.uuid) { status in
                Text(status.name).tag(status.uuid ?? "")
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .frame(maxWidth: .infinity, alignment: .leading)
        .disabled(statusOptions.isEmpty)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if !field.isSingleLine {
                Text("Press \u{2318}\u{21A9} to save")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if fieldSupportsLookup {
                if lookupLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button {
                        Task { await performLookup() }
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .help("Look up this field on Audnexus")
                }
            }
            Button("Cancel", role: .cancel) { onClose() }
                .keyboardShortcut(.cancelAction)
            Button("Save") { Task { await save() } }
                .keyboardShortcut(saveShortcut)
                .disabled(!canSave)
        }
    }

    private var saveShortcut: KeyboardShortcut {
        field.isSingleLine ? .defaultAction : KeyboardShortcut(.return, modifiers: .command)
    }

    private var canSave: Bool {
        guard let book, !viewModel.isSaving else { return false }
        return book.hasDirtyFields && validationError == nil
    }

    private var validationError: String? {
        viewModel.validationErrors(for: bookId).first?.message
    }

    private func load() async {
        viewModel.addBooks(ids: [bookId], from: mediaViewModel.library)
        viewModel.selectedBookId = bookId

        if case .status = field {
            let statuses = await BookServiceActor.shared.getAvailableStatuses(
                sourceID: bookId.sourceID
            )
            viewModel.setAvailableStatuses(statuses, sourceID: bookId.sourceID)
        }

        // Mirror the full importer's marketplace choice so a quick lookup queries the same Audible
        // region the user already picked there.
        audnexusRegion = UserDefaults.standard.string(forKey: "audnexusImport.region") ?? "us"

        isReady = true
        if field.isSingleLine {
            singleLineFocused = true
        }
    }

    private func save() async {
        guard let book else { return }
        guard book.hasDirtyFields else {
            onClose()
            return
        }
        guard validationError == nil else { return }

        await viewModel.saveSingle(bookId, mediaViewModel: mediaViewModel)
        if viewModel.saveError == nil, viewModel.saveResults[bookId] == true {
            onClose()
        }
    }

    private var fieldSupportsLookup: Bool {
        switch field {
            // Audnexus models only authors + narrators, so it has nothing to offer the general
            // creators field. Language is a display name in the record, not the stored code, so a
            // lookup would mis-apply it.
            case .status, .collections, .creators: return false
            case .scalar(let key, _): return key != "language"
            default: return true
        }
    }

    @ViewBuilder
    private var lookupResultsList: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Audnexus matches")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(lookupResults) { result in
                        lookupResultRow(result)
                        Divider()
                    }
                }
            }
            .frame(maxHeight: 240)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.06)))
        }
    }

    private func lookupResultRow(_ result: AudnexusSearchResult) -> some View {
        let value = lookupValue(for: result)
        return HStack(alignment: .top, spacing: 10) {
            coverThumb(result.coverUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(result.title).font(.callout.weight(.semibold)).lineLimit(2)
                if !result.authors.isEmpty {
                    Text(result.authors.joined(separator: ", "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                if let year = result.releaseYear {
                    Text(String(year)).font(.caption2).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 6) {
                if let value {
                    Text(value.isEmpty ? "(none)" : value)
                        .font(.caption)
                        .foregroundStyle(value.isEmpty ? .tertiary : .secondary)
                        .lineLimit(3)
                        .multilineTextAlignment(.trailing)
                        .textSelection(.enabled)
                    Button("Use") { applyResult(result) }
                        .controlSize(.small)
                        .disabled(value.isEmpty)
                } else {
                    ProgressView().controlSize(.small)
                }
            }
            .frame(width: 140, alignment: .trailing)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await loadTagDetailsIfNeeded(for: result) }
    }

    private func coverThumb(_ url: String?) -> some View {
        Group {
            if let url, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { image in
                    image.resizable().aspectRatio(contentMode: .fit)
                } placeholder: {
                    Color.secondary.opacity(0.12)
                }
            } else {
                Color.secondary.opacity(0.12)
            }
        }
        .frame(width: 40, height: 54)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func performLookup() async {
        guard let book else { return }
        lookupError = nil
        lookupLoading = true
        defer { lookupLoading = false }

        let author =
            book.authors.first
            ?? book.originalMetadata.authors?.first?.name

        do {
            let results = try await AudnexusActor.shared.searchBooks(
                title: book.title,
                author: author,
                region: audnexusRegion,
            )
            lookupResults = results
            lookupTagDetailsByAsin = [:]
            if results.isEmpty {
                lookupError = "No Audnexus matches found"
            }
        } catch {
            lookupResults = []
            lookupError = "Audnexus lookup failed"
        }
    }

    /// Value returned for a result. `nil` means the tags field is still fetching its record (the
    /// only field not derivable from the lightweight search result); every other field resolves
    /// synchronously to a string that may be empty.
    private func lookupValue(for result: AudnexusSearchResult) -> String? {
        switch field {
            case .scalar(let key, _):
                switch key {
                    case "title": return result.title
                    case "subtitle": return result.subtitle ?? ""
                    default: return ""
                }
            case .stringList(let key, _):
                switch key {
                    case "authors": return result.authors.joined(separator: ", ")
                    case "narrators": return result.narrators.joined(separator: ", ")
                    case "tags":
                        guard let details = lookupTagDetailsByAsin[result.asin] else { return nil }
                        return details.tags.map(\.name).joined(separator: ", ")
                    default: return ""
                }
            case .series:
                guard let name = result.seriesName else { return "" }
                return result.seriesPosition.map { "\(name) #\($0)" } ?? name
            case .publicationDate:
                return Self.dateOnly(result.releaseDate)
            case .status, .collections, .creators:
                return ""
        }
    }

    private func applyResult(_ result: AudnexusSearchResult) {
        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
        switch field {
            case .scalar(let key, _):
                switch key {
                    case "title": viewModel.books[index].title = result.title
                    case "subtitle": viewModel.books[index].subtitle = result.subtitle ?? ""
                    default: break
                }
                viewModel.markDirty(field: key, for: bookId)
            case .stringList(let key, _):
                switch key {
                    case "authors": viewModel.books[index].authors = result.authors
                    case "narrators": viewModel.books[index].narrators = result.narrators
                    case "tags":
                        guard let details = lookupTagDetailsByAsin[result.asin] else { return }
                        viewModel.books[index].tags = details.tags.map(\.name)
                    default: break
                }
                viewModel.markDirty(field: key, for: bookId)
            case .series:
                guard let name = result.seriesName else { return }
                viewModel.books[index].series = [
                    MetadataEditorViewModel.EditableSeries(
                        name: name,
                        position: result.seriesPosition ?? "",
                        featured: true,
                        uuid: nil,
                    )
                ]
                viewModel.markDirty(field: "series", for: bookId)
            case .publicationDate:
                viewModel.books[index].publicationDate = Self.dateOnly(result.releaseDate)
                viewModel.markDirty(field: "publicationDate", for: bookId)
            case .status, .collections, .creators:
                break
        }
    }

    private var lookupNeedsDetails: Bool {
        if case .stringList(let key, _) = field { return key == "tags" }
        return false
    }

    private func loadTagDetailsIfNeeded(for result: AudnexusSearchResult) async {
        guard lookupNeedsDetails, lookupTagDetailsByAsin[result.asin] == nil else { return }
        if let details = try? await AudnexusActor.shared.fetchBookDetails(
            asin: result.asin,
            region: audnexusRegion,
        ) {
            lookupTagDetailsByAsin[result.asin] = details.asMetadataCandidate
        }
    }

    private static func dateOnly(_ raw: String?) -> String {
        guard let raw, !raw.isEmpty else { return "" }
        return raw.contains("T") ? String(raw.prefix(10)) : raw
    }

    private func setPublicationDate(_ value: String) {
        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
        viewModel.books[index].publicationDate = value
        viewModel.markDirty(field: "publicationDate", for: bookId)
    }

    private func scalarBinding(key: String) -> Binding<String> {
        Binding(
            get: { book.map { Self.scalarValue($0, key: key) } ?? "" },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                Self.setScalar(&viewModel.books[index], key: key, value: newValue)
                viewModel.markDirty(field: key, for: bookId)
            },
        )
    }

    private static func scalarValue(
        _ book: MetadataEditorViewModel.EditableBook,
        key: String,
    ) -> String {
        switch key {
            case "title": return book.title
            case "subtitle": return book.subtitle
            case "language": return book.language
            default: return ""
        }
    }

    private static func setScalar(
        _ book: inout MetadataEditorViewModel.EditableBook,
        key: String,
        value: String,
    ) {
        switch key {
            case "title": book.title = value
            case "subtitle": book.subtitle = value
            case "language": book.language = value
            default: break
        }
    }

    private func stringListBinding(key: String) -> Binding<[String]> {
        Binding(
            get: { book?.stringList(for: key) ?? [] },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                switch key {
                    case "authors": viewModel.books[index].authors = newValue
                    case "narrators": viewModel.books[index].narrators = newValue
                    case "tags": viewModel.books[index].tags = newValue
                    default: break
                }
            },
        )
    }

    private var seriesBinding: Binding<[MetadataEditorViewModel.EditableSeries]> {
        Binding(
            get: { book?.series ?? [] },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                viewModel.books[index].series = newValue
            },
        )
    }

    private var collectionsBinding: Binding<[String]> {
        Binding(
            get: { book?.collectionUuids ?? [] },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                viewModel.books[index].collectionUuids = newValue
            },
        )
    }

    private var creatorsBinding: Binding<[MetadataEditorViewModel.EditableCreator]> {
        Binding(
            get: { book?.creators ?? [] },
            set: { newValue in
                guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else {
                    return
                }
                viewModel.books[index].creators = newValue
            },
        )
    }

    private var statusBinding: Binding<String> {
        Binding(
            get: { book?.statusUuid ?? "" },
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

    private var statusOptions: [BookStatus] {
        var statuses = viewModel.availableStatuses(for: bookId)
            .filter {
                !($0.uuid ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        guard let current = book,
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

    private func suggestions(for key: String) -> [String] {
        switch key {
            case "authors": return viewModel.libraryAuthorNames
            case "narrators": return viewModel.libraryNarratorNames
            case "tags": return viewModel.libraryTagNames
            default: return []
        }
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
        return names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
}

private struct QuickEditContentHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
#endif
