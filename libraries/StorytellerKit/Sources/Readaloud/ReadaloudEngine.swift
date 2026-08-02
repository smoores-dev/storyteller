import Foundation
import StorytellerKit
import StoryAlignCore
import ZIPFoundation

private final class ModelDownloadDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable
{
    private let progressHandler: @Sendable (Double) -> Void
    private let completionHandler: @Sendable (URL?, Error?) -> Void
    var retainedSession: URLSession?

    init(
        progressHandler: @escaping @Sendable (Double) -> Void,
        completionHandler: @escaping @Sendable (URL?, Error?) -> Void,
    ) {
        self.progressHandler = progressHandler
        self.completionHandler = completionHandler
        super.init()
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64,
    ) {
        if totalBytesExpectedToWrite > 0 {
            let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
            let pct = Int(progress * 100)
            if pct % 5 == 0 {
                debugLog(
                    "[ReadaloudGenerator] Download progress: \(pct)% (\(totalBytesWritten / 1_000_000)MB / \(totalBytesExpectedToWrite / 1_000_000)MB)"
                )
            }
            progressHandler(progress)
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL,
    ) {
        let tempDir = FileManager.default.temporaryDirectory
        let tempFile = tempDir.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.copyItem(at: location, to: tempFile)
            completionHandler(tempFile, nil)
        } catch {
            completionHandler(nil, error)
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?,
    ) {
        if let error {
            completionHandler(nil, error)
        }
    }
}

extension ReadaloudModelSize {
    var binFileName: String { "ggml-\(rawValue).bin" }
    var mlmodelFileName: String { "ggml-\(rawValue)-encoder.mlmodelc" }

    var downloadURLs: [URL]? {
        switch self {
            case .custom: return nil
            default:
                return [
                    URL(
                        string:
                            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-\(rawValue).bin"
                    )!,
                    URL(
                        string:
                            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-\(rawValue)-encoder.mlmodelc.zip"
                    )!,
                ]
        }
    }
}

extension ReadaloudGranularity {
    var core: Granularity {
        switch self {
            case .word: return .word
            case .group: return .group
            case .segment: return .segment
            case .phrase: return .phrase
            case .sentence: return .sentence
        }
    }
}

extension ProgressStage {
    var facade: ReadaloudProgressStage {
        switch self {
            case .epub: return .epub
            case .audio: return .audio
            case .model: return .model
            case .transcribe: return .transcribe
            case .align: return .align
            case .alignWords: return .alignWords
            case .xml: return .xml
            case .export: return .export
            case .report: return .report
        }
    }
}

extension LogLevel {
    var facade: ReadaloudLogLevel {
        switch self {
            case .debug: return .debug
            case .info: return .info
            case .timestamp: return .timestamp
            case .warn: return .warn
            case .error: return .error
        }
    }
}

extension EpubChapterRole {
    var facade: ReadaloudChapterRole {
        switch self {
            case .frontmatter: return .frontmatter
            case .bodymatter: return .bodymatter
            case .backmatter: return .backmatter
            case .cover: return .cover
            case .titlepage: return .titlepage
            case .copyrightpage: return .copyrightpage
            case .toc: return .toc
            case .unlisted: return .unlisted
        }
    }
}

@Observable
@MainActor
public final class ReadaloudEngine: ReadaloudAligning {
    public var epubURL: URL?
    public var audioURLs: [URL] = []
    public var outputURL: URL?
    public var uploadAllToServer = false
    public var selectedUploadSourceID: BookSourceID?
    public private(set) var sourceWorkflowBookTitle: String?
    public private(set) var sourceWorkflowName: String?
    public private(set) var sourceWorkflowKind: BookSourceKind?
    public private(set) var uploadSources: [BookSourceRecord] = []
    public private(set) var sourceOutputBookID: BookID?
    public private(set) var isLoadingSourceInputs = false
    public var selectedTranscriber: ReadaloudTranscriber
    public var selectedModelSize: ReadaloudModelSize = .tiny
    public var customModelPath: URL?
    public var selectedGranularity: ReadaloudGranularity = .group
    public var expandingHighlight: Bool = true
    public var expansionMode: ReadaloudExpansionMode = .scope
    public var expansionScope: ReadaloudGranularity = .sentence
    public var expansionUnitCount: Int = 10

