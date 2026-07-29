#if os(iOS) || os(macOS)
import SwiftUI
import UniformTypeIdentifiers

#if canImport(AppKit)
import AppKit
#endif

#if canImport(UIKit)
import UIKit
#endif

public struct ReadaloudGeneratorView: View {
    @Environment(StorytellerEnvironment.self) private var appEnvironment
    private let initialData: ReadaloudGeneratorData?

    public init(initialData: ReadaloudGeneratorData? = nil) {
        self.initialData = initialData
    }

    public var body: some View {
        if let aligner = appEnvironment.readaloudAligner {
            ReadaloudGeneratorForm(viewModel: aligner, initialData: initialData)
        }
    }
}

private struct ReadaloudGeneratorForm: View {
    let viewModel: any ReadaloudAligning
    let initialData: ReadaloudGeneratorData?
    @State private var fileImporterRequest: FileImporterRequest?
    @State private var isFileImporterPresented = false
    @State private var isShowingDownloadRequiredAlert = false
    @State private var isFileMoverPresented = false
    @State private var movedDestinationURL: URL?
    @Environment(\.dismiss) private var dismiss
    @Environment(MediaViewModel.self) private var mediaViewModel

    private func bind<Value>(
        _ keyPath: ReferenceWritableKeyPath<any ReadaloudAligning, Value>
    ) -> Binding<Value> {
        Binding(
            get: { viewModel[keyPath: keyPath] },
            set: { viewModel[keyPath: keyPath] = $0 },
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            headerView
            Divider()
            ScrollView {
                formContent
            }
            .onChange(of: viewModel.epubURL) { _, _ in
                viewModel.loadChapters()
                ensureDefaultOutputURL()
            }
            .onChange(of: sourceMediaDownloadInProgress) { _, inProgress in
                guard !inProgress else { return }
                Task { await viewModel.refreshSourceInputs() }
            }
            if case .processing = viewModel.state {
                Divider()
                progressSection
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            if case .error(let message) = viewModel.state {
                Divider()
                errorSection(message: message)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            if case .completed(let completion) = viewModel.state {
                Divider()
                completedSection(completion: completion)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            Divider()
            footerView
            Link(
                "Powered by StoryAlign",
                destination: URL(string: "https://codeberg.org/richwaters/StoryAlign")!,
            )
            .font(.caption)
            .foregroundStyle(.blue)
            .padding(.bottom, 12)
        }
        .readaloudGeneratorSizing()
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: fileImporterRequest?.allowedContentTypes ?? [],
            allowsMultipleSelection: fileImporterRequest?.allowsMultipleSelection ?? false,
        ) { result in
            if case .success(let urls) = result, !urls.isEmpty {
                fileImporterRequest?.onSelect(urls)
            }
            fileImporterRequest = nil
        }
        .fileMover(isPresented: $isFileMoverPresented, file: completedFileURL) { result in
            if case .success(let destination) = result {
                movedDestinationURL = destination
            }
        }
        .alert(sourceMediaRequiredTitle, isPresented: $isShowingDownloadRequiredAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(sourceMediaRequiredMessage)
        }
        .task {
            await viewModel.loadUploadSources()
            await viewModel.configure(with: initialData?.generatorInput)
            await viewModel.refreshSourceInputs()
            ensureDefaultOutputURL()
        }
    }

    @ViewBuilder
    private var formContent: some View {
        #if os(iOS)
        VStack(alignment: .leading, spacing: 20) {
            leftColumn
            Divider()
            rightColumn
        }
        .padding(20)
        #else
        HStack(alignment: .top, spacing: 0) {
            leftColumn
                .frame(width: 360, alignment: .topLeading)

            Divider()
                .padding(.horizontal, 20)

            rightColumn
                .frame(width: 360, alignment: .topLeading)
        }
        .padding(20)
        #endif
    }

    private var leftColumn: some View {
        VStack(alignment: .leading, spacing: 20) {
            if isSourceWorkflow {
                sourceBookSection
                sourceInputMediaSection
            } else {
                inputFilesSection
            }
            modelSection
            #if os(macOS)
            outputSection
            #else
            if isSourceWorkflow {
                outputSection
            }
            #endif
        }
    }

    private var rightColumn: some View {
        VStack(alignment: .leading, spacing: 20) {
            optionsSection
            if !viewModel.availableChapters.isEmpty {
                chapterRangeSection
            }
        }
    }

    private func presentFileImporter(
        allowedContentTypes: [UTType],
        allowsMultipleSelection: Bool,
        onSelect: @escaping ([URL]) -> Void,
    ) {
        fileImporterRequest = FileImporterRequest(
            allowedContentTypes: allowedContentTypes,
            allowsMultipleSelection: allowsMultipleSelection,
            onSelect: onSelect,
        )
        isFileImporterPresented = true
    }

    private var headerView: some View {
        VStack(spacing: 4) {
            Text("Create Readaloud")
                .font(.headline)
            Text("Align an audiobook with an EPUB to create a synchronized readaloud")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var inputFilesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Input Files")
                .font(.headline)

            #if os(iOS)
            selectableFileCard(
                icon: "book.closed",
                title: "EPUB",
                valueText: viewModel.epubURL?.lastPathComponent,
                prompt: "Choose an EPUB file",
            ) {
                presentFileImporter(allowedContentTypes: [.epub], allowsMultipleSelection: false) {
                    urls in
                    viewModel.epubURL = urls.first
                }
            }

            selectableFileCard(
                icon: "headphones",
                title: "Audiobook",
                valueText: audioInputValueText,
                prompt: "Choose audiobook files",
            ) {
                presentFileImporter(
                    allowedContentTypes: audioFileTypes,
                    allowsMultipleSelection: true,
                ) { urls in
                    viewModel.audioURLs = urls
                }
            }
            #else
            filePickerRow(
                label: "EPUB:",
                url: viewModel.epubURL,
                placeholder: "Select EPUB file...",
                allowedTypes: [.epub],
            ) { url in
                viewModel.epubURL = url
            }

            filePickerRow(
                label: "Audiobook:",
                urls: viewModel.audioURLs,
                placeholder: "Select audiobook files...",
                allowedTypes: audioFileTypes,
            ) { urls in
                viewModel.audioURLs = urls
            }
            #endif
        }
    }

    #if os(iOS)
    private var audioInputValueText: String? {
        switch viewModel.audioURLs.count {
            case 0: return nil
            case 1: return viewModel.audioURLs[0].lastPathComponent
            default: return "\(viewModel.audioURLs.count) audiobook files selected"
        }
    }

    private func selectableFileCard(
        icon: String,
        title: String,
        valueText: String?,
        prompt: String,
        action: @escaping () -> Void,
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                    Text(valueText ?? prompt)
                        .font(.caption)
                        .foregroundStyle(valueText == nil ? .secondary : .primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 8)

                Text(valueText == nil ? "Choose" : "Change")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tint)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(controlBackgroundColor.opacity(0.55))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(separatorColor.opacity(0.55), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.state == .processing)
    }
    #endif

    private var sourceBookSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Book")
                .font(.headline)

            lockedSelectionRow(
                iconName: "book.closed",
                title: sourceWorkflowBookTitle,
                detail: "In \(selectedSourceDisplayName)",
            )
        }
    }

    private var sourceInputMediaSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Input Media")
                .font(.headline)

            VStack(spacing: 8) {
                sourceMediaStatusRow(category: .ebook, title: "EPUB", iconName: "book")
                sourceMediaStatusRow(category: .audio, title: "Audiobook", iconName: "headphones")
            }
        }
    }

    private var modelSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Transcription")
                .font(.headline)

            Picker("Engine:", selection: bind(\.selectedTranscriber)) {
                Text(ReadaloudTranscriber.whisper.displayName)
                    .tag(ReadaloudTranscriber.whisper)
                if speechAnalyzerAvailable {
                    Text(ReadaloudTranscriber.speechAnalyzer.displayName)
                        .tag(ReadaloudTranscriber.speechAnalyzer)
                }
            }

            if viewModel.selectedTranscriber == .whisper {
                HStack {
                    Picker("Model:", selection: bind(\.selectedModelSize)) {
                        ForEach(ReadaloudModelSize.allCases) { size in
                            Text(size.displayName).tag(size)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if viewModel.selectedModelSize == .custom {
                        Button("Browse...") {
                            #if os(macOS)
                            let panel = NSOpenPanel()
                            panel.allowedContentTypes = [UTType(filenameExtension: "bin")!]
                            panel.allowsMultipleSelection = false
                            panel.canChooseDirectories = false
                            if panel.runModal() == .OK {
                                viewModel.customModelPath = panel.url
                            }
                            #else
                            presentFileImporter(
                                allowedContentTypes: [UTType(filenameExtension: "bin")].compactMap {
                                    $0
                                },
                                allowsMultipleSelection: false,
                            ) { urls in
                                viewModel.customModelPath = urls.first
                            }
                            #endif
                        }
                    } else if viewModel.isModelDownloaded {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Downloaded")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    } else {
                        Button("Download") {
                            viewModel.downloadModel()
                        }
                        .disabled(viewModel.state == .processing)
                    }
                }

                if viewModel.selectedModelSize == .custom,
                    let customPath = viewModel.customModelPath
                {
                    Text(customPath.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                if case .downloading(let progress) = viewModel.state {
                    ProgressView(value: progress) {
                        Text("Downloading model...")
                            .font(.caption)
                    }
                }
            } else {
                Text(
                    "Uses Apple's on-device SpeechAnalyzer with its higher-quality standard mode. Language assets are managed by the system."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var speechAnalyzerAvailable: Bool {
        if #available(macOS 26.0, iOS 26.0, *) {
            return true
        }
        return false
    }

    private var granularityDescription: String {
        switch viewModel.selectedGranularity {
            case .word: return "Highlights one word at a time."
            case .group: return "Highlights small clusters of words based on natural speech timing."
            case .segment: return "Highlights groups based on whisper transcription segments."
            case .phrase: return "Highlights clauses split at punctuation boundaries."
            case .sentence: return "Highlights one full sentence at a time."
        }
    }

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Options")
                .font(.headline)

            HStack {
                Text("Granularity:")
                Picker("", selection: bind(\.selectedGranularity)) {
                    Text("Word").tag(ReadaloudGranularity.word)
                    Text("Group (recommended)").tag(ReadaloudGranularity.group)
                    Text("Phrase").tag(ReadaloudGranularity.phrase)
                    Text("Sentence").tag(ReadaloudGranularity.sentence)
                }
                .labelsHidden()
                .frame(maxWidth: .infinity)
            }

            Text(granularityDescription)
                .font(.caption)
                .foregroundStyle(.secondary)

            if viewModel.selectedGranularity != .sentence {
                Toggle("Expanding highlight", isOn: bind(\.expandingHighlight))

                Text("Accumulates highlights within a boundary instead of moving one at a time.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if viewModel.expandingHighlight {
                    HStack {
                        Text("Expansion limit:")
                        Picker("", selection: bind(\.expansionMode)) {
                            Text("Until boundary").tag(ReadaloudExpansionMode.scope)
                            Text("Fixed count").tag(ReadaloudExpansionMode.units)
                        }
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                    }

                    if viewModel.expansionMode == .scope {
                        HStack {
                            Text("Expand to:")
                            Picker("", selection: bind(\.expansionScope)) {
                                if viewModel.selectedGranularity == .word
                                    || viewModel.selectedGranularity == .group
                                {
                                    Text("Phrase").tag(ReadaloudGranularity.phrase)
                                }
                                Text("Sentence").tag(ReadaloudGranularity.sentence)
                            }
                            .labelsHidden()
                            .frame(maxWidth: .infinity)
                        }

                        Text(expansionScopeDescription)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        HStack {
                            Text("Max units:")
                            TextField("", value: bind(\.expansionUnitCount), format: .number)
                                .frame(width: 60)
                                .textFieldStyle(.roundedBorder)
                        }

                        Text(
                            "Keeps up to \(viewModel.expansionUnitCount) \(viewModel.selectedGranularity.rawValue)s highlighted at once."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var expansionScopeDescription: String {
        let unit = viewModel.selectedGranularity.rawValue
        let boundary = viewModel.expansionScope.rawValue
        return "Highlights accumulate by \(unit) until the end of the \(boundary), then reset."
    }

    private var chapterRangeSection: some View {
        let chapters = Array(viewModel.availableChapters.enumerated())
        return VStack(alignment: .leading, spacing: 12) {
            Text("Chapter Range")
                .font(.headline)

            VStack(spacing: 10) {
                HStack {
                    Text("Start:")
                        .frame(width: 44, alignment: .leading)
                    Picker("", selection: bind(\.startChapterIndex)) {
                        Text("Beginning").tag(nil as Int?)
                        ForEach(chapters, id: \.offset) { item in
                            Text(item.element.name).tag(item.offset as Int?)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }

                HStack {
                    Text("End:")
                        .frame(width: 44, alignment: .leading)
                    Picker("", selection: bind(\.endChapterIndex)) {
                        Text("End").tag(nil as Int?)
                        ForEach(chapters, id: \.offset) { item in
                            Text(item.element.name).tag(item.offset as Int?)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
            }

            Text("Leave as Beginning/End to include all chapters.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var outputSection: some View {
        let suggestedName: String? = viewModel.epubURL.map {
            $0.deletingPathExtension().lastPathComponent + "-readaloud.epub"
        }

        return VStack(alignment: .leading, spacing: 12) {
            if isSourceWorkflow {
                Text("Destination")
                    .font(.headline)

                lockedSelectionRow(
                    iconName: selectedSourceKind == .storyteller ? "server.rack" : "folder",
                    title: "Current book",
                    detail: "Add readaloud to \(selectedSourceDisplayName)",
                )
                .opacity(viewModel.uploadAllToServer ? 1 : 0.45)

                Toggle("Save to folder instead", isOn: customFolderOverrideBinding)
                    .disabled(viewModel.state == .processing)

                if !viewModel.uploadAllToServer {
                    folderPathRow(suggestedFilename: suggestedName)
                }
            } else {
                #if os(macOS)
                Text("Output")
                    .font(.headline)

                filePickerRow(
                    label: "Save to:",
                    url: viewModel.outputURL,
                    placeholder: "Select output location...",
                    allowedTypes: [.epub],
                    isSavePanel: true,
                    suggestedFilename: suggestedName,
                ) { url in
                    viewModel.outputURL = url
                }
                #endif
            }
        }
    }

    private var isSourceWorkflow: Bool {
        viewModel.sourceOutputBookID != nil
    }

    private var selectedSourceName: String {
        if let sourceWorkflowName = viewModel.sourceWorkflowName {
            return sourceWorkflowName
        }
        return viewModel.uploadSources.first { $0.id == viewModel.selectedUploadSourceID }?.name
            ?? "source"
    }

    private var sourceWorkflowBookTitle: String {
        viewModel.sourceWorkflowBookTitle ?? "Current book"
    }

    private var selectedSourceDisplayName: String {
        switch selectedSourceKind {
            case .localFolder:
                return "\(selectedSourceName) folder"
            case .storyteller:
                return "\(selectedSourceName) server"
            case nil:
                return selectedSourceName
        }
    }

    private var selectedSourceKind: BookSourceKind? {
        if let sourceWorkflowKind = viewModel.sourceWorkflowKind {
            return sourceWorkflowKind
        }
        return viewModel.uploadSources.first { $0.id == viewModel.selectedUploadSourceID }?.kind
    }

    private var sourceMediaRequiredTitle: String {
        selectedSourceKind == .localFolder ? "Media Files Not Found" : "Download Media First"
    }

    private var sourceMediaRequiredMessage: String {
        if selectedSourceKind == .localFolder {
            return
                "Local alignment needs both an EPUB and audiobook in the folder source. Check that the files are still present and grouped by one of the supported folder layouts."
        }
        return
            "Local alignment needs both the ebook and audiobook to be available locally. Use the download buttons in the Input Media section on the left, then try again."
    }

    private var customFolderOverrideBinding: Binding<Bool> {
        Binding(
            get: { !viewModel.uploadAllToServer },
            set: { useCustomFolder in
                viewModel.uploadAllToServer = !useCustomFolder
                if useCustomFolder {
                    viewModel.outputURL = nil
                }
            },
        )
    }

    private var sourceWorkflowBook: BookMetadata? {
        guard let bookID = initialData?.bookID,
            viewModel.sourceOutputBookID == bookID
        else { return nil }
        return mediaViewModel.library.bookMetaData.first { $0.id == bookID }
    }

    private var sourceMediaDownloadInProgress: Bool {
        guard let item = sourceWorkflowBook else { return false }
        return mediaViewModel.isCategoryDownloadInProgress(for: item, category: .ebook)
            || mediaViewModel.isCategoryDownloadInProgress(for: item, category: .audio)
    }

    private func lockedSelectionRow(
        iconName: String,
        title: String,
        detail: String,
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: iconName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 22, height: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Image(systemName: "lock.fill")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .help("Locked from the selected source")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(controlBackgroundColor.opacity(0.55))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(separatorColor.opacity(0.55), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func sourceMediaStatusRow(
        category: LocalMediaCategory,
        title: String,
        iconName: String,
    ) -> some View {
        let item = sourceWorkflowBook
        let resolvedURL = sourceMediaURL(for: category)
        let cachedDownloadAvailable =
            selectedSourceKind == .localFolder
            ? false
            : (item.map { mediaViewModel.isCategoryDownloaded(category, for: $0) } ?? false)
        let isDownloaded =
            resolvedURL != nil
            || cachedDownloadAvailable
        let isDownloading =
            item.map {
                mediaViewModel.isCategoryDownloadInProgress(for: $0, category: category)
            } ?? false
        let progress = item.flatMap {
            mediaViewModel.downloadProgressFraction(for: $0, category: category)
        }
        let missingDetail =
            selectedSourceKind == .localFolder
            ? "File not found in folder source"
            : "Download required before alignment"

        return HStack(spacing: 10) {
            Image(systemName: iconName)
                .foregroundStyle(.secondary)
                .frame(width: 22, height: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.medium))
                Text(
                    isDownloaded
                        ? "Downloaded"
                        : isDownloading
                            ? "Downloading..."
                            : missingDetail
                )
                .font(.caption)
                .foregroundStyle(
                    isDownloaded || isDownloading ? AnyShapeStyle(.secondary) : AnyShapeStyle(.red)
                )
            }

            Spacer(minLength: 8)

            if isDownloaded {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.title3)
                    .help("\(title) downloaded")
            } else if isDownloading {
                ZStack {
                    Circle()
                        .stroke(Color.accentColor.opacity(0.25), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: CGFloat(progress ?? 0))
                        .stroke(
                            Color.accentColor,
                            style: StrokeStyle(lineWidth: 2, lineCap: .round),
                        )
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 18, height: 18)
                .help("Downloading \(title)")
            } else if selectedSourceKind == .localFolder {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .font(.title3)
                    .help("Missing \(title)")
            } else {
                Button {
                    if let item {
                        mediaViewModel.startDownload(for: item, category: category)
                    }
                } label: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(.blue)
                        .font(.title3)
                }
                .buttonStyle(.borderless)
                .disabled(item == nil)
                .help("Download \(title)")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(controlBackgroundColor.opacity(0.35))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(separatorColor.opacity(0.45), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func sourceMediaURL(for category: LocalMediaCategory) -> URL? {
        switch category {
            case .ebook:
                return viewModel.epubURL
            case .audio:
                return viewModel.audioURLs.first
            case .synced:
                return nil
        }
    }

    private func folderPathRow(suggestedFilename: String?) -> some View {
        HStack {
            Text("Folder:")
            TextField(
                "Folder path",
                text: customOutputFolderBinding(suggestedFilename: suggestedFilename),
            )
            .textFieldStyle(.roundedBorder)

            Button("Browse...") {
                #if os(macOS)
                let panel = NSOpenPanel()
                panel.allowsMultipleSelection = false
                panel.canChooseDirectories = true
                panel.canChooseFiles = false
                if panel.runModal() == .OK, let url = panel.url {
                    setOutputFolder(url, suggestedFilename: suggestedFilename)
                }
                #else
                presentFileImporter(
                    allowedContentTypes: [.folder],
                    allowsMultipleSelection: false,
                ) { urls in
                    if let url = urls.first {
                        setOutputFolder(url, suggestedFilename: suggestedFilename)
                    }
                }
                #endif
            }
        }
    }

    private func customOutputFolderBinding(suggestedFilename: String?) -> Binding<String> {
        Binding(
            get: {
                viewModel.outputURL?.deletingLastPathComponent().path ?? ""
            },
            set: { path in
                let expandedPath = NSString(string: path).expandingTildeInPath
                guard !expandedPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                else {
                    viewModel.outputURL = nil
                    return
                }
                setOutputFolder(
                    URL(fileURLWithPath: expandedPath, isDirectory: true),
                    suggestedFilename: suggestedFilename,
                )
            },
        )
    }

    private func setOutputFolder(_ folderURL: URL, suggestedFilename: String?) {
        viewModel.outputURL = folderURL.appendingPathComponent(
            suggestedFilename ?? "readaloud.epub",
            isDirectory: false,
        )
    }

    private var sourceOutputToggleLabel: String {
        let sourceKind = viewModel.uploadSources.first {
            $0.id == viewModel.selectedUploadSourceID
        }?
        .kind
        let sourceName =
            switch sourceKind {
                case .storyteller:
                    "server"
                case .localFolder:
                    "folder source"
                case nil:
                    "source"
            }
        return viewModel.sourceOutputBookID == nil
            ? "Automatically add to \(sourceName) when done"
            : "Automatically update \(sourceName) when done"
    }

    private var uploadSourceBinding: Binding<BookSourceID> {
        Binding(
            get: {
                viewModel.selectedUploadSourceID ?? viewModel.uploadSources.first?.id ?? ""
            },
            set: { viewModel.selectedUploadSourceID = $0 },
        )
    }

    private var progressSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Progress")
                .font(.headline)

            ProgressView(value: viewModel.overallProgress) {
                HStack {
                    Text(viewModel.currentStage.displayName)
                        .font(.caption)
                    Spacer()
                    Text("\(Int(viewModel.overallProgress * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if !viewModel.currentMessage.isEmpty {
                Text(viewModel.currentMessage)
                    .font(.caption).monospaced()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private func errorSection(message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text("Error")
                    .font(.headline)
            }
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func completedSection(completion: ReadaloudGeneratorCompletion) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Completed")
                    .font(.headline)
            }
            Text(completionMessage(for: completion))
                .font(.caption)

            if case .saved(let url) = completion {
                savedActions(url: url)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var completedFileURL: URL? {
        if case .completed(.saved(let url)) = viewModel.state { return url }
        return nil
    }

    @ViewBuilder
    private func savedActions(url: URL) -> some View {
        #if os(macOS)
        HStack {
            Button("Show in Finder") {
                NSWorkspace.shared.selectFile(
                    url.path,
                    inFileViewerRootedAtPath: url.deletingLastPathComponent().path,
                )
            }
            Button("Open") { NSWorkspace.shared.open(url) }
            ShareLink(item: url)
        }
        #else
        if let movedDestinationURL {
            Label(
                "Saved to \(movedDestinationURL.lastPathComponent)",
                systemImage: "checkmark.circle",
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
            Button {
                isFileMoverPresented = true
            } label: {
                Label("Save to Files", systemImage: "folder")
            }
            .buttonStyle(.borderedProminent)
        }
        #endif
    }

    private func completionMessage(for completion: ReadaloudGeneratorCompletion) -> String {
        switch completion {
            case .saved:
                return "Readaloud created successfully!"
            case .uploaded:
                return "Readaloud created and added to the selected source."
            case .replaced:
                return "Readaloud created and replaced in the selected source."
        }
    }

    private var footerView: some View {
        let isDisabled = isCreateReadaloudDisabled

        return VStack(alignment: .trailing, spacing: 8) {
            if case .completed = viewModel.state {
                HStack {
                    Spacer()
                    Button("Close") {
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                }
            } else {
                if isDisabled {
                    HStack {
                        Spacer()
                        Text(disabledReason)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                HStack {
                    Button("Cancel") {
                        if case .processing = viewModel.state {
                            viewModel.cancel()
                        } else {
                            dismiss()
                        }
                    }
                    .keyboardShortcut(.cancelAction)

                    Spacer()

                    Button {
                        Task {
                            ensureDefaultOutputURL()
                            await viewModel.refreshSourceInputs()
                            if isSourceWorkflowMediaMissing
                                || viewModel.isMissingSourceWorkflowMedia
                            {
                                showDownloadRequiredAlert()
                            } else {
                                movedDestinationURL = nil
                                viewModel.startAlignment()
                            }
                        }
                    } label: {
                        Text("Create Readaloud")
                            .foregroundStyle(
                                isDisabled ? disabledTextColor : .white
                            )
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(isDisabled)
                    .buttonStyle(.borderedProminent)
                    .tint(isDisabled ? disabledTextColor : .accentColor)
                }
            }
        }
        .padding()
    }

    private var isCreateReadaloudDisabled: Bool {
        if case .processing = viewModel.state {
            return true
        }
        if viewModel.isLoadingSourceInputs {
            return true
        }
        if isSourceWorkflowMediaMissing {
            return true
        }
        if !isSourceWorkflow && (viewModel.epubURL == nil || viewModel.audioURLs.isEmpty) {
            return true
        }
        if viewModel.uploadAllToServer {
            return viewModel.selectedUploadSourceID == nil || !viewModel.isTranscriberReady
        }
        #if os(iOS)
        return !viewModel.isTranscriberReady
        #else
        return viewModel.outputURL == nil || !viewModel.isTranscriberReady
        #endif
    }

    private var isSourceWorkflowMediaMissing: Bool {
        guard isSourceWorkflow else { return false }
        return viewModel.isMissingSourceWorkflowMedia
    }

    private var disabledReason: String {
        if viewModel.isLoadingSourceInputs {
            return "Loading source media..."
        }
        if isSourceWorkflowMediaMissing {
            if selectedSourceKind == .localFolder {
                return "Missing EPUB or audiobook in folder source"
            }
            return "Download missing media from the Input Media section"
        }
        if viewModel.uploadAllToServer {
            if viewModel.selectedUploadSourceID == nil {
                return "Select an output source"
            }
        }
        #if os(macOS)
        if !viewModel.uploadAllToServer && viewModel.outputURL == nil {
            return isSourceWorkflow ? "Select output folder" : "Select output location"
        }
        #endif
        if !isSourceWorkflow {
            if viewModel.epubURL == nil {
                return "Select an EPUB file"
            }
            if viewModel.audioURLs.isEmpty {
                return "Select an audiobook file"
            }
        }
        if !viewModel.isTranscriberReady {
            if viewModel.selectedTranscriber == .speechAnalyzer {
                return "Apple Speech requires macOS 26 or iOS 26"
            }
            if viewModel.selectedModelSize == .custom {
                if viewModel.customModelPath == nil {
                    return "Select a custom model file"
                }
                return "Custom model file not found"
            }
            return "Download the Whisper model first"
        }
        return ""
    }

    private func showDownloadRequiredAlert() {
        isShowingDownloadRequiredAlert = true
    }

    private func filePickerRow(
        label: String,
        url: URL?,
        placeholder: String,
        allowedTypes: [UTType],
        isSavePanel: Bool = false,
        suggestedFilename: String? = nil,
        onSelect: @escaping (URL?) -> Void,
    ) -> some View {
        HStack {
            Text(label)

            Text(url?.lastPathComponent ?? placeholder)
                .frame(maxWidth: .infinity, alignment: .leading)
                .foregroundStyle(url == nil ? .secondary : .primary)
                .lineLimit(1)
                .truncationMode(.middle)

            Button("Browse...") {
                #if os(macOS)
                if isSavePanel {
                    let panel = NSSavePanel()
                    panel.allowedContentTypes = allowedTypes
                    panel.nameFieldStringValue =
                        suggestedFilename ?? url?.lastPathComponent ?? "output.epub"
                    if panel.runModal() == .OK {
                        onSelect(panel.url)
                    }
                } else {
                    let panel = NSOpenPanel()
                    panel.allowedContentTypes = allowedTypes
                    panel.allowsMultipleSelection = false
                    panel.canChooseDirectories = false
                    if panel.runModal() == .OK {
                        onSelect(panel.url)
                    }
                }
                #else
                presentFileImporter(
                    allowedContentTypes: allowedTypes,
                    allowsMultipleSelection: false,
                ) { urls in
                    onSelect(urls.first)
                }
                #endif
            }
        }
    }

    private func filePickerRow(
        label: String,
        urls: [URL],
        placeholder: String,
        allowedTypes: [UTType],
        onSelect: @escaping ([URL]) -> Void,
    ) -> some View {
        HStack {
            Text(label)

            Text(audioSelectionLabel(for: urls, placeholder: placeholder))
                .frame(maxWidth: .infinity, alignment: .leading)
                .foregroundStyle(urls.isEmpty ? .secondary : .primary)
                .lineLimit(1)
                .truncationMode(.middle)

            Button("Browse...") {
                #if os(macOS)
                let panel = NSOpenPanel()
                panel.allowedContentTypes = allowedTypes
                panel.allowsMultipleSelection = true
                panel.canChooseDirectories = false
                if panel.runModal() == .OK {
                    onSelect(panel.urls)
                }
                #else
                presentFileImporter(
                    allowedContentTypes: allowedTypes,
                    allowsMultipleSelection: true,
                ) { urls in
                    onSelect(urls)
                }
                #endif
            }
        }
    }

    private func audioSelectionLabel(for urls: [URL], placeholder: String) -> String {
        switch urls.count {
            case 0:
                return placeholder
            case 1:
                return urls[0].lastPathComponent
            default:
                return "\(urls.count) audiobook files selected"
        }
    }

    private func ensureDefaultOutputURL(suggestedFilename: String? = nil) {
        #if os(iOS)
        guard !viewModel.uploadAllToServer, viewModel.outputURL == nil else { return }
        let filename =
            suggestedFilename
            ?? viewModel.epubURL.map { defaultReadaloudFilename(for: $0) }
            ?? "readaloud.epub"
        viewModel.outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename, isDirectory: false)
        #endif
    }

    private func defaultReadaloudFilename(for epubURL: URL) -> String {
        "\(epubURL.deletingPathExtension().lastPathComponent)-readaloud.epub"
    }

    private var controlBackgroundColor: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemBackground)
        #endif
    }

    private var separatorColor: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor)
        #else
        Color(uiColor: .separator)
        #endif
    }

    private var disabledTextColor: Color {
        #if os(macOS)
        Color(nsColor: .disabledControlTextColor)
        #else
        Color(uiColor: .tertiaryLabel)
        #endif
    }

    private var audioFileTypes: [UTType] {
        [
            UTType(filenameExtension: "m4b"),
            UTType(filenameExtension: "m4a"),
            .mp3,
            UTType(filenameExtension: "flac"),
            UTType(filenameExtension: "aac"),
            UTType(filenameExtension: "ogg"),
            UTType(filenameExtension: "opus"),
            UTType(filenameExtension: "wav"),
            .audio,
        ].compactMap { $0 }
    }
}

private struct FileImporterRequest {
    let allowedContentTypes: [UTType]
    let allowsMultipleSelection: Bool
    let onSelect: ([URL]) -> Void
}

extension ReadaloudGeneratorData {
    fileprivate var generatorInput: ReadaloudGeneratorInput {
        ReadaloudGeneratorInput(
            bookID: bookID,
            bookTitle: bookTitle,
            sourceName: sourceName,
            sourceKind: sourceKind,
            destination: destination == .source ? .source : .file,
            ebookURL: ebookURL,
            audioURLs: audioURLs,
        )
    }
}

extension View {
    @ViewBuilder
    fileprivate func readaloudGeneratorSizing() -> some View {
        #if os(macOS)
        frame(width: 820, height: 820)
        #else
        frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
    }
}

#endif
