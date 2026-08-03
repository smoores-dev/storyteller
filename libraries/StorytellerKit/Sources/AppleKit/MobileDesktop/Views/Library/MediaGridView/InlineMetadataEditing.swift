#if os(iOS) || os(macOS)
import SwiftUI

enum InlineMetadataField: Hashable {
    case title
    case subtitle
    case description
    case authors
    case narrators
    case series
    case publicationDate
    case tags

    var dirtyKey: String {
        switch self {
            case .title: return "title"
            case .subtitle: return "subtitle"
            case .description: return "description"
            case .authors: return "authors"
            case .narrators: return "narrators"
            case .series: return "series"
            case .publicationDate: return "publicationDate"
            case .tags: return "tags"
        }
    }
}

/// Wraps a private ``MetadataEditorViewModel`` so dirty tracking, field-mask payload
/// building, and the multipart update path are exactly the ones the modal editor uses.
@MainActor
@Observable
final class InlineMetadataEditModel {
    private(set) var isEditing = false
    private(set) var activeField: InlineMetadataField?
    private(set) var isActivating = false
    private(set) var savingFields: Set<InlineMetadataField> = []
    var fieldErrors: [InlineMetadataField: String] = [:]
    var permissionHint: String?

    var titleDraft = ""
    var subtitleDraft = ""
    var descriptionDraft = ""
    var authorsDraft = ""
    var narratorsDraft = ""
    var seriesNameDraft = ""
    var seriesPositionDraft = ""
    var publicationDateDraft = ""
    var tagsDraft = ""

    private var editor: MetadataEditorViewModel?
    private var bookId: BookID?
    private var mediaViewModel: MediaViewModel?
    private var allowedSourceIDs: Set<BookSourceID> = []
    private var commitTask: Task<Void, Never>?

    func canEdit(_ item: BookMetadata, mediaViewModel: MediaViewModel) -> Bool {
        mediaViewModel.isServerBook(item.id)
    }

    func beginEditMode(for item: BookMetadata, mediaViewModel: MediaViewModel) async {
        guard !isEditing, !isActivating else { return }
        guard await prepareEditor(for: item, mediaViewModel: mediaViewModel) else { return }
        activeField = nil
        isEditing = true
    }

    func beginFieldEdit(
        _ field: InlineMetadataField,
        for item: BookMetadata,
        mediaViewModel: MediaViewModel,
    ) async {
        guard !isEditing, !isActivating else { return }
        if activeField == field, bookId == item.id { return }
        if editor != nil, bookId == item.id {
            resetDraft(field)
            fieldErrors[field] = nil
            activeField = field
            return
        }
        guard await prepareEditor(for: item, mediaViewModel: mediaViewModel) else { return }
        activeField = field
    }

    func showsEditor(for field: InlineMetadataField) -> Bool {
        isEditing || activeField == field
    }

    private func prepareEditor(
        for item: BookMetadata,
        mediaViewModel: MediaViewModel,
    ) async -> Bool {
        permissionHint = nil

        guard mediaViewModel.isServerBook(item.id) else {
            permissionHint = "Only books on a Storyteller server can be edited."
            return false
        }

        isActivating = true
        defer { isActivating = false }

        if !allowedSourceIDs.contains(item.id.sourceID) {
            let result = await BookServiceActor.shared.checkBookUpdatePermission(
                sourceID: item.id.sourceID
            )
            switch result {
                case .allowed:
                    allowedSourceIDs.insert(item.id.sourceID)
                case .denied:
                    permissionHint =
                        "Your account does not have permission to edit metadata on this server."
                    return false
                case .error(let message):
                    permissionHint = "Could not verify server permissions: \(message)"
                    return false
            }
        }

        let vm = MetadataEditorViewModel()
        vm.addBooks(ids: [item.id], from: mediaViewModel.library)
        vm.selectedBookId = item.id
        guard vm.books.contains(where: { $0.id == item.id }) else {
            permissionHint = "This book is not available for editing."
            return false
        }

        editor = vm
        bookId = item.id
        self.mediaViewModel = mediaViewModel
        fieldErrors = [:]
        savingFields = []
        for field in allFields {
            resetDraft(field)
        }
        return true
    }

