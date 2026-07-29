#if os(iOS) || os(macOS)
import SwiftUI

struct MetadataEditorBookForm: View {
    @Bindable var viewModel: MetadataEditorViewModel
    @Binding var selectedScope: MetadataEditorScope
    @Binding var selectedCoverScope: MetadataCoverScope
    let showsEditionScopes: Bool
    let openHardcoverImport: () -> Void
    let revertCurrentBook: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var bookId: BookID? { viewModel.selectedBookId }
    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        Group {
            if let bookId {
                VStack(spacing: 0) {
                    if isCompactIOS {
                        compactBookTitle
                    }
                    scopePicker
                    Divider()
                    scopeContent(bookId: bookId)
                }
            } else {
                ContentUnavailableView("No Book Selected", systemImage: "book.closed")
            }
        }
    }

    private var scopePicker: some View {
        Group {
            if isCompactIOS {
                VStack(spacing: 8) {
                    scopeTabs
                    revertRow
                }
            } else {
                ZStack {
                    scopeTabs

                    HStack {
                        revertButton
                        Spacer()
                    }
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var compactBookTitle: some View {
        if let book = viewModel.selectedBook {
            Text(book.displayTitle)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal)
                .padding(.top, 10)
        }
    }

    private var availableScopes: [MetadataEditorScope] {
        showsEditionScopes ? [.work, .audiobook, .ebook] : [.work, .covers]
    }

    private var scopeTabs: some View {
        Picker("", selection: $selectedScope) {
            ForEach(availableScopes) { scope in
                Label(scope.title, systemImage: scope.systemImage).tag(scope)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: isCompactIOS ? .infinity : 520)
    }

    @ViewBuilder
    private var revertButton: some View {
        if viewModel.selectedBook?.hasDirtyFields == true {
            Button(action: revertCurrentBook) {
                Label("Revert All", systemImage: "arrow.uturn.backward.circle.fill")
            }
            .buttonStyle(.plain)
            .foregroundStyle(metadataEditorChangeColor(for: colorScheme))
            .help("Revert all changes to this book")
        }
    }

    private var revertRow: some View {
        HStack {
            revertButton
            Spacer()
        }
    }

    @ViewBuilder
    private func scopeContent(bookId: BookID) -> some View {
        switch selectedScope {
            case .work:
                WorkMetadataLayout(
                    bookId: bookId,
                    viewModel: viewModel,
                    openHardcoverImport: openHardcoverImport,
                )
            case .covers:
                CoversMetadataLayout(
                    bookId: bookId,
                    viewModel: viewModel,
                )
            case .audiobook:
                EditionMetadataLayout(
                    bookId: bookId,
                    viewModel: viewModel,
                    scope: .audiobook,
                    selectedCoverScope: $selectedCoverScope,
                    openHardcoverImport: openHardcoverImport,
                )
            case .ebook:
                EditionMetadataLayout(
                    bookId: bookId,
                    viewModel: viewModel,
                    scope: .ebook,
                    selectedCoverScope: $selectedCoverScope,
                    openHardcoverImport: openHardcoverImport,
                )
        }
    }
}

#endif
