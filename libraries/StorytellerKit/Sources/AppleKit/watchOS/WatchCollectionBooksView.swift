#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchCollectionBooksView: View {
    let collection: BookCollectionSummary

    @Environment(WatchViewModel.self) private var viewModel

    @State private var books: [BookMetadata] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var downloadRecords: [BookID: DownloadRecord] = [:]
    @State private var showDownloads = false

    private func isBookDownloaded(_ bookID: BookID) -> Bool {
        viewModel.books.contains { $0.id == bookID }
    }

    var body: some View {
        Group {
            if isLoading {
                loadingView
            } else if let error = errorMessage {
                errorView(error)
            } else if books.isEmpty {
                emptyView
            } else {
                bookList
            }
        }
        .navigationTitle(collection.name)
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
        .navigationDestination(isPresented: $showDownloads) {
            WatchIncompleteDownloadsView()
        }
    }

    private var loadingView: some View {
        ScrollView {
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 40)
        }
    }

    private func errorView(_ message: String) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title)
                    .foregroundStyle(.orange)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task {
                        await loadBooks()
                    }
                }
                .controlSize(.small)
            }
            .frame(maxWidth: .infinity)
            .padding()
        }
    }

    private var emptyView: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "book.closed")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("No books in this collection")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding()
        }
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

        guard let library = await BookServiceActor.shared.fetchLibraryInformation() else {
            isLoading = false
            errorMessage = "Cannot connect to book sources"
            return
        }

        let collectionKey = collection.uuid ?? collection.name

        let filtered = library.filter { book in
            guard book.hasAvailableReadaloud else { return false }
            guard let bookCollections = book.collections else { return false }
            return bookCollections.contains { c in
                (c.uuid ?? c.name) == collectionKey
            }
        }

        let sorted = filtered.sorted { a, b in
            a.title.articleStrippedCompare(b.title) == .orderedAscending
        }

        books = sorted
        isLoading = false
    }
}

#endif