    func endEditMode() {
        isEditing = false
        activeField = nil
        editor = nil
        bookId = nil
        mediaViewModel = nil
        fieldErrors = [:]
        savingFields = []
    }

    func cancel(_ field: InlineMetadataField) {
        resetDraft(field)
        fieldErrors[field] = nil
        if activeField == field {
            activeField = nil
        }
    }

    func draftBinding(for field: InlineMetadataField) -> Binding<String> {
        Binding(
            get: { [weak self] in self?.draft(for: field) ?? "" },
            set: { [weak self] in self?.setDraft($0, for: field) },
        )
    }

    var seriesPositionBinding: Binding<String> {
        Binding(
            get: { [weak self] in self?.seriesPositionDraft ?? "" },
            set: { [weak self] in self?.seriesPositionDraft = $0 },
        )
    }

    func isDraftModified(_ field: InlineMetadataField) -> Bool {
        if field == .series {
            return seriesNameDraft != baselineValue(for: .series)
                || seriesPositionDraft != baselineSeriesPosition
        }
        return draft(for: field) != baselineValue(for: field)
    }

    func isSaving(_ field: InlineMetadataField) -> Bool {
        savingFields.contains(field)
    }

    /// Commits are chained so a save in flight can never have its dirty flags cleared out from
    /// under a second field's commit (the shared editor view model clears all dirty fields on a
    /// successful save).
    func commit(_ field: InlineMetadataField) {
        let previous = commitTask
        commitTask = Task { [weak self] in
            await previous?.value
            await self?.performCommit(field)
        }
    }

    private var allFields: [InlineMetadataField] {
        [
            .title, .subtitle, .description, .authors, .narrators, .series, .publicationDate,
            .tags,
        ]
    }

    private var originalMetadata: BookMetadata? {
        guard let editor, let bookId else { return nil }
        return editor.books.first { $0.id == bookId }?.originalMetadata
    }

    private func draft(for field: InlineMetadataField) -> String {
        switch field {
            case .title: return titleDraft
            case .subtitle: return subtitleDraft
            case .description: return descriptionDraft
            case .authors: return authorsDraft
            case .narrators: return narratorsDraft
            case .series: return seriesNameDraft
            case .publicationDate: return publicationDateDraft
            case .tags: return tagsDraft
        }
    }

    private func setDraft(_ value: String, for field: InlineMetadataField) {
        switch field {
            case .title: titleDraft = value
            case .subtitle: subtitleDraft = value
            case .description: descriptionDraft = value
            case .authors: authorsDraft = value
            case .narrators: narratorsDraft = value
            case .series: seriesNameDraft = value
            case .publicationDate: publicationDateDraft = value
            case .tags: tagsDraft = value
        }
    }

    private func baselineValue(for field: InlineMetadataField) -> String {
        guard let orig = originalMetadata else { return "" }
        switch field {
            case .title:
                return orig.title
            case .subtitle:
                return orig.subtitle ?? ""
            case .description:
                return orig.description ?? ""
            case .authors:
                return (orig.authors?.compactMap(\.name) ?? []).joined(separator: ", ")
            case .narrators:
                return (orig.narrators?.compactMap(\.name) ?? []).joined(separator: ", ")
            case .series:
                return orig.series?.first?.name ?? ""
            case .publicationDate:
                return MetadataEditorViewModel.EditableBook.dateOnly(orig.publicationDate) ?? ""
            case .tags:
                return (orig.tags?.map(\.name) ?? []).joined(separator: ", ")
        }
    }

    private var baselineSeriesPosition: String {
        InlineMetadataParsing.positionString(originalMetadata?.series?.first?.position)
    }

    private func resetDraft(_ field: InlineMetadataField) {
        setDraft(baselineValue(for: field), for: field)
        if field == .series {
            seriesPositionDraft = baselineSeriesPosition
        }
    }

