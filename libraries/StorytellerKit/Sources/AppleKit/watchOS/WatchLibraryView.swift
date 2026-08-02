#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchLibraryView: View {
    @Environment(WatchViewModel.self) private var viewModel
    @State private var isSyncing = false
    @State private var syncResult: SyncResult?

    enum SyncResult {
        case success(synced: Int)
        case failure(failed: Int)

        var message: String {
            switch self {
                case .success(let count):
                    return count > 0
                        ? "Progress synced for \(count) book\(count == 1 ? "" : "s")"
                        : "Reading progress up to date"
                case .failure(let count):
                    return "Failed to sync \(count) book\(count == 1 ? "" : "s")"
            }
        }

        var isSuccess: Bool {
            if case .success = self { return true }
            return false
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                if viewModel.books.isEmpty && viewModel.savingBook == nil {
                    emptyState
                } else {
                    bookList
                }
            }

            if let result = syncResult {
                syncBanner(result)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle("Read Books")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await performSync() }
                } label: {
                    if isSyncing {
                        ProgressView()
                            .progressViewStyle(.circular)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(isSyncing)
            }
        }
    }

    private func syncBanner(_ result: SyncResult) -> some View {
        HStack(spacing: 6) {
            Image(
                systemName: result.isSuccess
                    ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
            )
            .font(.caption2)
            Text(result.message)
                .font(.caption2)
        }
        .foregroundStyle(result.isSuccess ? .green : .orange)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(.ultraThinMaterial)
        )
        .padding(.top, 4)
    }

    private func performSync() async {
        isSyncing = true
        syncResult = nil

        let result = await ProgressSyncActor.shared.syncPendingQueue()

        var gotSourceMetadata = false
        if await BookServiceActor.shared.fetchLibraryInformation() != nil {
            gotSourceMetadata = true
        }

        if !gotSourceMetadata {
            let _ = await WatchSessionManager.shared.requestLibraryMetadataFromPhone()
        }

        viewModel.loadBooks()

        withAnimation {
            if result.failed > 0 {
                syncResult = .failure(failed: result.failed)
            } else {
                syncResult = .success(synced: result.synced)
            }
        }
        isSyncing = false

        try? await Task.sleep(for: .seconds(3))
        withAnimation {
            syncResult = nil
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "books.vertical")
                .font(.system(size: 28))
                .foregroundStyle(.secondary)

            Text("No Books")
                .font(.caption)

            Text("Download from sources\nor transfer from iPhone")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal)
    }

    private var bookList: some View {
        List {
            if let saving = viewModel.savingBook {
                SavingBookRow(title: saving.title)
            }
            ForEach(viewModel.books) { book in
                NavigationLink {
                    WatchPlayerView(book: book)
                } label: {
                    LibraryBookRow(book: book)
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    let book = viewModel.books[index]
                    viewModel.deleteBook(book, category: .synced)
                }
            }
        }
    }
}

private struct LibraryBookRow: View {
    let book: BookMetadata

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 4) {
                Image("readalong")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 12, height: 12)
                    .foregroundStyle(.secondary)
                    .padding(.top, 3)
                MarqueeText(text: book.title, font: .headline)
            }

            if let author = book.authors?.first?.name {
                Text(author)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct SavingBookRow: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.5)
                    .frame(width: 12, height: 12)
                Text("Saving...")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(2)
        }
        .padding(.vertical, 2)
    }
}
#endif
