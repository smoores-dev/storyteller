#if os(iOS) || os(macOS)
import SwiftUI
import UniformTypeIdentifiers

#if os(macOS)
import AppKit
#endif

public struct UploadNewBookData: Codable, Hashable {
    public var sourceID: BookSourceID?

    public init(sourceID: BookSourceID? = nil) {
        self.sourceID = sourceID
    }
}

public struct UploadNewBookView: View {
    private let initialSourceID: BookSourceID?
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var selectedEbookURL: URL?
    @State private var selectedAudiobookURLs: [URL] = []
    @State private var selectedReadaloudURL: URL?
    @State private var isUploading = false
    @State private var uploadProgress: String?
    @State private var uploadProgressFraction: Double?
    @State private var uploadResult: UploadResult?
    @State private var bookSources: [BookSourceRecord] = []
    @State private var selectedSourceID: BookSourceID?

    #if os(iOS)
    @State private var activeImporter: ImporterTarget?
    @State private var pendingImporterTarget: ImporterTarget?

    private enum ImporterTarget: Identifiable {
        case ebook
        case audiobook
        case readaloud

        var id: Self { self }
    }
    #endif

    private enum UploadResult {
        case success
        case failure(String)
    }

    public init(initialSourceID: BookSourceID? = nil) {
        self.initialSourceID = initialSourceID
    }

    public var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("Destination") {
                    Picker("Upload To", selection: selectedSourceBinding) {
                        ForEach(bookSources) { source in
                            Label(source.name, systemImage: iconName(for: source.kind))
                                .tag(source.id)
                        }
                    }
                    .disabled(isUploading || uploadResult != nil || bookSources.isEmpty)
                }