    private func performCommit(_ field: InlineMetadataField) async {
        guard isEditing || activeField == field,
            let editor,
            let bookId,
            let mediaViewModel,
            let index = editor.books.firstIndex(where: { $0.id == bookId })
        else { return }

        func finishFieldEdit() {
            if activeField == field {
                activeField = nil
            }
        }

        fieldErrors[field] = nil
        let orig = editor.books[index].originalMetadata

        switch field {
            case .title:
                let trimmed = titleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else {
                    fieldErrors[.title] = "Title cannot be empty"
                    return
                }
                titleDraft = trimmed
                editor.books[index].title = trimmed
            case .subtitle:
                let trimmed = subtitleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                subtitleDraft = trimmed
                editor.books[index].subtitle = trimmed
            case .description:
                editor.books[index].description = descriptionDraft
            case .authors:
                editor.books[index].authors = InlineMetadataParsing.nameList(from: authorsDraft)
            case .narrators:
                editor.books[index].narrators = InlineMetadataParsing.nameList(
                    from: narratorsDraft
                )
            case .series:
                let name = seriesNameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                let position = seriesPositionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                if !position.isEmpty, Double(position) == nil {
                    fieldErrors[.series] = "Series position must be a number"
                    return
                }
                var updated = MetadataEditorViewModel.EditableBook(from: orig).series
                if name.isEmpty {
                    if !updated.isEmpty {
                        updated.removeFirst()
                    }
                } else if updated.isEmpty {
                    updated = [
                        MetadataEditorViewModel.EditableSeries(
                            name: name,
                            position: position,
                            featured: true,
                            uuid: nil,
                        )
                    ]
                } else {
                    updated[0].name = name
                    updated[0].position = position
                }
                editor.books[index].series = updated
            case .publicationDate:
                let trimmed = publicationDateDraft.trimmingCharacters(
                    in: .whitespacesAndNewlines
                )
                let origDay =
                    MetadataEditorViewModel.EditableBook.dateOnly(orig.publicationDate) ?? ""
                if trimmed.isEmpty {
                    guard !origDay.isEmpty else {
                        finishFieldEdit()
                        return
                    }
                    editor.books[index].publicationDate = ""
                } else {
                    guard let wire = InlineMetadataParsing.publicationDateWireValue(trimmed)
                    else {
                        fieldErrors[.publicationDate] =
                            "Enter a year (2020) or a date (2020-01-15)"
                        return
                    }
                    let newDay = String(wire.prefix(10))
                    guard newDay != origDay else {
                        publicationDateDraft = newDay
                        finishFieldEdit()
                        return
                    }
                    editor.books[index].publicationDate = wire
                }
            case .tags:
                editor.books[index].tags = InlineMetadataParsing.nameList(from: tagsDraft)
        }

        editor.markDirty(field: field.dirtyKey, for: bookId)
        guard editor.books[index].hasDirtyFields else {
            resetDraft(field)
            finishFieldEdit()
            return
        }

        savingFields.insert(field)
        await editor.saveSingle(bookId, mediaViewModel: mediaViewModel)
        savingFields.remove(field)

        if editor.saveResults[bookId] == true, editor.saveError == nil {
            resetDraft(field)
            finishFieldEdit()
        } else {
            fieldErrors[field] = editor.saveError ?? "Could not save changes"
            editor.revertFieldToOriginal(field: field.dirtyKey, for: bookId)
        }
    }
}

struct InlineMetadataFieldRow: View {
    let model: InlineMetadataEditModel
    let field: InlineMetadataField
    let placeholder: String
    var label: String? = nil
    var font: Font = .body
    var numericKeyboard = false
    var autofocus = false

    @FocusState private var isFocused: Bool
    @State private var isHoveringRevert = false

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                if let label {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .layoutPriority(1)
                }
                textField
                trailingControls(for: field)
            }
            InlineMetadataFieldError(model: model, field: field)
        }
        .onChange(of: isFocused) { _, focused in
            // Clicking the revert button blurs the field before the button action runs;
            // committing here would race it and save the value being reverted.
            if !focused, !isHoveringRevert {
                model.commit(field)
            }
        }
        .onAppear {
            if autofocus {
                Task { @MainActor in
                    isFocused = true
                }
            }
        }
    }

    private var textField: some View {
        let base = TextField(placeholder, text: model.draftBinding(for: field))
            .font(font)
            .textFieldStyle(.roundedBorder)
            .focused($isFocused)
            .onSubmit { model.commit(field) }
        #if os(macOS)
        return base.onExitCommand {
            model.cancel(field)
            isFocused = false
        }
        #else
        return base.keyboardType(numericKeyboard ? .decimalPad : .default)
        #endif
    }

    @ViewBuilder
    private func trailingControls(for field: InlineMetadataField) -> some View {
        if model.isSaving(field) {
            ProgressView()
                .controlSize(.small)
        } else if model.isDraftModified(field) {
            InlineMetadataRevertButton {
                model.cancel(field)
                isFocused = false
                isHoveringRevert = false
            }
            .onHover { isHoveringRevert = $0 }
        }
    }
}

