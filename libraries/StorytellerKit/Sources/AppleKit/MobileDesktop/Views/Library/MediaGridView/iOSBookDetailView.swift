#if os(iOS)
import SwiftUI

/// Navigation wrapper around the shared book-details surface.
struct iOSBookDetailView: View {
    let item: BookMetadata
    let mediaKind: MediaKind

    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.editMetadataAction) private var editMetadataAction
    @State private var selectedStatusName: String?
    @State private var isUpdatingStatus = false
    @State private var showOfflineError = false
    @State private var showingOptionsSheet = false
    @State private var isShowingRelatedBook = false
    @State private var inlineEdit = InlineMetadataEditModel()

    private var currentItem: BookMetadata {
        mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
    }

    private var sortedStatuses: [BookStatus] {
        mediaViewModel.availableStatusesBySourceID[currentItem.sourceID] ?? []
    }

    var body: some View {
        MediaGridInfoSidebar(
            item: currentItem,
            mediaKind: mediaKind,
            onClose: {},
            onReadNow: {},
            onRename: {},
            onDelete: {},
            showsInspectorToolbar: false,
            onRelatedItemChange: { isShowingRelatedBook = $0 },
            inlineEditModel: inlineEdit,
        )
        .metadataLinkDestinations(mediaKind: mediaKind)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .navigationBarBackButtonHidden(isShowingRelatedBook)
        .toolbar {
            if inlineEdit.isEditing {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        inlineEdit.endEditMode()
                    } label: {
                        Image(systemName: "checkmark")
                    }
                    .accessibilityLabel("Done editing")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingOptionsSheet = true
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .sheet(isPresented: $showingOptionsSheet) {
            BookOptionsSheet(
                item: currentItem,
                availableStatuses: sortedStatuses,
                selectedStatusName: $selectedStatusName,
                isUpdatingStatus: $isUpdatingStatus,
                showOfflineError: $showOfflineError,
                editMetadataAction: editMetadataAction,
                quickEditAction: quickEditAction,
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .onAppear {
            selectedStatusName = currentItem.status?.name
        }
        .onChange(of: currentItem.status?.name) { _, newValue in
            selectedStatusName = newValue
        }
        .alert("Cannot Change Status", isPresented: $showOfflineError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Please connect to the server to change the book status.")
        }
        .navigationDestination(for: SeriesNavIdentifier.self) { series in
            MediaGridView(
                title: series.name,
                searchText: "",
                mediaKind: mediaKind,
                viewOptionsKey: "seriesView.\(mediaKind.rawValue)",
                tagFilter: nil,
                seriesFilter: series.name,
                statusFilter: nil,
                defaultSort: "seriesPosition",
                preferredTileWidth: 110,
                minimumTileWidth: 90,
                columnBreakpoints: [
                    MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)
                ],
                initialNarrationFilterOption: .both,
            )
            .navigationTitle(series.name)
        }
    }

    private var quickEditAction: (() -> Void)? {
        guard mediaViewModel.isServerBook(currentItem.id) else { return nil }
        return {
            Task { @MainActor in
                await inlineEdit.beginEditMode(
                    for: currentItem,
                    mediaViewModel: mediaViewModel,
                )
            }
        }
    }
}

private struct BookOptionsSheet: View {
    let item: BookMetadata
    let availableStatuses: [BookStatus]
    @Binding var selectedStatusName: String?
    @Binding var isUpdatingStatus: Bool
    @Binding var showOfflineError: Bool
    let editMetadataAction: MetadataEditorAction?
    let quickEditAction: (() -> Void)?

    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirmation = false

    private var currentItem: BookMetadata {
        mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
    }

    private var sortedStatuses: [BookStatus] {
        availableStatuses.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    var body: some View {
        NavigationStack {
            List {
                NavigationLink {
                    StatusPickerView(
                        item: item,
                        availableStatuses: sortedStatuses,
                        selectedStatusName: $selectedStatusName,
                        isUpdatingStatus: $isUpdatingStatus,
                        showOfflineError: $showOfflineError,
                    )
                } label: {
                    HStack {
                        Label("Status", systemImage: "bookmark")
                        Spacer()
                        if isUpdatingStatus {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text(selectedStatusName ?? "-")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let quickEditAction {
                    Button {
                        dismiss()
                        Task { @MainActor in
                            await Task.yield()
                            quickEditAction()
                        }
                    } label: {
                        Label("Quick Edit", systemImage: "pencil.line")
                    }
                }

                if let editMetadataAction {
                    Button {
                        dismiss()
                        Task { @MainActor in
                            await Task.yield()
                            editMetadataAction([item.id])
                        }
                    } label: {
                        Label("Edit Metadata...", systemImage: "pencil")
                    }
                }

                if mediaViewModel.isLocalFolderBook(item.id) {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete from Folder", systemImage: "trash")
                        }
                    }
                }
            }
            .navigationTitle("Options")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog(
                "Delete \(currentItem.title)?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible,
            ) {
                Button("Delete", role: .destructive) {
                    Task {
                        if await mediaViewModel.deleteFolderBook(currentItem) {
                            dismiss()
                        }
                    }
                }
            } message: {
                Text(
                    "This permanently deletes \(currentItem.title) and all its files from the folder source."
                )
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            if selectedStatusName == nil {
                selectedStatusName = currentItem.status?.name
            }
        }
    }
}

private struct StatusPickerView: View {
    let item: BookMetadata
    let availableStatuses: [BookStatus]
    @Binding var selectedStatusName: String?
    @Binding var isUpdatingStatus: Bool
    @Binding var showOfflineError: Bool

    @Environment(\.dismiss) private var dismiss

    private var sortedStatuses: [BookStatus] {
        availableStatuses.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    var body: some View {
        List {
            ForEach(sortedStatuses, id: \.name) { status in
                Button {
                    Task { await updateStatus(to: status.name) }
                } label: {
                    HStack {
                        Text(status.name)
                            .foregroundStyle(.primary)
                        Spacer()
                        if status.name == selectedStatusName {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
                .disabled(isUpdatingStatus)
            }
        }
        .navigationTitle("Status")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func updateStatus(to statusName: String) async {
        guard statusName != selectedStatusName else { return }
        let sourceID = item.sourceID
        guard
            await BookServiceActor.shared.connectionStatus(sourceID: sourceID) == .connected
        else {
            showOfflineError = true
            return
        }

        isUpdatingStatus = true
        defer { isUpdatingStatus = false }

        let success = await BookServiceActor.shared.updateStatus(
            forBooks: [item.id],
            toStatusNamed: statusName,
        )

        if success {
            selectedStatusName = statusName
            dismiss()
        }
    }
}

#endif
