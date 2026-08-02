#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#endif

public struct MetadataEditorView: View {
    public let initialBookIds: [BookID]
    private let hasUnsavedChanges: Binding<Bool>?
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var viewModel = MetadataEditorViewModel()
    @State private var selectedScope: MetadataEditorScope = .work
    @State private var selectedCoverScope: MetadataCoverScope = .audiobook
    @State private var showsEditionScopes = false
    @AppStorage("metadataEditor.hideWarning") private var hideWarning = false
    @State private var showWarning = true
    @State private var showHardcoverImportSheet = false
    @State private var showCoverImportSheet = false
    @State private var showHardcoverDataDump = false
    @State private var showErrorDetail = false
    @State private var pendingRevertBookId: BookID?
    @State private var pendingSaveBookId: BookID?
    @State private var selectedSidebarBookIds: Set<BookID> = []
    @State private var sidebarSelectionAnchorId: BookID?
    @State private var selectedSidebarListBookId: BookID?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var iOSNavigationPath: [BookID] = []
    @FocusState private var isSidebarFocused: Bool
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    public init(initialBookIds: [BookID], hasUnsavedChanges: Binding<Bool>? = nil) {
        self.initialBookIds = initialBookIds
        self.hasUnsavedChanges = hasUnsavedChanges
    }

    public var body: some View {
        ZStack {
            VStack(spacing: 0) {
                if showWarning && !hideWarning {
                    warningBanner
                }

                #if os(iOS)
                if isCompactIOS {
                    sectionContent
                } else {
                    NavigationSplitView(columnVisibility: $columnVisibility) {
                        bookSidebar
                    } detail: {
                        sectionContent
                            .clipped()
                    }
                    .navigationSplitViewStyle(.balanced)
                }
                #else
                NavigationSplitView(columnVisibility: $columnVisibility) {
                    bookSidebar
                } detail: {
                    sectionContent
                        .frame(minWidth: 460)
                        .clipped()
                }
                .navigationSplitViewStyle(.balanced)
                #endif

                #if os(iOS)
                if !isCompactIOS || viewModel.selectedBookId != nil {
                    Divider()
                    bottomBar
                }
                #else
                Divider()
                bottomBar
                #endif
            }
        }
        .contentShape(Rectangle())
        .simultaneousGesture(
            TapGesture(count: 5)
                .onEnded {
                    showsEditionScopes = true
                    if selectedScope == .covers {
                        selectedScope = .work
                    }
                }
        )
        #if os(macOS)
        .frame(minWidth: 700, minHeight: 560)
        #endif
        .navigationTitle(viewModel.selectedBook?.displayTitle ?? "Edit Metadata")
        #if os(macOS)
        .background(
            MetadataEditorWindowController(
                title: windowTitle,
                shouldPromptBeforeClose: viewModel.hasAnyDirtyBooks,
                isSaving: viewModel.isSaving,
                onSaveBeforeClose: saveBeforeClosing,
                onWindowWillClose: resetEditorSession,
                onWindowAvailable: { window in
                    MetadataEditorWindowRegistry.updateWindow(window)
                },
            )
            .frame(width: 0, height: 0)
        )
        #endif
        .onAppear {
            columnVisibility = .all
            viewModel.addBooks(ids: initialBookIds, from: mediaViewModel.library)
            if let selectedBookId = viewModel.selectedBookId {
                selectedSidebarBookIds = [selectedBookId]
            }
            hasUnsavedChanges?.wrappedValue = viewModel.hasAnyDirtyBooks
            #if os(macOS)
            MetadataEditorWindowRegistry.register { bookIds in
                viewModel.addBooks(ids: bookIds, from: mediaViewModel.library)
                if let firstBookId = bookIds.first {
                    viewModel.selectedBookId = firstBookId
                    selectedSidebarBookIds = [firstBookId]
                }
            }
            #endif
        }
        .task(id: viewModel.selectedBookId?.sourceID) {
            await loadAvailableStatusesIfNeeded()
        }
        .task(id: viewModel.selectedBookId) {
            if let bookId = viewModel.selectedBookId {
                await viewModel.loadIdentifiers(for: bookId)
            }
        }
        .onChange(of: viewModel.hasAnyDirtyBooks) { _, isDirty in
            hasUnsavedChanges?.wrappedValue = isDirty
        }
        .onDisappear {
            resetEditorSession()
        }
        .sheet(isPresented: $showHardcoverImportSheet) {
            if let book = viewModel.selectedBook {
                UnifiedMetadataImportView(
                    bookTitle: book.title,
                    bookAuthor: book.authors.first,
                    currentBook: book,
                    onImport: { imports, fields, identifierChanges in
                        viewModel.applyImport(imports: imports, fields: fields, for: book.id)
                        if let identifierChanges {
                            viewModel.applyIdentifierChanges(identifierChanges, for: book.id)
                        }
                    },
                )
            }
        }
        .sheet(isPresented: $showCoverImportSheet) {
            if let bookId = viewModel.selectedBookId {
                MetadataCoverImportView(bookId: bookId, viewModel: viewModel)
            }
        }
        .alert("Revert all changes to this book?", isPresented: revertAllAlertBinding) {
            Button("Revert All", role: .destructive) {
                if let pendingRevertBookId {
                    viewModel.revertAllFields(for: pendingRevertBookId)
                }
                pendingRevertBookId = nil
            }
            Button("Cancel", role: .cancel) {
                pendingRevertBookId = nil
            }
        } message: {
            Text(
                "This restores the book to the Storyteller metadata loaded when the editor opened."
            )
        }
        .background {
            Button("Select All Sidebar Books") {
                selectAllSidebarBooks()
            }
            .keyboardShortcut("a", modifiers: .command)
            .disabled(!isSidebarFocused)
            .opacity(0)
            .frame(width: 0, height: 0)
        }
    }