struct InlineMetadataSeriesRow: View {
    let model: InlineMetadataEditModel
    var font: Font = .callout
    var autofocus = false

    @FocusState private var focusedPart: Part?
    @State private var isHoveringRevert = false

    enum Part: Hashable {
        case name
        case position
    }

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                nameField
                positionField
                    .frame(width: 72)
                if model.isSaving(.series) {
                    ProgressView()
                        .controlSize(.small)
                } else if model.isDraftModified(.series) {
                    InlineMetadataRevertButton {
                        model.cancel(.series)
                        focusedPart = nil
                        isHoveringRevert = false
                    }
                    .onHover { isHoveringRevert = $0 }
                }
            }
            InlineMetadataFieldError(model: model, field: .series)
        }
        .onChange(of: focusedPart) { _, focused in
            // Same revert-click race as InlineMetadataFieldRow.
            if focused == nil, !isHoveringRevert {
                model.commit(.series)
            }
        }
        .onAppear {
            if autofocus {
                Task { @MainActor in
                    focusedPart = .name
                }
            }
        }
    }

    private var nameField: some View {
        let base = TextField("Series name", text: model.draftBinding(for: .series))
            .font(font)
            .textFieldStyle(.roundedBorder)
            .focused($focusedPart, equals: .name)
            .onSubmit { model.commit(.series) }
        #if os(macOS)
        return base.onExitCommand {
            model.cancel(.series)
            focusedPart = nil
        }
        #else
        return base
        #endif
    }

    private var positionField: some View {
        let base = TextField("#", text: model.seriesPositionBinding)
            .font(font)
            .textFieldStyle(.roundedBorder)
            .focused($focusedPart, equals: .position)
            .onSubmit { model.commit(.series) }
        #if os(macOS)
        return base.onExitCommand {
            model.cancel(.series)
            focusedPart = nil
        }
        #else
        return base.keyboardType(.decimalPad)
        #endif
    }
}

struct InlineMetadataDescriptionEditor: View {
    let model: InlineMetadataEditModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            editorView
            InlineMetadataFieldError(model: model, field: .description)
            HStack(spacing: 10) {
                Spacer()
                if model.isSaving(.description) {
                    ProgressView()
                        .controlSize(.small)
                }
                Button("Cancel") {
                    model.cancel(.description)
                }
                Button("Save") {
                    model.commit(.description)
                }
                .disabled(!model.isDraftModified(.description) || model.isSaving(.description))
            }
            .controlSize(.small)
        }
    }

    private var editorView: some View {
        let base = TextEditor(text: model.draftBinding(for: .description))
            .font(.body)
            .frame(minHeight: 120, maxHeight: 280)
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.12))
            }
        #if os(macOS)
        return base.onExitCommand {
            model.cancel(.description)
        }
        #else
        return base
        #endif
    }
}

struct InlineMetadataFieldError: View {
    let model: InlineMetadataEditModel
    let field: InlineMetadataField

    var body: some View {
        if let message = model.fieldErrors[field] {
            Text(message)
                .font(.caption)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#if os(macOS)
struct InlineMetadataHoverEdit<Content: View>: View {
    let help: String
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var isHovering = false

    var body: some View {
        content()
            .padding(.horizontal, 20)
            .overlay(alignment: .trailing) {
                Button(action: action) {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                        .frame(width: 16, height: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(isHovering ? 1 : 0)
                .help(help)
                .accessibilityLabel(help)
            }
            .onHover { hovering in
                withAnimation(.easeInOut(duration: 0.12)) {
                    isHovering = hovering
                }
            }
    }
}
#endif

private struct InlineMetadataRevertButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.uturn.backward")
                .font(.caption.weight(.semibold))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .accessibilityLabel("Revert to server value")
        #if os(macOS)
        .help("Revert to server value")
        #endif
    }
}

#endif