                Section {
                    fileRow(
                        label: "Ebook",
                        selectedURL: selectedEbookURL,
                        onClear: { selectedEbookURL = nil },
                        onSelect: selectEbook,
                    )

                    fileRow(
                        label: "Audiobook",
                        selectedURLs: selectedAudiobookURLs,
                        onClear: { selectedAudiobookURLs = [] },
                        onSelect: selectAudiobook,
                    )

                    fileRow(
                        label: "Readaloud",
                        selectedURL: selectedReadaloudURL,
                        onClear: { selectedReadaloudURL = nil },
                        onSelect: selectReadaloud,
                    )
                } header: {
                    Text("Select Files")
                } footer: {
                    Text(
                        "Selected formats are added together as one book in the destination source."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                if let result = uploadResult {
                    Section {
                        switch result {
                            case .success:
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                    Text("Book added")
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
                }

            }
            .formStyle(.grouped)

            Divider()

            HStack {
                if uploadResult != nil {
                    Button("Upload Another") {
                        resetForNewUpload()
                    }
                    .buttonStyle(.bordered)
                }

                Spacer()

                if isUploading {
                    progressCircle(progress: uploadProgressFraction ?? 0)
                    if let progress = uploadProgress {
                        Text(progress)
                            .foregroundStyle(.secondary)
                    }
                }

                #if os(macOS)
                Button("Close") {
                    dismiss()
                }
                .buttonStyle(.bordered)
                .keyboardShortcut(.cancelAction)
                #endif

                Button(primaryActionTitle) {
                    Task {
                        await uploadBook()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    isUploading || !hasAnyFileSelected || uploadResult != nil
                        || selectedSourceID == nil
                )
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        #if os(macOS)
        .frame(width: 500, height: 440)
        #endif
        .task {
            await loadSources()
        }
        #if os(iOS)
        .fileImporter(
            isPresented: importerPresentedBinding,
            allowedContentTypes: importerContentTypes,
            allowsMultipleSelection: activeImporter == .audiobook,
        ) { result in
            handleImporterResult(result)
        }
        #endif
    }

    private var selectedSourceBinding: Binding<BookSourceID> {
        Binding(
            get: {
                selectedSourceID ?? bookSources.first?.id ?? ""
            },
            set: { selectedSourceID = $0 },
        )
    }

    @ViewBuilder
    private func fileRow(
        label: String,
        selectedURL: URL?,
        onClear: @escaping () -> Void,
        onSelect: @escaping () -> Void,
    ) -> some View {
        HStack {
            Text(label)
                .fixedSize()
            Spacer()
            if let url = selectedURL {
                Text(url.lastPathComponent)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Button("Clear") {
                    onClear()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isUploading || uploadResult != nil)
            }
            Button("Select...") {
                onSelect()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isUploading || uploadResult != nil)
        }
    }

    @ViewBuilder
    private func fileRow(
        label: String,
        selectedURLs: [URL],
        onClear: @escaping () -> Void,
        onSelect: @escaping () -> Void,
    ) -> some View {
        HStack {
            Text(label)
                .fixedSize()
            Spacer()
            if !selectedURLs.isEmpty {
                Text(
                    selectedURLs.count == 1
                        ? selectedURLs[0].lastPathComponent : "\(selectedURLs.count) files"
                )
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                Button("Clear") {
                    onClear()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isUploading || uploadResult != nil)
            }
            Button("Select...") {
                onSelect()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isUploading || uploadResult != nil)
        }
    }

    private var hasAnyFileSelected: Bool {
        selectedEbookURL != nil || !selectedAudiobookURLs.isEmpty || selectedReadaloudURL != nil
    }

    private var selectedSource: BookSourceRecord? {
        bookSources.first { $0.id == selectedSourceID }
    }

    private var primaryActionTitle: String {
        selectedSource?.kind == .localFolder ? "Add" : "Upload"
    }

    private func resetForNewUpload() {
        selectedEbookURL = nil
        selectedAudiobookURLs = []
        selectedReadaloudURL = nil
        uploadResult = nil
        uploadProgress = nil
        uploadProgressFraction = nil
    }

    private func loadSources() async {
        let sources = await BookServiceActor.shared.bookSources
            .filter { $0.capabilities.canUploadBooks }
        await MainActor.run {
            bookSources = sources
            if let selectedSourceID,
                sources.contains(where: { $0.id == selectedSourceID })
            {
                self.selectedSourceID = selectedSourceID
            } else if let initialSourceID,
                sources.contains(where: { $0.id == initialSourceID })
            {
                selectedSourceID = initialSourceID
            } else {
                selectedSourceID = sources.first?.id
            }
        }
    }

    private func iconName(for kind: BookSourceKind) -> String {
        switch kind {
            case .storyteller:
                return "server.rack"
            case .localFolder:
                return "folder"
        }
    }

    #if os(macOS)
    private func selectEbook() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.epub]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Select an EPUB ebook file"

        if panel.runModal() == .OK {
            selectedEbookURL = panel.url
        }
    }

    private func selectAudiobook() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.mpeg4Audio, .mp3, .audio]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = "Select one or more audiobook files"

        if panel.runModal() == .OK {
            selectedAudiobookURLs = panel.urls
        }
    }

