#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVHomeView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Binding var navigationPath: NavigationPath

    private var homeSections: [HomeSectionSnapshot] {
        let context = mediaViewModel.libraryRenderContext()
        return HomeSectionDeriver.sections(
            books: context.metadata,
            progress: context.progress,
            limit: .max,
        ).compactMap { section in
            let playableBooks = Array(section.books.lazy.filter(\.hasAvailableReadaloud).prefix(12))
            guard !playableBooks.isEmpty else { return nil }
            return HomeSectionSnapshot(kind: section.kind, books: playableBooks)
        }
    }

    var body: some View {
        let homeSections = homeSections
        NavigationStack(path: $navigationPath) {
            Group {
                if isDisconnected {
                    disconnectedView
                } else if !mediaViewModel.isReady {
                    loadingView
                } else if homeSections.isEmpty {
                    emptyStateView
                } else {
                    sectionsView(homeSections)
                }
            }
            .libraryRefreshDemand(model: mediaViewModel)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: BookMetadata.self) { book in
                TVBookDetailView(book: book)
            }
        }
        .task {
            await refreshLibrary()
        }
    }

    private var disconnectedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("Not Connected")
                .font(.title)
            Text("Configure book sources in Settings")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
            Text("Loading library...")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "books.vertical")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("No Books Available")
                .font(.title)
            Text("Add books to your library to see them here")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func sectionsView(_ sections: [HomeSectionSnapshot]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 50) {
                ForEach(sections, id: \.kind) { section in
                    TVHomeSectionView(
                        title: section.kind.title,
                        books: section.books,
                        viewModel: mediaViewModel,
                    )
                }
            }
            .padding(.top, 40)
            .padding(.bottom, 60)
        }
    }

    private var isDisconnected: Bool {
        switch mediaViewModel.connectionStatus {
            case .disconnected, .error:
                return true
            case .connecting, .connected:
                return false
        }
    }

    private func refreshLibrary() async {
        let status = await BookServiceActor.shared.connectionStatus
        if status == .connected {
            let _ = await BookServiceActor.shared.fetchLibraryInformation()
        }
        await mediaViewModel.refreshMetadata(source: "TVHomeView")
    }
}

private struct TVHomeSectionView: View {
    let title: String
    let books: [BookMetadata]
    let viewModel: MediaViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text(title)
                .font(.title3)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 60)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(books, id: \.id) { book in
                        NavigationLink(value: book) {
                            TVBookCardView(
                                book: book,
                                isDownloaded: isBookDownloaded(book),
                                downloadProgress: downloadProgress(for: book),
                            )
                        }
                        .buttonStyle(.card)
                    }
                }
                .padding(.horizontal, 60)
                .padding(.vertical, 35)
            }
        }
    }

    private func isBookDownloaded(_ book: BookMetadata) -> Bool {
        viewModel.isCategoryDownloaded(.synced, for: book)
            || viewModel.isCategoryDownloaded(.audio, for: book)
    }

    private func downloadProgress(for book: BookMetadata) -> Double? {
        if viewModel.isCategoryDownloadInProgress(for: book, category: .synced) {
            return viewModel.downloadProgressFraction(for: book, category: .synced)
        }
        if viewModel.isCategoryDownloadInProgress(for: book, category: .audio) {
            return viewModel.downloadProgressFraction(for: book, category: .audio)
        }
        return nil
    }
}
#endif
