#if os(iOS) || os(macOS)
import SwiftUI

public struct CopyBookData: Codable, Hashable, Identifiable {
    public var bookID: BookID
    public var destinationSourceID: BookSourceID

    public var id: String { "\(bookID)->\(destinationSourceID)" }

    public init(bookID: BookID, destinationSourceID: BookSourceID) {
        self.bookID = bookID
        self.destinationSourceID = destinationSourceID
    }
}

public struct CopyBookView: View {
    private let bookID: BookID
    private let destinationSourceID: BookSourceID

    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var isCopying = false
    @State private var copyProgressFraction: Double?
    @State private var copyResult: CopyResult?
    @State private var didStartDownloads = false
    @State private var availableCategories: Set<LocalMediaCategory> = []

    private enum CopyResult {
        case success
        case failure(String)
    }

    public init(bookID: BookID, destinationSourceID: BookSourceID) {
        self.bookID = bookID
        self.destinationSourceID = destinationSourceID
    }

    public var body: some View {
        VStack(spacing: 0) {
            Form {
                if let book {
                    Section("Copy") {
                        LabeledContent("Book", value: book.title)
                        LabeledContent("To", value: destinationName)
                    }

                    Section {
                        ForEach(existingCategories, id: \.self) { category in
                            mediaRow(book: book, category: category)
                        }
                    } header: {
                        Text("Media")
                    } footer: {
                        Text(footerText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                } else {
                    Section {
                        Text("Book is no longer available.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .formStyle(.grouped)

            Divider()

            HStack {
                bottomStatus
                    .frame(maxWidth: .infinity, alignment: .leading)

                #if os(macOS)
                Button(copyResult == nil ? "Cancel" : "Close") {
                    dismiss()
                }
                .buttonStyle(.bordered)
                .keyboardShortcut(.cancelAction)
                #endif

                Button("Copy") {
                    Task { await performCopy() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canCopy)
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        #if os(macOS)
        .frame(width: 460, height: 380)
        #endif
        .task {
            await refreshAvailability()
            startMissingDownloads()
        }
        .onChange(of: downloadedToken) { _, _ in
            Task { await refreshAvailability() }
        }
    }

    private var book: BookMetadata? {
        mediaViewModel.library.bookMetaData.first { $0.id == bookID }
    }

    private var destinationName: String {
        mediaViewModel.bookSources.first { $0.id == destinationSourceID }?.name ?? "Unknown"
    }

    private var existingCategories: [LocalMediaCategory] {
        guard let book else { return [] }
        var categories: [LocalMediaCategory] = []
        if book.hasAvailableEbook { categories.append(.ebook) }
        if book.hasAvailableAudiobook { categories.append(.audio) }
        if book.hasAvailableReadaloud { categories.append(.synced) }
        return categories
    }

    private func isAvailableLocally(_ category: LocalMediaCategory) -> Bool {
        availableCategories.contains(category)
    }

    private var allMediaAvailable: Bool {
        guard book != nil, !existingCategories.isEmpty else { return false }
        return existingCategories.allSatisfy { isAvailableLocally($0) }
    }

    /// Changes whenever a category finishes downloading, used to re-query the source actor.
    private var downloadedToken: [Bool] {
        guard let book else { return [] }
        return existingCategories.map { mediaViewModel.isCategoryDownloaded($0, for: book) }
    }

    private func refreshAvailability() async {
        guard let book else { return }
        availableCategories = await BookServiceActor.shared.locallyAvailableMedia(
            for: book.id
        )
    }

    private var canCopy: Bool {
        !isCopying && copyResult == nil && allMediaAvailable
    }

    private var footerText: String {
        if allMediaAvailable {
            return "All media is available locally and ready to copy to \(destinationName)."
        }
        return
            "All media must be downloaded to this device before copying. Downloads start automatically."
    }

    @ViewBuilder
    private func mediaRow(book: BookMetadata, category: LocalMediaCategory) -> some View {
        HStack {
            Text(label(for: category))
            Spacer()
            if isAvailableLocally(category) {
                Label("Ready", systemImage: "checkmark.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(.green)
                    .font(.callout)
            } else if mediaViewModel.isCategoryDownloadInProgress(for: book, category: category) {
                let fraction = mediaViewModel.downloadProgressFraction(
                    for: book,
                    category: category,
                )
                progressCircle(progress: fraction ?? 0)
                Text(fraction != nil ? "\(Int((fraction ?? 0) * 100))%" : "Downloading...")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            } else {
                Button("Download") {
                    mediaViewModel.startDownload(for: book, category: category)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }

    @ViewBuilder
    private var bottomStatus: some View {
        if isCopying {
            HStack(spacing: 8) {
                progressCircle(progress: copyProgressFraction ?? 0)
                Text("Copying \(Int((copyProgressFraction ?? 0) * 100))%")
                    .foregroundStyle(.secondary)
            }
        } else if let result = copyResult {
            resultRow(result)
        }
    }

    @ViewBuilder
    private func resultRow(_ result: CopyResult) -> some View {
        switch result {
            case .success:
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Copied to \(destinationName)")
                }
            case .failure(let message):
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    Text(message)
                        .foregroundStyle(.secondary)
                }
        }
    }

    private func label(for category: LocalMediaCategory) -> String {
        switch category {
            case .ebook: return "Ebook"
            case .audio: return "Audiobook"
            case .synced: return "Readaloud"
        }
    }

    private func startMissingDownloads() {
        guard !didStartDownloads, let book else { return }
        didStartDownloads = true
        for category in existingCategories
        where !isAvailableLocally(category)
            && !mediaViewModel.isCategoryDownloadInProgress(for: book, category: category)
        {
            mediaViewModel.startDownload(for: book, category: category)
        }
    }

    private func performCopy() async {
        guard let book else { return }
        await MainActor.run {
            isCopying = true
            copyProgressFraction = 0
            copyResult = nil
        }

        let success = await BookServiceActor.shared.copyBook(
            book,
            to: destinationSourceID,
            onProgress: { fraction in
                Task { @MainActor in
                    guard isCopying else { return }
                    let clamped = min(max(fraction, 0), 1)
                    if clamped > (copyProgressFraction ?? 0) {
                        copyProgressFraction = clamped
                    }
                }
            },
        )

        await MainActor.run {
            isCopying = false
            copyProgressFraction = success ? 1 : nil
            copyResult =
                success
                ? .success
                : .failure("Failed to copy \(book.title) to \(destinationName).")
        }
    }

    private func progressCircle(progress: Double) -> some View {
        ZStack {
            Circle()
                .stroke(Color.accentColor.opacity(0.22), lineWidth: 3)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(progress, 0), 1)))
                .stroke(
                    Color.accentColor,
                    style: StrokeStyle(lineWidth: 3, lineCap: .round),
                )
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 16, height: 16)
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(progress * 100)) percent")
    }
}

#endif
