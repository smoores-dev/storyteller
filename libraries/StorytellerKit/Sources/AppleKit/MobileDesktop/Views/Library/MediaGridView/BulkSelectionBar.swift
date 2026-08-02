#if os(iOS) || os(macOS)
import SwiftUI

/// Floating bar shown while the grid has a multi-selection. Hosts the bulk actions
/// (status, collections, tags, delete) and inline progress/error feedback.
struct BulkSelectionBar: View {
    let selection: BulkSelectionModel
    /// Currently displayed items in visual order; bounds Select All and resolves
    /// selected ids back to metadata.
    let items: [BookMetadata]
    @Environment(MediaViewModel.self) private var mediaViewModel

    @State private var collections: [StorytellerCollection] = []
    @State private var showAddTagsSheet = false
    @State private var addCreatorTarget: CreatorRoleSheetTarget?
    @State private var showDeleteConfirmation = false

    var body: some View {
        HStack(spacing: 12) {
            Text("\(selection.count) selected")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .fixedSize()

            Button(allSelected ? "Deselect All" : "Select All") {
                if allSelected {
                    selection.deselectAll()
                } else {
                    selection.selectAll(items)
                }
            }
            .font(.subheadline)
            .buttonStyle(.borderless)
            .fixedSize()

            if selection.isRunningAction {
                ProgressView()
                    .controlSize(.small)
            } else if let message = selection.errorMessage {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }

            actionsMenu

            Button {
                selection.clear()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Clear selection")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
        .task(id: singleServerSourceID) {
            guard let sourceID = singleServerSourceID else {
                collections = []
                return
            }
            collections =
                await BookServiceActor.shared.fetchCollections(sourceID: sourceID) ?? []
        }
        .sheet(isPresented: $showAddTagsSheet) {
            BulkNameEntrySheet(
                title: "Add Tags",
                prompt: "Tags (comma-separated)",
            ) { tagNames in
                addTags(tagNames)
            }
        }
        .sheet(item: $addCreatorTarget) { target in
            BulkNameEntrySheet(
                title: "Add \(target.role.pluralLabel)",
                prompt: "\(target.role.pluralLabel) (comma-separated)",
            ) { names in
                addCreators(names, role: target.role)
            }
        }
        .sheet(isPresented: $showDeleteConfirmation) {
            BulkDeleteConfirmationSheet(count: selection.count) { preventReImport in
                deleteSelected(preventReImport: preventReImport)
            }
        }
    }

    private var selectedBooks: [BookMetadata] {
        items.filter { selection.selectedIDs.contains($0.id) }
    }

    private var selectedBookIDs: [BookID] {
        selectedBooks.map(\.id)
    }

    private var allSelected: Bool {
        !items.isEmpty && selection.count == items.count
    }

    /// Non-nil when every selected book belongs to the same Storyteller server; the
    /// server-backed bulk actions are only offered in that situation.
    private var singleServerSourceID: BookSourceID? {
        let sourceIDs = Set(selectedBooks.map(\.sourceID))
        guard sourceIDs.count == 1, let sourceID = sourceIDs.first else { return nil }
        guard
            mediaViewModel.bookSources.first(where: { $0.id == sourceID })?.kind
                == .storyteller
        else { return nil }
        return sourceID
    }

    private var actionsMenu: some View {
        Menu {
            if let sourceID = singleServerSourceID {
                statusMenu(sourceID: sourceID)
                collectionMenus(sourceID: sourceID)
                tagMenus(sourceID: sourceID)
                creatorMenus(sourceID: sourceID)
                Divider()
                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete from Server...", systemImage: "trash")
                }
            } else if !selection.isEmpty {
                Text("Bulk actions need books from a single Storyteller server")
            }
        } label: {
            #if os(iOS)
            Label("Actions", systemImage: "ellipsis.circle")
                .labelStyle(.iconOnly)
                .font(.title3)
            #else
            Label("Actions", systemImage: "ellipsis.circle")
                .font(.subheadline)
            #endif
        }
        .disabled(selection.isEmpty || selection.isRunningAction)
        #if os(macOS)
        .menuStyle(.borderlessButton)
        .fixedSize()
        #endif
    }

    @ViewBuilder
    private func statusMenu(sourceID: BookSourceID) -> some View {
        let statuses = mediaViewModel.availableStatusesBySourceID[sourceID] ?? []
        if !statuses.isEmpty {
            Menu {
                ForEach(statuses, id: \.name) { status in
                    Button(status.name) {
                        setStatus(status)
                    }
                }
            } label: {
                Label("Set Status", systemImage: "bookmark")
            }
        }
    }

    @ViewBuilder
    private func collectionMenus(sourceID: BookSourceID) -> some View {
        if !collections.isEmpty {
            Menu {
                ForEach(collections, id: \.uuid) { collection in
                    Button(collection.name) {
                        let ids = selectedBookIDs
                        run("Could not add to \(collection.name)") {
                            await BookServiceActor.shared.addBooks(
                                ids,
                                toCollectionUUIDs: [collection.uuid],
                                sourceID: sourceID,
                            )
                        }
                    }
                }
            } label: {
                Label("Add to Collection", systemImage: "folder.badge.plus")
            }
        }

        let removable = removableCollections
        if !removable.isEmpty {
            Menu {
                ForEach(removable, id: \.uuid) { collection in
                    Button(collection.name) {
                        let ids = selectedBookIDs
                        run("Could not remove from \(collection.name)") {
                            await BookServiceActor.shared.removeBooks(
                                ids,
                                fromCollectionUUIDs: [collection.uuid],
                                sourceID: sourceID,
                            )
                        }
                    }
                }
            } label: {
                Label("Remove from Collection", systemImage: "folder.badge.minus")
            }
        }
    }

    @ViewBuilder
    private func tagMenus(sourceID: BookSourceID) -> some View {
        Button {
            showAddTagsSheet = true
        } label: {
            Label("Add Tags...", systemImage: "tag")
        }

        let removable = removableTags
        if !removable.isEmpty {
            Menu {
                ForEach(removable, id: \.uuid) { tag in
                    Button(tag.name) {
                        let ids = selectedBookIDs
                        run("Could not remove tag \(tag.name)") {
                            await BookServiceActor.shared.removeTags(
                                [tag.uuid],
                                fromBooks: ids,
                                sourceID: sourceID,
                            )
                        }
                    }
                }
            } label: {
                Label("Remove Tags", systemImage: "tag.slash")
            }
        }
    }

    @ViewBuilder
    private func creatorMenus(sourceID: BookSourceID) -> some View {
        Menu {
            ForEach(CreatorRole.allCases, id: \.self) { role in
                Button("\(role.pluralLabel)...") {
                    addCreatorTarget = CreatorRoleSheetTarget(role: role)
                }
            }
        } label: {
            Label("Add Creators", systemImage: "person.badge.plus")
        }

        let removableByRole = CreatorRole.allCases.map { ($0, removableCreators(role: $0)) }
            .filter { !$0.1.isEmpty }
        if !removableByRole.isEmpty {
            Menu {
                ForEach(removableByRole, id: \.0) { role, creators in
                    Menu {
                        ForEach(creators) { creator in
                            Button(creator.name) {
                                let ids = selectedBookIDs
                                run("Could not remove \(creator.name)") {
                                    await BookServiceActor.shared.removeCreators(
                                        [creator.uuid],
                                        fromBooks: ids,
                                        role: role,
                                        sourceID: sourceID,
                                    )
                                }
                            }
                        }
                    } label: {
                        Text(role.pluralLabel)
                    }
                }
            } label: {
                Label("Remove Creators", systemImage: "person.badge.minus")
            }
        }
    }

    private struct NamedUUID: Identifiable {
        let uuid: String
        let name: String
        var id: String { uuid }
    }

    /// Union of collections (with server uuids) across the selected books.
    private var removableCollections: [NamedUUID] {
        var byUUID: [String: String] = [:]
        for book in selectedBooks {
            for summary in book.collections ?? [] {
                if let uuid = summary.uuid {
                    byUUID[uuid] = summary.name
                }
            }
        }
        return byUUID
            .map { NamedUUID(uuid: $0.key, name: $0.value) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Union of tags (with server uuids) across the selected books.
    private var removableTags: [NamedUUID] {
        var byUUID: [String: String] = [:]
        for book in selectedBooks {
            for tag in book.tags ?? [] {
                if let uuid = tag.uuid {
                    byUUID[uuid] = tag.name
                }
            }
        }
        return byUUID
            .map { NamedUUID(uuid: $0.key, name: $0.value) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Union of creators in a role across the selected books. The payload carries authors
    /// and narrators both in their own arrays and in the flat `creators` list depending on
    /// server version, so all three are folded together and deduplicated by uuid.
    private func removableCreators(role: CreatorRole) -> [NamedUUID] {
        var byUUID: [String: String] = [:]
        for book in selectedBooks {
            let roled = (book.creators ?? []).filter { $0.role == role.rawValue }
            let named: [BookCreator]
            switch role {
                case .author: named = (book.authors ?? []) + roled
                case .narrator: named = (book.narrators ?? []) + roled
                case .translator: named = roled
            }
            for creator in named {
                if let uuid = creator.uuid, let name = creator.name {
                    byUUID[uuid] = name
                }
            }
        }
        return byUUID
            .map { NamedUUID(uuid: $0.key, name: $0.value) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func addCreators(_ names: [String], role: CreatorRole) {
        guard !names.isEmpty, let sourceID = singleServerSourceID else { return }
        let ids = selectedBookIDs
        run("Could not add \(role.pluralLabel.lowercased())") {
            await BookServiceActor.shared.addCreators(
                names,
                toBooks: ids,
                role: role,
                sourceID: sourceID,
            )
        }
    }

    private func setStatus(_ status: BookStatus) {
        let ids = selectedBookIDs
        run("Could not set status") {
            // Glowup servers key the bulk endpoint by status uuid; older servers resolve
            // through the name-based path, which already works there.
            if let uuid = status.uuid,
                await BookServiceActor.shared.updateStatus(forBooks: ids, toStatusUUID: uuid)
            {
                return true
            }
            return await BookServiceActor.shared.updateStatus(
                forBooks: ids,
                toStatusNamed: status.name,
            )
        }
    }

    private func addTags(_ tagNames: [String]) {
        guard !tagNames.isEmpty else { return }
        let ids = selectedBookIDs
        run("Could not add tags") {
            await BookServiceActor.shared.addTags(tagNames, toBooks: ids)
        }
    }

    private func deleteSelected(preventReImport: Bool) {
        let ids = selectedBookIDs
        run("Could not delete books") {
            let success = await BookServiceActor.shared.deleteBooks(
                ids,
                preventReImport: preventReImport,
            )
            if success {
                selection.clear()
            }
            return success
        }
    }

    private func run(
        _ failureMessage: String,
        _ operation: @escaping @MainActor () async -> Bool,
    ) {
        guard !selection.isRunningAction else { return }
        let selection = selection
        let mediaViewModel = mediaViewModel
        selection.isRunningAction = true
        selection.errorMessage = nil
        Task { @MainActor in
            let success = await operation()
            await mediaViewModel.refreshMetadata(source: "BulkSelectionBar")
            selection.isRunningAction = false
            guard !success else { return }
            selection.errorMessage = failureMessage
            try? await Task.sleep(for: .seconds(4))
            if selection.errorMessage == failureMessage {
                selection.errorMessage = nil
            }
        }
    }
}

/// Checkmark badge shown on a card's cover corner while multi-selecting.
struct BulkSelectionCheckmark: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            if isSelected {
                Circle()
                    .fill(Color.accentColor)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                Circle()
                    .fill(.black.opacity(0.35))
                Circle()
                    .strokeBorder(.white.opacity(0.9), lineWidth: 1.5)
            }
        }
        .frame(width: 22, height: 22)
        .shadow(color: .black.opacity(0.35), radius: 2)
    }
}

extension CreatorRole {
    var pluralLabel: String {
        switch self {
            case .author: return "Authors"
            case .narrator: return "Narrators"
            case .translator: return "Translators"
        }
    }
}

/// `sheet(item:)` needs an Identifiable payload and `CreatorRole` lives in another module.
private struct CreatorRoleSheetTarget: Identifiable {
    let role: CreatorRole
    var id: String { role.rawValue }
}

private struct BulkNameEntrySheet: View {
    let title: String
    let prompt: String
    let onAdd: ([String]) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    private var names: [String] {
        text
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.headline)
            TextField(prompt, text: $text)
                .textFieldStyle(.roundedBorder)
                .onSubmit(submit)
            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                Button("Add", action: submit)
                    .buttonStyle(.borderedProminent)
                    .disabled(names.isEmpty)
            }
        }
        .padding(20)
        #if os(macOS)
        .frame(width: 320)
        #else
        .presentationDetents([.height(180)])
        #endif
    }

    private func submit() {
        guard !names.isEmpty else { return }
        onAdd(names)
        dismiss()
    }
}

private struct BulkDeleteConfirmationSheet: View {
    let count: Int
    let onDelete: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var preventReImport = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(count == 1 ? "Delete 1 book from the server?" : "Delete \(count) books from the server?")
                .font(.headline)
            Text("This permanently removes the selected books and their media from the server. This cannot be undone.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Toggle("Prevent re-import", isOn: $preventReImport)
            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                Button("Delete", role: .destructive) {
                    onDelete(preventReImport)
                    dismiss()
                }
            }
        }
        .padding(20)
        #if os(macOS)
        .frame(width: 360)
        #else
        .presentationDetents([.height(240)])
        #endif
    }
}
#endif