    private var revertAllAlertBinding: Binding<Bool> {
        Binding(
            get: { pendingRevertBookId != nil },
            set: { isPresented in
                if !isPresented {
                    pendingRevertBookId = nil
                }
            },
        )
    }

    private var saveConfirmationBinding: Binding<Bool> {
        Binding(
            get: { pendingSaveBookId != nil },
            set: { isPresented in
                if !isPresented {
                    pendingSaveBookId = nil
                }
            },
        )
    }

    @ViewBuilder
    private var warningBanner: some View {
        Group {
            if isCompactIOS {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.yellow)
                            .font(.title3)
                        Text("Experimental Feature")
                            .font(.headline)
                        Spacer()
                        Button(action: { showWarning = false }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.borderless)
                    }

                    Text(
                        "Back up your database before editing metadata. This feature could cause data corruption."
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                    Toggle("Don't show again", isOn: $hideWarning)
                        .font(.callout)
                }
            } else {
                HStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Experimental Feature")
                            .font(.headline)
                        Text(
                            "Back up your database before editing metadata. This feature could cause data corruption."
                        )
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Toggle("Don't show again", isOn: $hideWarning)
                        #if os(macOS)
                    .toggleStyle(.checkbox)
                        #endif
                        .font(.callout)

                    Button(action: { showWarning = false }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .padding(12)
        .background(.yellow.opacity(0.1))
        .clipped()
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(.yellow.opacity(0.3)),
            alignment: .bottom,
        )
    }

