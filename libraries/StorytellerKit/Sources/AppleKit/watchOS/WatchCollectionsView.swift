#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchCollectionsView: View {
    @State private var collections: [(collection: BookCollectionSummary, bookCount: Int)] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var needsServerSetup = false
    @State private var showSettingsView = false

    var body: some View {
        Group {
            if isLoading {
                loadingView
            } else if needsServerSetup {
                serverSetupView
            } else if let error = errorMessage {
                errorView(error)
            } else if collections.isEmpty {
                emptyView
            } else {
                collectionsList
            }
        }
        .libraryRefreshDemand()
        .navigationTitle("Collections")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadCollections()
        }
        .sheet(isPresented: $showSettingsView) {
            WatchSettingsView()
        }
        .onChange(of: showSettingsView) { _, isShowing in
            if !isShowing {
                Task {
                    await loadCollections()
                }
            }
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

    private var serverSetupView: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("Source Not Configured")
                    .font(.caption)
                Text("Set up a book source to browse collections")
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
            .frame(maxWidth: .infinity)
            .padding()
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
                HStack(spacing: 8) {
                    Button("Retry") {
                        Task {
                            await loadCollections()
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
            .frame(maxWidth: .infinity)
            .padding()
        }
    }

    private var emptyView: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "rectangle.stack")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("No collections found")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Create collections in a book source to organize your library")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding()
        }
    }

    private var collectionsList: some View {
        List {
            ForEach(collections, id: \.collection.name) { item in
                NavigationLink {
                    WatchCollectionBooksView(collection: item.collection)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.collection.name)
                            .font(.caption)
                            .lineLimit(2)
                        Text("\(item.bookCount) book\(item.bookCount == 1 ? "" : "s")")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func loadCollections() async {
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

        var collectionMap: [String: (collection: BookCollectionSummary, bookCount: Int)] = [:]

        for book in readalouds {
            if let bookCollections = book.collections {
                for collection in bookCollections {
                    let key = collection.uuid ?? collection.name
                    if var existing = collectionMap[key] {
                        existing.bookCount += 1
                        collectionMap[key] = existing
                    } else {
                        collectionMap[key] = (collection: collection, bookCount: 1)
                    }
                }
            }
        }

        var result = Array(collectionMap.values)
        result.sort { a, b in
            a.collection.name.articleStrippedCompare(b.collection.name) == .orderedAscending
        }

        collections = result
        isLoading = false
    }
}

#Preview {
    WatchCollectionsView()
}
#endif