    public private(set) var state: ReadaloudGeneratorState = .idle
    public private(set) var currentStage: ReadaloudProgressStage = .epub
    public private(set) var currentMessage: String = ""
    public private(set) var overallProgress: Double = 0.0
    public private(set) var logMessages: [ReadaloudLogMessage] = []

    public private(set) var availableChapters: [ReadaloudChapter] = []
    public var startChapterIndex: Int? = nil
    public var endChapterIndex: Int? = nil

    private var alignmentTask: Task<Void, Never>?

    public init() {
        if #available(macOS 26.0, iOS 26.0, *) {
            selectedTranscriber = .speechAnalyzer
        } else {
            selectedTranscriber = .whisper
        }
    }

    public func loadUploadSources() async {
        let sources = await BookServiceActor.shared.bookSources.filter {
            $0.capabilities.canUploadBooks
        }
        uploadSources = sources
        if let sourceOutputBookID {
            selectedUploadSourceID = sourceOutputBookID.sourceID
        } else {
            selectedUploadSourceID = selectedUploadSourceID ?? sources.first?.id
        }
    }

    public func configure(with input: ReadaloudGeneratorInput?) async {
        alignmentTask?.cancel()
        alignmentTask = nil
        state = .idle
        currentStage = .epub
        currentMessage = ""
        overallProgress = 0
        logMessages = []

        sourceOutputBookID = nil
        sourceWorkflowBookTitle = nil
        sourceWorkflowName = nil
        sourceWorkflowKind = nil
        selectedUploadSourceID = nil
        uploadAllToServer = false
        epubURL = nil
        audioURLs = []
        outputURL = nil
        availableChapters = []
        startChapterIndex = nil
        endChapterIndex = nil

        guard let input else { return }
        sourceOutputBookID = input.bookID
        sourceWorkflowBookTitle = input.bookTitle
        selectedUploadSourceID = input.bookID.sourceID
        sourceWorkflowName = input.sourceName
        sourceWorkflowKind = input.sourceKind
        uploadAllToServer = input.destination == .source
        epubURL = input.ebookURL
        audioURLs = input.audioURLs
        outputURL =
            FileManager.default.temporaryDirectory
            .appendingPathComponent(
                readaloudFilename(for: input.ebookURL, fallbackTitle: input.bookTitle),
                isDirectory: false,
            )
        if epubURL != nil {
            loadChapters()
        }
    }

    public func refreshSourceInputs() async {
        guard let bookID = sourceOutputBookID else { return }
        isLoadingSourceInputs = true
        defer { isLoadingSourceInputs = false }

        async let ebookMedia = BookServiceActor.shared.resolveLocalMedia(
            for: bookID,
            category: .ebook,
        )
        async let audioMedia = BookServiceActor.shared.resolveLocalMedia(
            for: bookID,
            category: .audio,
        )

        let previousEpubURL = epubURL
        epubURL = await ebookMedia?.url
        if let audioURL = await audioMedia?.url {
            audioURLs = resolveAudioURLs(audioURL)
        } else {
            audioURLs = []
        }

        if epubURL != nil, epubURL != previousEpubURL {
            loadChapters()
        }
    }

    public var canStart: Bool {
        epubURL != nil && !audioURLs.isEmpty
            && (uploadAllToServer
                ? (sourceOutputBookID != nil || selectedUploadSourceID != nil)
                : outputURL != nil)
            && state != .processing
            && !isLoadingSourceInputs
    }

    public var isMissingSourceWorkflowMedia: Bool {
        sourceOutputBookID != nil && (epubURL == nil || audioURLs.isEmpty)
    }

    private func resolveAudioURLs(_ url: URL) -> [URL] {
        guard url.lastPathComponent == "manifest.json" else { return [url] }

        struct Manifest: Decodable {
            let readingOrder: [ReadingOrderItem]
        }

        struct ReadingOrderItem: Decodable {
            let href: String
        }

        do {
            let data = try Data(contentsOf: url)
            let manifest = try JSONDecoder().decode(Manifest.self, from: data)
            return manifest.readingOrder.compactMap { item in
                if let absoluteURL = URL(string: item.href), absoluteURL.isFileURL {
                    return FileManager.default.fileExists(atPath: absoluteURL.path)
                        ? absoluteURL : nil
                }
                let audioURL = url.deletingLastPathComponent().appendingPathComponent(item.href)
                return FileManager.default.fileExists(atPath: audioURL.path) ? audioURL : nil
            }
        } catch {
            debugLog("[ReadaloudGenerator] Failed to resolve audiobook manifest: \(error)")
            return []
        }
    }