    private func selectReadaloud() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.epub]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Select a readaloud EPUB file (with media overlays)"

        if panel.runModal() == .OK {
            selectedReadaloudURL = panel.url
        }
    }
    #else
    private func selectEbook() {
        pendingImporterTarget = .ebook
        activeImporter = .ebook
    }

    private func selectAudiobook() {
        pendingImporterTarget = .audiobook
        activeImporter = .audiobook
    }

    private func selectReadaloud() {
        pendingImporterTarget = .readaloud
        activeImporter = .readaloud
    }

    private var importerPresentedBinding: Binding<Bool> {
        Binding(
            get: { activeImporter != nil },
            set: { if !$0 { activeImporter = nil } },
        )
    }

    private var importerContentTypes: [UTType] {
        switch activeImporter {
            case .audiobook:
                return [.mpeg4Audio, .mp3, .audio]
            case .ebook, .readaloud, nil:
                return [.epub]
        }
    }

    private func handleImporterResult(_ result: Result<[URL], Error>) {
        defer {
            activeImporter = nil
            pendingImporterTarget = nil
        }
        guard case .success(let urls) = result, !urls.isEmpty else { return }
        switch pendingImporterTarget {
            case .ebook:
                selectedEbookURL = urls.first
            case .audiobook:
                selectedAudiobookURLs = urls
            case .readaloud:
                selectedReadaloudURL = urls.first
            case nil:
                break
        }
    }
    #endif

    private func readFileData(from url: URL) throws -> Data {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        return try Data(contentsOf: url)
    }

    private func uploadBook() async {
        guard hasAnyFileSelected, let sourceID = selectedSourceID else { return }

        await MainActor.run {
            isUploading = true
            uploadProgress = "Preparing..."
            uploadProgressFraction = 0.0
        }

        var ebookAsset: StorytellerUploadAsset?
        var audiobookAssets: [StorytellerUploadAsset] = []
        var readaloudAsset: StorytellerUploadAsset?

        do {
            if let url = selectedEbookURL {
                await MainActor.run {
                    uploadProgress = "Reading ebook..."
                    uploadProgressFraction = 0.03
                }
                let data = try readFileData(from: url)
                ebookAsset = StorytellerUploadAsset(
                    format: .ebook,
                    filename: url.lastPathComponent,
                    data: data,
                    contentType: "application/epub+zip",
                    relativePath: nil,
                )
            }

            if !selectedAudiobookURLs.isEmpty {
                await MainActor.run {
                    uploadProgress = "Reading audiobook..."
                    uploadProgressFraction = 0.06
                }
                audiobookAssets = try selectedAudiobookURLs.map { url in
                    StorytellerUploadAsset(
                        format: .audiobook,
                        filename: url.lastPathComponent,
                        data: try readFileData(from: url),
                        contentType: audioContentType(for: url),
                        relativePath: nil,
                    )
                }
            }

            if let url = selectedReadaloudURL {
                await MainActor.run {
                    uploadProgress = "Reading readaloud..."
                    uploadProgressFraction = 0.09
                }
                let data = try readFileData(from: url)
                readaloudAsset = StorytellerUploadAsset(
                    format: .readaloud,
                    filename: url.lastPathComponent,
                    data: data,
                    contentType: "application/epub+zip",
                    relativePath: nil,
                )
            }

            await MainActor.run {
                uploadProgress = selectedSource?.kind == .localFolder ? "Adding..." : "Uploading..."
                uploadProgressFraction = 0.1
            }

            let uploadBookUUID = UUID().uuidString
            let success = await BookServiceActor.shared.uploadBookAssets(
                bookID: BookID(sourceID: sourceID, uuid: uploadBookUUID),
                ebook: ebookAsset,
                audiobooks: audiobookAssets,
                readaloud: readaloudAsset,
                onProgress: { fraction in
                    Task { @MainActor in
                        guard isUploading else { return }
                        let scaled = 0.1 + 0.9 * min(max(fraction, 0), 1)
                        if scaled > (uploadProgressFraction ?? 0) {
                            uploadProgressFraction = scaled
                        }
                    }
                },
            )

            await MainActor.run {
                isUploading = false
                uploadProgress = nil
                uploadProgressFraction = success ? 1.0 : nil
                uploadResult =
                    success
                    ? .success
                    : .failure(
                        "Failed to add files to the selected source."
                    )
            }
            await BookServiceActor.shared.fetchLibraryInformation()
        } catch {
            await MainActor.run {
                isUploading = false
                uploadProgress = nil
                uploadProgressFraction = nil
                uploadResult = .failure("Failed to read files: \(error.localizedDescription)")
            }
            await BookServiceActor.shared.fetchLibraryInformation()
        }
    }

    private func audioContentType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
            case "aac":
                return "audio/aac"
            case "flac":
                return "audio/flac"
            case "m4a", "m4b", "mp4":
                return "audio/mp4"
            case "ogg", "oga":
                return "audio/ogg"
            case "opus":
                return "audio/opus"
            case "wav":
                return "audio/wav"
            default:
                return "audio/mpeg"
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
        .frame(width: 18, height: 18)
        .accessibilityLabel("Upload progress")
        .accessibilityValue("\(Int(progress * 100)) percent")
    }
}

#endif
