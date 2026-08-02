#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchAllBooksView: View {
    @Environment(WatchViewModel.self) private var viewModel

    @State private var books: [BookMetadata] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var needsServerSetup = false
    @State private var showSettingsView = false
    @State private var downloadRecords: [BookID: DownloadRecord] = [:]
    @State private var showDownloads = false

    private func isBookDownloaded(_ bookID: BookID) -> Bool {
        viewModel.books.contains { $0.id == bookID }
    }

    var body: some View {
        Group {
            if isLoading {
                loadingView
            } else if needsServerSetup {
                serverSetupView
            } else if let error = errorMessage {
                errorView(error)
            } else if books.isEmpty {
                emptyView
            } else {
                bookList
            }
        }
        .navigationTitle("All Books")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadBooks()
            let _ = await DownloadManager.shared.addObserver { records in
                Task { @MainActor in
                    var map: [BookID: DownloadRecord] = [:]
                    for record in records where record.isIncomplete {
                        map[record.bookID] = record
                    }
                    downloadRecords = map
                }
            }
        }
        .sheet(isPresented: $showSettingsView) {
            WatchSettingsView()
        }
        .navigationDestination(isPresented: $showDownloads) {
            WatchIncompleteDownloadsView()
        }
        .onChange(of: showSettingsView) { _, isShowing in
            if !isShowing {
                Task {
                    await loadBooks()
                }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var serverSetupView: some View {
        VStack(spacing: 12) {
            Image(systemName: "server.rack")
                .font(.title)
                .foregroundStyle(.secondary)
            Text("Source Not Configured")
                .font(.caption)
            Text("Set up a book source to download books")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                showSettingsView = true
            } label: {
                Text("Server Settings")
                    .font(.caption2)
            }
            .controlSize(.small)
        }
        .padding()
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title)
                .foregroundStyle(.orange)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 8) {
                Button("Retry") {
                    Task {
                        await loadBooks()
                    }
                }
                .controlSize(.small)
                Button {
                    showSettingsView = true
                } label: {
                    Text("Settings")
                }
                .controlSize(.small)
                .tint(.secondary)
            }
        }
        .padding()
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "book.closed")
                .font(.title)
                .foregroundStyle(.secondary)
            Text("No books available")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var bookList: some View {
        List {
            ForEach(books) { book in
                Button {
                    if let record = downloadRecords[book.id], record.isIncomplete {
                        showDownloads = true
                    } else if !isBookDownloaded(book.id) {
                        let category: LocalMediaCategory =
                            book.hasAvailableReadaloud ? .synced : .ebook
                        Task {
                            await DownloadManager.shared.startDownload(
                                for: book,
                                category: category,
                            )
                        }
                        showDownloads = true
                    }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            MarqueeText(text: book.title, font: .caption)

                            if let author = book.authors?.first?.name {
                                Text(author)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        if isBookDownloaded(book.id) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else if let record = downloadRecords[book.id], record.isActive {
                            ZStack {
                                Circle()
                                    .stroke(Color.blue.opacity(0.3), lineWidth: 2.5)
                                Circle()
                                    .trim(from: 0, to: record.progressFraction)
                                    .stroke(Color.blue, lineWidth: 2.5)
                                    .rotationEffect(.degrees(-90))
                            }
                            .frame(width: 20, height: 20)
                        } else if let record = downloadRecords[book.id], record.isIncomplete {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        } else {
                            Image(systemName: "arrow.down.circle")
                                .foregroundStyle(.blue)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func loadBooks() async {
        isLoading = true
        errorMessage = nil
        needsServerSetup = false

        let isConfigured = await BookServiceActor.shared.isConfigured
        if !isConfigured {
            isLoading = false
            needsServerSetup = true
            return
        }

        guard let library = await BookServiceActor.shared.fetchLibraryInformation() else {
            isLoading = false
            errorMessage = "Cannot connect to book sources"
            return
        }

        let readalouds = library.filter { $0.hasAvailableReadaloud }

        let sorted = readalouds.sorted { a, b in
            a.title.articleStrippedCompare(b.title) == .orderedAscending
        }

        books = sorted
        isLoading = false
    }
}

#Preview {
    WatchAllBooksView()
}
#endif