    public var isModelDownloaded: Bool {
        if selectedModelSize == .custom {
            guard let customModelPath else { return false }
            return FileManager.default.fileExists(atPath: customModelPath.path)
        }
        return modelPath(for: selectedModelSize) != nil
    }

    public var isTranscriberReady: Bool {
        switch selectedTranscriber {
            case .whisper:
                return isModelDownloaded
            case .speechAnalyzer:
                if #available(macOS 26.0, iOS 26.0, *) {
                    return true
                }
                return false
        }
    }

    public func loadChapters() {
        guard let epubURL else {
            availableChapters = []
            startChapterIndex = nil
            endChapterIndex = nil
            return
        }

        Task.detached { [weak self] in
            guard let self else { return }
            await self.parseChapters(from: epubURL)
        }
    }

    private nonisolated func parseChapters(from epubURL: URL) async {
        let access = epubURL.startAccessingSecurityScopedResource()
        defer { if access { epubURL.stopAccessingSecurityScopedResource() } }

        do {
            let logger = ReadaloudLogger(minLevel: .error)
            let chapterEntries = try EpubParser.chapterEntries(from: epubURL, logger: logger)
                .filter { $0.role != .unlisted }
            let chapters = chapterEntries.map {
                ReadaloudChapter(name: $0.navLabel, id: $0.manifestId, role: $0.role?.facade)
            }

            await MainActor.run {
                self.availableChapters = chapters
                self.startChapterIndex = chapters.firstIndex(where: { $0.role == .bodymatter })
                self.endChapterIndex = chapters.firstIndex(where: { $0.role == .backmatter })
            }
        } catch {
            debugLog("[ReadaloudGenerator] Failed to parse chapters: \(error)")
            await MainActor.run {
                self.availableChapters = []
                self.startChapterIndex = nil
                self.endChapterIndex = nil
            }
        }
    }

    public func startAlignment() {
        guard canStart else { return }
        guard let epubURL, !audioURLs.isEmpty else { return }
        let audioURLs = self.audioURLs
        let outputURL = uploadAllToServer ? nil : self.outputURL
        guard uploadAllToServer || outputURL != nil else { return }

        state = .processing
        currentStage = .epub
        currentMessage = "Starting..."
        overallProgress = 0.0

        alignmentTask = Task.detached { [weak self] in
            guard let self else { return }
            await self.runAlignment(epubURL: epubURL, audioURLs: audioURLs, outputURL: outputURL)
        }
    }

    public func cancel() {
        alignmentTask?.cancel()
        alignmentTask = nil
        state = .idle
    }

    public func downloadModel() {
        guard state != .processing else { return }

        debugLog("[ReadaloudGenerator] Starting model download for \(selectedModelSize.rawValue)")
        state = .downloading(0)
        let modelSize = selectedModelSize

        alignmentTask = Task.detached { [weak self] in
            await self?.downloadModelFiles(for: modelSize)
        }
    }

    private nonisolated func runAlignment(epubURL: URL, audioURLs: [URL], outputURL: URL?) async {
        let customPath = await self.customModelPath
        let selectedTranscriber = await self.selectedTranscriber
        let selectedSize = await self.selectedModelSize
        let builtInModelPath = await self.modelPath(for: selectedSize)
        let uploadAllToServer = await self.uploadAllToServer
        let selectedUploadSourceID = await self.selectedUploadSourceID
        let sourceOutputBookID = await self.sourceOutputBookID
        let modelPath: String? = customPath?.path ?? builtInModelPath
        let granularity = await self.selectedGranularity
        let expanding = await self.expandingHighlight
        let expMode = await self.expansionMode
        let expScope = await self.expansionScope
        let expUnits = await self.expansionUnitCount
        let granularityExpansion: GranularityExpansion? =
            Self.granularityExpansion(
                enabled: expanding,
                mode: expMode,
                scope: expScope,
                units: expUnits,
                granularity: granularity,
            )
        let chapters = await self.availableChapters
        let startIdx = await self.startChapterIndex
        let endIdx = await self.endChapterIndex

        let startChapter = startIdx.flatMap {
            chapters.indices.contains($0) ? chapters[$0].id : nil
        }
        let endChapter = endIdx.flatMap { chapters.indices.contains($0) ? chapters[$0].id : nil }

        let transcriberFactory: any TranscriberFactory
        switch selectedTranscriber {
            case .whisper:
                guard let modelPath else {
                    await MainActor.run {
                        self.state = .error("Whisper model not found. Please download it first.")
                    }
                    return
                }
                let whisperConfig = WhisperConfig(
                    modelFile: modelPath,
                    beamSize: nil,
                    dtw: false,
                )
                transcriberFactory = WhisperTranscriberFactory(whisperConfig: whisperConfig)
            case .speechAnalyzer:
                guard #available(macOS 26.0, iOS 26.0, *) else {
                    await MainActor.run {
                        self.state = .error("Apple Speech requires macOS 26 or iOS 26.")
                    }
                    return
                }
                let speechConfig = SpeechAnalyzerConfig(bias: .standard, localeId: nil)
                transcriberFactory = SpeechAnalyzerTranscriberFactory(
                    speechAnalyzerConfig: speechConfig
                )
        }

        // Start accessing security-scoped resources for sandboxed app
        let epubAccess = epubURL.startAccessingSecurityScopedResource()
        let audioAccesses = audioURLs.map { ($0, $0.startAccessingSecurityScopedResource()) }
        let outputAccess = outputURL?.startAccessingSecurityScopedResource() ?? false
        defer {
            if epubAccess { epubURL.stopAccessingSecurityScopedResource() }
            for (url, accessed) in audioAccesses where accessed {
                url.stopAccessingSecurityScopedResource()
            }
            if outputAccess { outputURL?.stopAccessingSecurityScopedResource() }
        }

        let logger = ReadaloudLogger(minLevel: .info)
        let progressListener = ReadaloudProgressListener { [weak self] stage, message, progress in
            Task { @MainActor in
                self?.currentStage = stage.facade
                self?.currentMessage = message
                self?.overallProgress = progress
            }
        }

        do {
            let alignmentRequest = try AlignmentRequest(
                epubURL: epubURL,
                audioBookURLs: audioURLs,
            )
            let alignmentConfig = AlignmentConfig(
                audioLoaderType: .avfoundation,
                concurrency: 0,
                reportType: .none,
                startChapter: startChapter,
                endChapter: endChapter,
                granularity: granularity.core,
                granularityExpansion: granularityExpansion,
                extraContributors: ["StorytellerReader 1.0"],
            )
            let transcriptionStore = try ReadaloudTranscriptionStore()
            let session = AlignmentSession(
                request: alignmentRequest,
                config: alignmentConfig,
                logger: logger,
                transcriberFactory: transcriberFactory,
                transcriptionStore: transcriptionStore,
            )
            defer { session.cleanup() }
            _ = session.addProgressListener(progressListener)

            let result = try await StoryAligner().alignStory(session: session)
            let fileMgr = FileManager.default

            if uploadAllToServer {
                await MainActor.run {
                    self.currentStage = .export
                    self.currentMessage = "Uploading to source..."
                    self.overallProgress = 0.0
                }

                let onUploadProgress: @Sendable (Double) -> Void = { [weak self] fraction in
                    Task { @MainActor in
                        self?.overallProgress = min(max(fraction, 0), 1)
                    }
                }

                let success: Bool
                if let sourceOutputBookID {
                    success = try await replaceGeneratedReadaloud(
                        readaloudURL: result.alignedEpubURL,
                        bookID: sourceOutputBookID,
                        filename: readaloudFilename(for: epubURL),
                        onProgress: onUploadProgress,
                    )
                } else {
                    guard let selectedUploadSourceID else {
                        await MainActor.run {
                            self.state = .error("Select a destination source before uploading.")
                        }
                        return
                    }
                    success = try await uploadGeneratedBook(
                        epubURL: epubURL,
                        audioURLs: audioURLs,
                        readaloudURL: result.alignedEpubURL,
                        sourceID: selectedUploadSourceID,
                        onProgress: onUploadProgress,
                    )
                }
                guard success else {
                    await MainActor.run {
                        self.state = .error(
                            "Could not write the readaloud to the selected source."
                        )
                    }
                    return
                }

                let messages = logger.messages.map {
                    ReadaloudLogMessage(date: $0.0, level: $0.1.facade, message: $0.2)
                }
                await MainActor.run {
                    self.logMessages = messages
                    if let sourceOutputBookID {
                        self.state = .completed(.replaced(sourceOutputBookID.sourceID))
                    } else {
                        self.state = .completed(.uploaded)
                    }
                }
                _ = await BookServiceActor.shared.fetchLibraryInformation()
            } else if let outputURL {
                if fileMgr.fileExists(atPath: outputURL.path()) {
                    try fileMgr.removeItem(at: outputURL)
                }
                try fileMgr.moveItem(at: result.alignedEpubURL, to: outputURL)

                let messages = logger.messages.map {
                    ReadaloudLogMessage(date: $0.0, level: $0.1.facade, message: $0.2)
                }
                await MainActor.run {
                    self.logMessages = messages
                    self.state = .completed(.saved(outputURL))
                }
            }

        } catch is CancellationError {
            await MainActor.run { self.state = .idle }
            return
        } catch {
            let messages = logger.messages.map {
                ReadaloudLogMessage(date: $0.0, level: $0.1.facade, message: $0.2)
            }
            let errorMessage = String(describing: error)
            await MainActor.run {
                self.logMessages = messages
                self.state = .error(errorMessage)
            }
        }
    }

    private nonisolated func uploadGeneratedBook(
        epubURL: URL,
        audioURLs: [URL],
        readaloudURL: URL,
        sourceID: BookSourceID,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async throws -> Bool {
        let ebookData = try Data(contentsOf: epubURL)
        let readaloudData = try Data(contentsOf: readaloudURL)
        let audiobookAssets = try audioURLs.map { audioURL in
            StorytellerUploadAsset(
                format: .audiobook,
                filename: audioURL.lastPathComponent,
                data: try Data(contentsOf: audioURL),
                contentType: audioContentType(for: audioURL),
                relativePath: nil,
            )
        }

        return await BookServiceActor.shared.uploadBookAssets(
            bookID: BookID(sourceID: sourceID, uuid: UUID().uuidString),
            ebook: StorytellerUploadAsset(
                format: .ebook,
                filename: epubURL.lastPathComponent,
                data: ebookData,
                contentType: "application/epub+zip",
                relativePath: nil,
            ),
            audiobooks: audiobookAssets,
            readaloud: StorytellerUploadAsset(
                format: .readaloud,
                filename: readaloudFilename(for: epubURL),
                data: readaloudData,
                contentType: "application/epub+zip",
                relativePath: nil,
            ),
            onProgress: onProgress,
        )
    }

    private nonisolated func audioContentType(for url: URL) -> String {
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

    private nonisolated func replaceGeneratedReadaloud(
        readaloudURL: URL,
        bookID: BookID,
        filename: String,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async throws -> Bool {
        let status = await BookServiceActor.shared.connectionStatus(sourceID: bookID.sourceID)
        guard status == .connected else { return false }

        let result = await BookServiceActor.shared.replaceBookAsset(
            StorytellerUploadAsset(
                format: .readaloud,
                filename: filename,
                data: try Data(contentsOf: readaloudURL),
                contentType: "application/epub+zip",
                relativePath: nil,
            ),
            bookID: bookID,
            replaceMetadata: false,
            onProgress: onProgress,
        )
        if case .success = result {
            return true
        }
        return false
    }

    private nonisolated func readaloudFilename(for epubURL: URL) -> String {
        "\(epubURL.deletingPathExtension().lastPathComponent)-readaloud.epub"
    }

    private nonisolated static func granularityExpansion(
        enabled: Bool,
        mode: ReadaloudExpansionMode,
        scope: ReadaloudGranularity,
        units: Int,
        granularity: ReadaloudGranularity,
    ) -> GranularityExpansion? {
        guard enabled, granularity != .sentence else { return nil }
        switch mode {
            case .scope:
                return .scope(validExpansionScope(scope, for: granularity).core)
            case .units:
                return .units(units)
        }
    }

    private nonisolated static func validExpansionScope(
        _ scope: ReadaloudGranularity,
        for granularity: ReadaloudGranularity,
    ) -> ReadaloudGranularity {
        switch granularity {
            case .word, .group:
                return scope == .phrase ? .phrase : .sentence
            case .phrase, .segment:
                return .sentence
            case .sentence:
                return .sentence
        }
    }

    private nonisolated func readaloudFilename(for epubURL: URL?, fallbackTitle: String) -> String {
        if let epubURL {
            return readaloudFilename(for: epubURL)
        }
        return "\(fallbackTitle)-readaloud.epub"
    }

    private nonisolated func downloadModelFiles(for modelSize: ReadaloudModelSize) async {
        debugLog("[ReadaloudGenerator] downloadModelFiles started for \(modelSize.rawValue)")

        guard let urls = modelSize.downloadURLs else {
            debugLog("[ReadaloudGenerator] No download URLs for model size \(modelSize.rawValue)")
            await MainActor.run { self.state = .idle }
            return
        }

        let fm = FileManager.default
        let modelsDir = await modelsDirectory()
        debugLog("[ReadaloudGenerator] Models directory: \(modelsDir.path)")

        do {
            try fm.createDirectory(at: modelsDir, withIntermediateDirectories: true)
            debugLog("[ReadaloudGenerator] Created models directory")
        } catch {
            debugLog("[ReadaloudGenerator] Failed to create directory: \(error)")
            await MainActor.run {
                self.state = .error(
                    "Failed to create models directory: \(error.localizedDescription)"
                )
            }
            return
        }

        debugLog("[ReadaloudGenerator] Will download \(urls.count) files")

        for (index, url) in urls.enumerated() {
            debugLog(
                "[ReadaloudGenerator] Processing file \(index + 1)/\(urls.count): \(url.lastPathComponent)"
            )
            if Task.isCancelled {
                await MainActor.run { self.state = .idle }
                return
            }

            let targetURL = modelsDir.appendingPathComponent(url.lastPathComponent)

            if fm.fileExists(atPath: targetURL.path) {
                debugLog("[ReadaloudGenerator] File already exists, skipping")
                continue
            }

            let baseProgress = Double(index) / Double(urls.count)
            let fileWeight = 1.0 / Double(urls.count)

            do {
                debugLog("[ReadaloudGenerator] Starting download from \(url)")
                let localURL = try await downloadFile(
                    from: url,
                    baseProgress: baseProgress,
                    fileWeight: fileWeight,
                )
                debugLog("[ReadaloudGenerator] Download complete: \(url.lastPathComponent)")

                if url.pathExtension == "zip" {
                    try fm.unzipItem(at: localURL, to: modelsDir, overwrite: true)
                    try? fm.removeItem(at: localURL)
                } else {
                    if fm.fileExists(atPath: targetURL.path) {
                        try fm.removeItem(at: targetURL)
                    }
                    try fm.moveItem(at: localURL, to: targetURL)
                }

                let progress = Double(index + 1) / Double(urls.count)
                debugLog(
                    "[ReadaloudGenerator] File \(index + 1)/\(urls.count) done, progress: \(Int(progress * 100))%"
                )
                await MainActor.run { self.state = .downloading(progress) }

            } catch {
                let errorMessage = error.localizedDescription
                debugLog("[ReadaloudGenerator] Download failed: \(errorMessage)")
                await MainActor.run {
                    self.state = .error("Failed to download model: \(errorMessage)")
                }
                return
            }
        }

        debugLog("[ReadaloudGenerator] All downloads complete")
        await MainActor.run { self.state = .idle }
    }

    private nonisolated func downloadFile(from url: URL, baseProgress: Double, fileWeight: Double)
        async throws -> URL
    {
        try await withCheckedThrowingContinuation { continuation in
            let delegate = ModelDownloadDelegate(
                progressHandler: { [weak self] fileProgress in
                    let totalProgress = baseProgress + (fileProgress * fileWeight)
                    Task { @MainActor in
                        self?.state = .downloading(totalProgress)
                    }
                },
                completionHandler: { downloadedURL, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else if let downloadedURL {
                        continuation.resume(returning: downloadedURL)
                    } else {
                        continuation.resume(
                            throwing: NSError(
                                domain: "ReadaloudGenerator",
                                code: -1,
                                userInfo: [NSLocalizedDescriptionKey: "Download failed"],
                            )
                        )
                    }
                },
            )

            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 60
            config.timeoutIntervalForResource = 600
            let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
            delegate.retainedSession = session
            let task = session.downloadTask(with: url)
            task.resume()
        }
    }

    private func modelsDirectory() -> URL {
        FilesystemActor.shared.whisperModelsDirectory()
    }

    private func modelPath(for modelSize: ReadaloudModelSize) -> String? {
        let modelsDir = modelsDirectory()
        let binPath = modelsDir.appendingPathComponent(modelSize.binFileName)
        let mlmodelPath = modelsDir.appendingPathComponent(modelSize.mlmodelFileName)

        let fm = FileManager.default
        if fm.fileExists(atPath: binPath.path) && fm.fileExists(atPath: mlmodelPath.path) {
            return binPath.path
        }
        return nil
    }
}
