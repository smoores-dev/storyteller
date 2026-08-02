#if os(iOS) || os(macOS)
import SwiftUI

/// Editor for all of a server book's identifiers, book-level and format-scoped.
/// Loads the current set and the library's identifier types, lets the user
/// add/remove/rescope rows and create new types inline, and saves via
/// `PUT /books/{id}/identifiers`, which REPLACES the whole set.
struct IdentifierEditorSheet: View {
    let book: BookMetadata

    private var bookID: BookID { book.id }

    @Environment(\.dismiss) private var dismiss

    private typealias Scope = MetadataEditorViewModel.EditableIdentifier.Scope

    private struct EditorRow: Identifiable {
        let id = UUID()
        var typeUuid: String?
        var value: String
        var scope: Scope
        var formatUuid: String?
    }

    private enum LoadState {
        case loading
        case ready
        case failed(String)
    }

    @State private var loadState: LoadState = .loading
    @State private var rows: [EditorRow] = []
    @State private var types: [IdentifierType] = []
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var isCreatingType = false
    @State private var newTypeName = ""
    @State private var newTypeURLTemplate = ""
    @State private var isSubmittingNewType = false
    @State private var pendingTypeRowID: UUID?

    var body: some View {
        #if os(macOS)
        VStack(spacing: 0) {
            HStack {
                Text("Identifiers")
                    .font(.headline)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider()
            editorContent
            Divider()
            HStack {
                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .lineLimit(2)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Save") { save() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .frame(minWidth: 640, idealWidth: 720, minHeight: 340, idealHeight: 420)
        .task { await load() }
        #else
        NavigationStack {
            editorContent
                .navigationTitle("Identifiers")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { save() }
                            .disabled(!canSave)
                    }
                }
        }
        .task { await load() }
        #endif
    }

    private var canSave: Bool {
        guard case .ready = loadState, !isSaving else { return false }
        return rows.allSatisfy { row in
            row.typeUuid != nil
                || row.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    @ViewBuilder
    private var editorContent: some View {
        switch loadState {
            case .loading:
                ProgressView("Loading identifiers...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                VStack(spacing: 8) {
                    Image(systemName: "lock")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready:
                Form {
                    Section {
                        if rows.isEmpty {
                            Text("No identifiers")
                                .foregroundStyle(.secondary)
                        }
                        ForEach($rows) { $row in
                            identifierRow($row)
                        }
                        Button {
                            rows.append(
                                EditorRow(typeUuid: types.first?.uuid, value: "", scope: .book))
                        } label: {
                            Label("Add Identifier", systemImage: "plus.circle")
                        }
                        .disabled(isSaving)
                    } footer: {
                        Text("An identifier can apply to the whole book or to one of its formats.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if isCreatingType {
                        newTypeSection
                    }

                    #if os(iOS)
                    if let errorMessage {
                        Section {
                            Text(errorMessage)
                                .font(.callout)
                                .foregroundStyle(.red)
                        }
                    }
                    #endif
                }
                #if os(macOS)
                .formStyle(.grouped)
                #endif
                .disabled(isSaving)
        }
    }

    @ViewBuilder
    private func identifierRow(_ row: Binding<EditorRow>) -> some View {
        HStack(spacing: 8) {
            Picker("", selection: typeSelectionBinding(row)) {
                if row.wrappedValue.typeUuid == nil {
                    Text("Type").tag(TypeSelection.none)
                }
                ForEach(types) { type in
                    Text(typeLabel(type)).tag(TypeSelection.existing(type.uuid))
                }
                Divider()
                Text("New Type...").tag(TypeSelection.newType)
            }
            .labelsHidden()
            .frame(width: 170, alignment: .leading)

            TextField("", text: row.value, prompt: Text("Value"))
                .labelsHidden()
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif

            Picker("", selection: scopeBinding(row)) {
                ForEach(rowScopes(row.wrappedValue), id: \.self) { scope in
                    Text(scope.label).tag(scope)
                }
            }
            .labelsHidden()
            .frame(width: 120, alignment: .leading)

            Button {
                rows.removeAll { $0.id == row.wrappedValue.id }
            } label: {
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove identifier")
        }
    }

    private enum TypeSelection: Hashable {
        case none
        case existing(String)
        case newType
    }

    private var availableScopes: [Scope] {
        var scopes: [Scope] = [.book]
        if book.ebook?.uuid != nil { scopes.append(.ebook) }
        if book.audiobook?.uuid != nil { scopes.append(.audiobook) }
        if book.readaloud?.uuid != nil { scopes.append(.readaloud) }
        return scopes
    }

    // A loaded row can sit on a scope the book no longer offers; keep it selectable
    // so the row round-trips unchanged.
    private func rowScopes(_ row: EditorRow) -> [Scope] {
        availableScopes.contains(row.scope) ? availableScopes : availableScopes + [row.scope]
    }

    private func formatUuid(for scope: Scope) -> String? {
        switch scope {
            case .book: return nil
            case .ebook: return book.ebook?.uuid
            case .audiobook: return book.audiobook?.uuid
            case .readaloud: return book.readaloud?.uuid
        }
    }

    private func scopeBinding(_ row: Binding<EditorRow>) -> Binding<Scope> {
        Binding(
            get: { row.wrappedValue.scope },
            set: { newScope in
                row.wrappedValue.scope = newScope
                row.wrappedValue.formatUuid = formatUuid(for: newScope)
            },
        )
    }

    private func typeSelectionBinding(_ row: Binding<EditorRow>) -> Binding<TypeSelection> {
        Binding(
            get: {
                if let uuid = row.wrappedValue.typeUuid {
                    return .existing(uuid)
                }
                return .none
            },
            set: { selection in
                switch selection {
                    case .none:
                        row.wrappedValue.typeUuid = nil
                    case .existing(let uuid):
                        row.wrappedValue.typeUuid = uuid
                    case .newType:
                        pendingTypeRowID = row.wrappedValue.id
                        newTypeName = ""
                        newTypeURLTemplate = ""
                        isCreatingType = true
                }
            },
        )
    }

    private func typeLabel(_ type: IdentifierType) -> String {
        type.displayName
    }

    private var newTypeSection: some View {
        Section("New Identifier Type") {
            TextField("Name", text: $newTypeName)
                .textFieldStyle(.roundedBorder)
            TextField("URL template (optional), e.g. https://example.com/{value}", text: $newTypeURLTemplate)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif
            HStack {
                Spacer()
                if isSubmittingNewType {
                    ProgressView()
                        .controlSize(.small)
                }
                Button("Cancel") {
                    isCreatingType = false
                    pendingTypeRowID = nil
                }
                Button("Create Type") {
                    Task { await createType() }
                }
                .disabled(
                    isSubmittingNewType
                        || newTypeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
            }
            .controlSize(.small)
        }
    }

    private func load() async {
        loadState = .loading
        errorMessage = nil

        switch await BookServiceActor.shared.checkBookUpdatePermission(sourceID: bookID.sourceID) {
            case .allowed:
                break
            case .denied:
                loadState = .failed(
                    "Your account does not have permission to edit identifiers on this server."
                )
                return
            case .error(let message):
                loadState = .failed("Could not verify server permissions: \(message)")
                return
        }

        async let identifiersFetch = BookServiceActor.shared.fetchBookIdentifiers(for: bookID)
        async let typesFetch = BookServiceActor.shared.fetchIdentifierTypes(
            sourceID: bookID.sourceID
        )
        let (identifiers, fetchedTypes) = await (identifiersFetch, typesFetch)

        guard let fetchedTypes else {
            loadState = .failed("This server does not support identifiers.")
            return
        }

        types = fetchedTypes.sorted {
            typeLabel($0).localizedCaseInsensitiveCompare(typeLabel($1)) == .orderedAscending
        }
        rows = (identifiers ?? []).map { relation in
            let scope: Scope =
                relation.ebookUuid != nil
                ? .ebook
                : relation.audiobookUuid != nil
                    ? .audiobook : relation.readaloudUuid != nil ? .readaloud : .book
            return EditorRow(
                typeUuid: relation.identifierTypeUuid,
                value: relation.value,
                scope: scope,
                formatUuid: relation.ebookUuid ?? relation.audiobookUuid ?? relation.readaloudUuid,
            )
        }
        loadState = .ready
    }

    private func createType() async {
        let name = newTypeName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let template = newTypeURLTemplate.trimmingCharacters(in: .whitespacesAndNewlines)

        isSubmittingNewType = true
        defer { isSubmittingNewType = false }

        guard
            let created = await BookServiceActor.shared.createIdentifierType(
                name: name,
                urlTemplate: template.isEmpty ? nil : template,
                sourceID: bookID.sourceID,
            )
        else {
            errorMessage = "Could not create the identifier type."
            return
        }

        types.append(created)
        types.sort {
            typeLabel($0).localizedCaseInsensitiveCompare(typeLabel($1)) == .orderedAscending
        }
        if let rowID = pendingTypeRowID, let index = rows.firstIndex(where: { $0.id == rowID }) {
            rows[index].typeUuid = created.uuid
        }
        pendingTypeRowID = nil
        isCreatingType = false
        errorMessage = nil
    }

    private func save() {
        let payload = rows.compactMap { row -> IdentifierRelationPayload? in
            let value = row.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let typeUuid = row.typeUuid, !value.isEmpty else { return nil }
            let uuid = row.formatUuid ?? formatUuid(for: row.scope)
            return IdentifierRelationPayload(
                identifierTypeUuid: typeUuid,
                value: value,
                ebookUuid: row.scope == .ebook ? uuid : nil,
                audiobookUuid: row.scope == .audiobook ? uuid : nil,
                readaloudUuid: row.scope == .readaloud ? uuid : nil,
            )
        }

        isSaving = true
        errorMessage = nil
        Task {
            let success = await BookServiceActor.shared.replaceBookIdentifiers(
                for: bookID,
                identifiers: payload,
            )
            isSaving = false
            if success {
                dismiss()
            } else {
                errorMessage = "Could not save identifiers."
            }
        }
    }
}

#endif