    @ViewBuilder
    private var bookSidebar: some View {
        #if os(iOS)
        if isCompactIOS {
            List {
                ForEach(viewModel.books) { book in
                    Button {
                        selectSidebarBook(id: book.id)
                        iOSNavigationPath = [book.id]
                    } label: {
                        MetadataEditorBookRailItem(
                            book: book,
                            image: mediaViewModel.coverImage(for: book.originalMetadata),
                            compact: false,
                            isSelected: false,
                            saveResult: viewModel.saveResults[book.id],
                            action: nil,
                            removeAction: {
                                removeSidebarBook(id: book.id)
                            },
                            showsDisclosure: true,
                        )
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10))
                }
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 250)
        } else {
            List(selection: $selectedSidebarListBookId) {
                ForEach(viewModel.books) { book in
                    MetadataEditorBookRailItem(
                        book: book,
                        image: mediaViewModel.coverImage(for: book.originalMetadata),
                        compact: false,
                        isSelected: selectedSidebarBookIds.contains(book.id),
                        saveResult: viewModel.saveResults[book.id],
                        action: {
                            selectSidebarBook(id: book.id)
                        },
                        removeAction: {
                            removeSidebarBook(id: book.id)
                        },
                        showsDisclosure: false,
                    )
                    .tag(book.id)
                    .listRowInsets(EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10))
                }
            }
            .onChange(of: selectedSidebarListBookId) { _, newValue in
                guard let newValue else { return }
                selectSidebarBook(id: newValue)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 250)
        }
        #else
        VStack(spacing: 0) {
            List(selection: $selectedSidebarListBookId) {
                ForEach(viewModel.books) { book in
                    MetadataEditorBookRailItem(
                        book: book,
                        image: mediaViewModel.coverImage(for: book.originalMetadata),
                        compact: false,
                        isSelected: selectedSidebarBookIds.contains(book.id),
                        saveResult: viewModel.saveResults[book.id],
                        action: {
                            selectSidebarBook(id: book.id)
                            #if os(iOS)
                            columnVisibility = .detailOnly
                            #endif
                        },
                        removeAction: {
                            removeSidebarBook(id: book.id)
                        },
                        showsDisclosure: sidebarRowsShowDisclosure,
                    )
                    .tag(book.id)
                    .listRowInsets(EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10))
                }
            }
        }
        .onChange(of: selectedSidebarListBookId) { _, newValue in
            guard let newValue else { return }
            selectSidebarBook(id: newValue)
        }
        .navigationSplitViewColumnWidth(min: 180, ideal: 250)
        #endif
    }

    private var sidebarRowsShowDisclosure: Bool {
        #if os(iOS)
        true
        #else
        false
        #endif
    }

    private func selectSidebarBook(id: BookID) {
        isSidebarFocused = true
        #if os(macOS)
        let isMultiSelect = NSEvent.modifierFlags.contains(.command)
        let isRangeSelect = NSEvent.modifierFlags.contains(.shift)
        #else
        let isMultiSelect = false
        let isRangeSelect = false
        #endif

        if isRangeSelect, let range = sidebarBookIdRange(from: sidebarSelectionAnchorId, to: id) {
            selectedSidebarBookIds.formUnion(range)
            viewModel.selectedBookId = id
        } else if isMultiSelect {
            if selectedSidebarBookIds.contains(id) {
                guard selectedSidebarBookIds.count > 1 else {
                    viewModel.selectedBookId = id
                    return
                }
                selectedSidebarBookIds.remove(id)
                if viewModel.selectedBookId == id {
                    viewModel.selectedBookId = selectedSidebarBookIds.first
                }
            } else {
                selectedSidebarBookIds.insert(id)
                viewModel.selectedBookId = id
                sidebarSelectionAnchorId = id
            }
        } else {
            selectedSidebarBookIds = [id]
            viewModel.selectedBookId = id
            sidebarSelectionAnchorId = id
        }
    }

    private func selectAllSidebarBooks() {
        let ids = Set(viewModel.books.map(\.id))
        guard !ids.isEmpty else { return }
        selectedSidebarBookIds = ids
        sidebarSelectionAnchorId = viewModel.selectedBookId ?? viewModel.books.first?.id
    }

    private func sidebarBookIdRange(from anchorId: BookID?, to id: BookID) -> Set<BookID>? {
        let ids = viewModel.books.map(\.id)
        guard let anchorId, let start = ids.firstIndex(of: anchorId),
            let end = ids.firstIndex(of: id)
        else {
            return nil
        }
        let range = start <= end ? start...end : end...start
        return Set(range.map { ids[$0] })
    }

    private func removeSidebarBook(id: BookID) {
        let ids = selectedSidebarBookIds.contains(id) ? selectedSidebarBookIds : [id]
        removeSidebarBooks(ids)
    }

    private func removeSidebarBooks(_ ids: Set<BookID>) {
        viewModel.removeBooks(ids: ids)
        if let selectedBookId = viewModel.selectedBookId {
            selectedSidebarBookIds = [selectedBookId]
            sidebarSelectionAnchorId = selectedBookId
        } else {
            selectedSidebarBookIds = []
            sidebarSelectionAnchorId = nil
        }
    }

    @ViewBuilder
    private var sectionContent: some View {
        MetadataEditorBookForm(
            viewModel: viewModel,
            selectedScope: $selectedScope,
            selectedCoverScope: $selectedCoverScope,
            showsEditionScopes: showsEditionScopes,
            openHardcoverImport: { showHardcoverImportSheet = true },
            revertCurrentBook: {
                pendingRevertBookId = viewModel.selectedBookId
            },
        )
    }

    private var windowTitle: String {
        guard let book = viewModel.selectedBook else { return "Edit Metadata" }
        return "Edit Metadata - \(book.displayTitle)"
    }

    private func loadAvailableStatusesIfNeeded() async {
        guard let sourceID = viewModel.selectedBookId?.sourceID else { return }
        let statuses = await BookServiceActor.shared.getAvailableStatuses(sourceID: sourceID)
        viewModel.setAvailableStatuses(statuses, sourceID: sourceID)
    }

    private func resetEditorSession() {
        #if os(macOS)
        MetadataEditorWindowRegistry.unregister()
        #endif
        viewModel.books.removeAll()
        viewModel.selectedBookId = nil
        viewModel.saveResults.removeAll()
        viewModel.saveError = nil
        viewModel.clearTransientImportState()
        hasUnsavedChanges?.wrappedValue = false
        selectedSidebarBookIds.removeAll()
        sidebarSelectionAnchorId = nil
        iOSNavigationPath = []
    }

    #if os(macOS)
    private func saveBeforeClosing() async -> Bool {
        guard !viewModel.hasAnyValidationErrors else {
            viewModel.saveError = "Fix validation errors before saving."
            return false
        }

        await viewModel.saveAll(mediaViewModel: mediaViewModel)
        return !viewModel.hasAnyDirtyBooks && viewModel.saveError == nil
    }

    private struct MetadataEditorWindowController: NSViewRepresentable {
        let title: String
        let shouldPromptBeforeClose: Bool
        let isSaving: Bool
        let onSaveBeforeClose: () async -> Bool
        let onWindowWillClose: () -> Void
        let onWindowAvailable: (NSWindow?) -> Void

        func makeNSView(context: Context) -> NSView {
            let view = NSView()
            DispatchQueue.main.async {
                view.window?.title = title
                view.window?.delegate = context.coordinator
                context.coordinator.window = view.window
                onWindowAvailable(view.window)
            }
            return view
        }

        func updateNSView(_ view: NSView, context: Context) {
            context.coordinator.title = title
            context.coordinator.shouldPromptBeforeClose = shouldPromptBeforeClose
            context.coordinator.isSaving = isSaving
            context.coordinator.onSaveBeforeClose = onSaveBeforeClose
            context.coordinator.onWindowWillClose = onWindowWillClose
            DispatchQueue.main.async {
                view.window?.title = title
                view.window?.delegate = context.coordinator
                context.coordinator.window = view.window
                onWindowAvailable(view.window)
            }
        }

        func makeCoordinator() -> Coordinator {
            Coordinator(
                title: title,
                shouldPromptBeforeClose: shouldPromptBeforeClose,
                isSaving: isSaving,
                onSaveBeforeClose: onSaveBeforeClose,
                onWindowWillClose: onWindowWillClose,
                onWindowAvailable: onWindowAvailable,
            )
        }

        final class Coordinator: NSObject, NSWindowDelegate {
            var title: String
            var shouldPromptBeforeClose: Bool
            var isSaving: Bool
            var onSaveBeforeClose: () async -> Bool
            var onWindowWillClose: () -> Void
            var onWindowAvailable: (NSWindow?) -> Void
            weak var window: NSWindow?
            private var allowClose = false
            private var didClose = false

            init(
                title: String,
                shouldPromptBeforeClose: Bool,
                isSaving: Bool,
                onSaveBeforeClose: @escaping () async -> Bool,
                onWindowWillClose: @escaping () -> Void,
                onWindowAvailable: @escaping (NSWindow?) -> Void,
            ) {
                self.title = title
                self.shouldPromptBeforeClose = shouldPromptBeforeClose
                self.isSaving = isSaving
                self.onSaveBeforeClose = onSaveBeforeClose
                self.onWindowWillClose = onWindowWillClose
                self.onWindowAvailable = onWindowAvailable
            }

            func windowShouldClose(_ sender: NSWindow) -> Bool {
                guard !allowClose else { return true }
                guard shouldPromptBeforeClose else { return true }
                guard !isSaving else { return false }

                let alert = NSAlert()
                alert.messageText = "Save changes before closing?"
                alert.informativeText =
                    "The metadata editor has unsaved changes. Save them to Storyteller before closing?"
                alert.addButton(withTitle: "Save All Books")
                alert.addButton(withTitle: "Don't Save")
                alert.addButton(withTitle: "Cancel")

                switch alert.runModal() {
                    case .alertFirstButtonReturn:
                        Task { @MainActor in
                            if await onSaveBeforeClose() {
                                allowClose = true
                                sender.close()
                                allowClose = false
                            }
                        }
                        return false
                    case .alertSecondButtonReturn:
                        return true
                    default:
                        return false
                }
            }

            func windowWillClose(_ notification: Notification) {
                guard !didClose else { return }
                didClose = true
                onWindowWillClose()
                onWindowAvailable(nil)
            }
        }
    }
    #endif

    private var currentBookErrors: [MetadataEditorViewModel.ValidationError] {
        guard let bookId = viewModel.selectedBookId else { return [] }
        return viewModel.validationErrors(for: bookId)
    }

    @ViewBuilder
    private var bottomBar: some View {
        #if os(iOS)
        if isCompactIOS {
            iOSCompactBottomBar
        } else {
            iOSBottomBar
        }
        #else
        HStack {
            if let error = viewModel.saveError {
                HStack(spacing: 4) {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.callout)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Button {
                        showErrorDetail = true
                    } label: {
                        Image(systemName: "info.circle")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showErrorDetail) {
                        Text(error)
                            .font(.callout)
                            .padding()
                            .frame(maxWidth: 400)
                            .textSelection(.enabled)
                    }
                }
            } else if !currentBookErrors.isEmpty {
                Label(
                    currentBookErrors.map(\.message).joined(separator: "; "),
                    systemImage: "exclamationmark.triangle",
                )
                .foregroundStyle(.red)
                .font(.callout)
            } else if viewModel.books.count > 1 {
                Text("\(viewModel.books.count) books loaded")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if viewModel.isSaving {
                ProgressView()
                    .controlSize(.small)
                    .padding(.trailing, 4)
            }

            Button {
                showHardcoverDataDump = true
            } label: {
                Image(systemName: "info.circle")
            }
            .buttonStyle(.borderless)
            .disabled(viewModel.selectedBookId == nil)
            .help("Show raw Hardcover imported data")
            .popover(isPresented: $showHardcoverDataDump, arrowEdge: .bottom) {
                hardcoverDataDumpPopover
            }

            Button("Import Metadata") {
                showHardcoverImportSheet = true
            }
            .disabled(viewModel.selectedBookId == nil)

            Button("Import Covers") {
                showCoverImportSheet = true
            }
            .disabled(viewModel.selectedBook == nil)
            .help("Import covers")

            Button("Save Current Book to Storyteller") {
                guard let bookId = viewModel.selectedBookId else { return }
                Task { @MainActor in
                    await viewModel.saveSingle(bookId, mediaViewModel: mediaViewModel)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(
                viewModel.isSaving || viewModel.selectedBookId == nil
                    || !(viewModel.books.first { $0.id == viewModel.selectedBookId }?.hasDirtyFields
                        ?? false)
                    || viewModel.selectedBookId.map { viewModel.hasValidationErrors(for: $0) }
                        ?? true
            )
            .keyboardShortcut("s", modifiers: .command)

            Button("Save All Books to Storyteller") {
                Task { @MainActor in
                    await viewModel.saveAll(mediaViewModel: mediaViewModel)
                }
            }
            .disabled(
                viewModel.isSaving || !viewModel.hasAnyDirtyBooks
                    || viewModel.hasAnyValidationErrors
            )
        }
        .padding(12)
        #endif
    }

    private var iOSCompactBottomBar: some View {
        VStack(spacing: 6) {
            iOSStatusLine

            HStack(alignment: .top, spacing: 10) {
                if viewModel.isSaving {
                    ProgressView()
                        .controlSize(.small)
                }

                iOSBottomBarButton("Import Metadata", systemImage: "square.and.arrow.down") {
                    showHardcoverImportSheet = true
                }
                .disabled(viewModel.selectedBookId == nil)

                iOSBottomBarButton("Import Covers", systemImage: "photo.on.rectangle") {
                    showCoverImportSheet = true
                }
                .disabled(viewModel.selectedBook == nil)

                iOSBottomBarButton("Save to Storyteller", systemImage: "tray.and.arrow.up") {
                    pendingSaveBookId = viewModel.selectedBookId
                }
                .disabled(
                    viewModel.isSaving || viewModel.selectedBookId == nil
                        || !(viewModel.books.first { $0.id == viewModel.selectedBookId }?
                            .hasDirtyFields
                            ?? false)
                        || (viewModel.selectedBookId.map {
                            viewModel.hasValidationErrors(for: $0)
                        } ?? true)
                )
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .alert("Save metadata to Storyteller?", isPresented: saveConfirmationBinding) {
            Button("Save") {
                if let pendingSaveBookId {
                    Task { @MainActor in
                        await viewModel.saveSingle(
                            pendingSaveBookId,
                            mediaViewModel: mediaViewModel,
                        )
                    }
                }
                pendingSaveBookId = nil
            }
            Button("Cancel", role: .cancel) {
                pendingSaveBookId = nil
            }
        } message: {
            Text("This writes the current book's staged metadata changes to Storyteller.")
        }
    }

    @ViewBuilder
    private var iOSStatusLine: some View {
        if let error = viewModel.saveError {
            Label(error, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
                .font(.caption)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if !currentBookErrors.isEmpty {
            Label(
                currentBookErrors.map(\.message).joined(separator: "; "),
                systemImage: "exclamationmark.triangle",
            )
            .foregroundStyle(.red)
            .font(.caption)
            .lineLimit(3)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if let bookId = viewModel.selectedBookId,
            viewModel.saveResults[bookId] == true,
            !(viewModel.books.first { $0.id == bookId }?.hasDirtyFields ?? false)
        {
            Label("Saved to Storyteller", systemImage: "checkmark.circle")
                .foregroundStyle(.green)
                .font(.caption)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var iOSBottomBar: some View {
        VStack(spacing: 6) {
            iOSStatusLine

            iOSBottomBarRegularButtons
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
    }

    private var iOSBottomBarRegularButtons: some View {
        HStack(alignment: .top, spacing: 10) {
            if viewModel.isSaving {
                ProgressView()
                    .controlSize(.small)
            }

            iOSBottomBarButton("Import Metadata", systemImage: "square.and.arrow.down") {
                showHardcoverImportSheet = true
            }
            .disabled(viewModel.selectedBookId == nil)

            iOSBottomBarButton("Import Covers", systemImage: "photo.on.rectangle") {
                showCoverImportSheet = true
            }
            .disabled(viewModel.selectedBook == nil)

            iOSBottomBarButton("Save Current", systemImage: "tray.and.arrow.up") {
                guard let bookId = viewModel.selectedBookId else { return }
                Task { @MainActor in
                    await viewModel.saveSingle(bookId, mediaViewModel: mediaViewModel)
                }
            }
            .disabled(
                viewModel.isSaving || viewModel.selectedBookId == nil
                    || !(viewModel.books.first { $0.id == viewModel.selectedBookId }?.hasDirtyFields
                        ?? false)
                    || viewModel.selectedBookId.map { viewModel.hasValidationErrors(for: $0) }
                        ?? true
            )

            iOSBottomBarButton("Save All", systemImage: "tray.full") {
                Task { @MainActor in
                    await viewModel.saveAll(mediaViewModel: mediaViewModel)
                }
            }
            .disabled(
                viewModel.isSaving || !viewModel.hasAnyDirtyBooks
                    || viewModel.hasAnyValidationErrors
            )
        }
    }

    private func iOSBottomBarButton(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void,
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(.system(size: 18))
                Text(title)
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var hardcoverDataDumpText: String {
        guard let bookId = viewModel.selectedBookId else { return "No book selected." }
        return viewModel.rawHardcoverDataDump(for: bookId)
    }

    private var hardcoverDataDumpPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Hardcover Imported Data")
                    .font(.headline)

                Spacer()

                #if os(macOS)
                Button("Copy All") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(hardcoverDataDumpText, forType: .string)
                }
                .controlSize(.small)
                #endif
            }

            TextEditor(text: .constant(hardcoverDataDumpText))
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .frame(width: 720, height: 520)
        }
        .padding()
    }

}

private struct MetadataEditorBookRailItem: View {
    let book: MetadataEditorViewModel.EditableBook
    let image: Image?
    let compact: Bool
    let isSelected: Bool
    let saveResult: Bool?
    let action: (() -> Void)?
    let removeAction: () -> Void
    var showsDisclosure = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        rowContent
            .contextMenu {
                Button("Remove from Editor") {
                    removeAction()
                }
            }
            .background {
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.accentColor.opacity(0.14) : Color.clear)
            }
            .overlay(alignment: .leading) {
                if isSelected {
                    Capsule()
                        .fill(Color.accentColor)
                        .frame(width: 4)
                        .padding(.vertical, 8)
                }
            }
    }

    @ViewBuilder
    private var rowContent: some View {
        if let action {
            content
                .contentShape(Rectangle())
                .onTapGesture(perform: action)
        } else {
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        if compact {
            cover
                .frame(width: 62, height: 88)
                .overlay(alignment: .bottomTrailing) {
                    statusGlyph
                        .padding(3)
                }
        } else {
            HStack(spacing: 8) {
                cover
                    .frame(width: 34, height: 48)
                VStack(alignment: .leading, spacing: 3) {
                    Text(book.displayTitle)
                        .lineLimit(2)
                        .font(.callout.weight(.regular))
                    if let author = book.authors.first, !author.isEmpty {
                        Text(author)
                            .lineLimit(1)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                statusGlyph
                if showsDisclosure {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(8)
        }
    }

    private var cover: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5)
                .fill(Color.secondary.opacity(0.10))
            if let image {
                image
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            } else {
                Image(systemName: "book.closed")
                    .foregroundStyle(.secondary)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 5)
                .stroke(Color.secondary.opacity(0.25), lineWidth: 0.75)
        }
    }

    @ViewBuilder
    private var statusGlyph: some View {
        if book.hasDirtyFields {
            Circle()
                .fill(metadataEditorChangeColor(for: colorScheme))
                .frame(width: 8, height: 8)
                .help("This book has unsaved changes")
        } else if saveResult == true {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        } else if saveResult == false {
            Image(systemName: "xmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.red)
        }
    }

}

#endif
