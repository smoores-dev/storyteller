#if os(macOS)
import AppKit
import SwiftUI
import UniformTypeIdentifiers

public struct MP3ToM4BConverterView: View {
    @State private var viewModel = MP3ToM4BConverterViewModel()
    @State private var fileColumnWidth: CGFloat = 200
    @State private var dragStartX: CGFloat?
    @State private var draggingFileID: UUID?
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerView
            Divider()
            HStack(spacing: 0) {
                leftColumn
                Divider()
                rightColumn
            }
            Divider()
            footerView
        }
        .frame(minWidth: 850, idealWidth: 950, minHeight: 500)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var headerView: some View {
        VStack(spacing: 4) {
            Text("MP3 to M4B Converter")
                .font(.headline)
            Text("Combine MP3 files into a single M4B audiobook")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var leftColumn: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                metadataSection
                encodingSection
                outputSection
            }
            .padding(20)
        }
        .frame(width: 300)
    }

    private var rightColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Input Files")
                    .font(.headline)
                Spacer()
                Button("Add...") {
                    selectMP3Files()
                }
                .disabled(viewModel.state == .processing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            HStack(spacing: 0) {
                Text("File")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: fileColumnWidth, alignment: .leading)
                columnResizer
                Text("Chapter Name")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("kbps")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 40, alignment: .trailing)
                Spacer().frame(width: 24)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            Divider()

            if viewModel.files.isEmpty {
                VStack {
                    Spacer()
                    Text("No MP3 files selected")
                        .foregroundStyle(.secondary)
                    Text("Click \"Add...\" to select files")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(viewModel.files.enumerated()), id: \.element.id) {
                            index,
                            file in
                            fileRow(file)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 4)
                                .opacity(draggingFileID == file.id ? 0.5 : 1.0)
                                .onDrag {
                                    draggingFileID = file.id
                                    return NSItemProvider(object: file.id.uuidString as NSString)
                                }
                                .onDrop(
                                    of: [.text],
                                    delegate: FileDropDelegate(
                                        fileID: file.id,
                                        viewModel: viewModel,
                                        draggingFileID: $draggingFileID,
                                    ),
                                )
                            if index < viewModel.files.count - 1 {
                                Divider()
                            }
                        }
                    }
                }
            }

            Divider()

            HStack {
                Text("\(viewModel.files.count) file(s)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Sort") {
                    viewModel.sortFiles()
                }
                .font(.caption)
                .disabled(viewModel.state == .processing || viewModel.files.isEmpty)
                Button("Clear") {
                    viewModel.clearFiles()
                }
                .font(.caption)
                .disabled(viewModel.state == .processing || viewModel.files.isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .frame(minWidth: 450)
    }

    private func fileRow(_ file: MP3FileInfo) -> some View {
        HStack(spacing: 0) {
            HStack {
                Image(systemName: "music.note")
                    .foregroundStyle(.secondary)
                    .frame(width: 16)
                Text(file.filename)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .frame(width: fileColumnWidth, alignment: .leading)

            Spacer().frame(width: 13)

            TextField("Chapter", text: chapterNameBinding(for: file.id))
                .textFieldStyle(.squareBorder)
                .frame(maxWidth: .infinity, alignment: .leading)
                .disabled(viewModel.state == .processing)

            if let kbps = file.bitrate {
                Text("\(kbps)k")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 40, alignment: .trailing)
            } else {
                ProgressView()
                    .scaleEffect(0.5)
                    .frame(width: 40, height: 16)
            }
            Button {
                viewModel.removeFile(id: file.id)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .disabled(viewModel.state == .processing)
        }
    }

    private func chapterNameBinding(for id: UUID) -> Binding<String> {
        Binding(
            get: { viewModel.files.first { $0.id == id }?.chapterName ?? "" },
            set: { newValue in
                if let idx = viewModel.files.firstIndex(where: { $0.id == id }) {
                    viewModel.files[idx].chapterName = newValue
                }
            },
        )
    }

    private var columnResizer: some View {
        Color(nsColor: .separatorColor)
            .frame(width: 1, height: 12)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .global)
                    .onChanged { value in
                        let currentX = value.location.x
                        if let startX = dragStartX {
                            let delta = currentX - startX
                            fileColumnWidth = max(100, min(1200, fileColumnWidth + delta))
                            dragStartX = currentX
                        } else {
                            dragStartX = currentX
                        }
                    }
                    .onEnded { _ in
                        dragStartX = nil
                    }
            )
            .onHover { hovering in
                if hovering {
                    NSCursor.resizeLeftRight.push()
                } else {
                    NSCursor.pop()
                }
            }
    }

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Metadata")
                .font(.headline)

            LabeledContent("Title:") {
                TextField("Audiobook title", text: $viewModel.bookTitle)
                    .textFieldStyle(.plain)
                    .disabled(viewModel.state == .processing)
            }

            LabeledContent("Author:") {
                TextField("Author name", text: $viewModel.bookAuthor)
                    .textFieldStyle(.plain)
                    .disabled(viewModel.state == .processing)
            }
        }
    }

    private var encodingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Encoding")
                .font(.headline)

            HStack {
                Text("Bitrate:")
                Spacer()
                if let detected = viewModel.detectedBitrate {
                    Text("(source: \(detected)k)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Picker(
                    "",
                    selection: Binding(
                        get: { viewModel.bitrate / 1000 },
                        set: { viewModel.bitrate = $0 * 1000 },
                    ),
                ) {
                    ForEach(MP3ToM4BConverterViewModel.bitrateOptions, id: \.self) { kbps in
                        Text("\(kbps) kbps").tag(kbps)
                    }
                }
                .labelsHidden()
                .frame(width: 100)
                .disabled(viewModel.state == .processing)
            }
        }
    }

    private var outputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Output")
                .font(.headline)

            HStack {
                Text("File:")
                Spacer()
                Text(viewModel.outputURL?.lastPathComponent ?? "Not selected")
                    .foregroundStyle(viewModel.outputURL == nil ? .secondary : .primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Button("Browse...") {
                    selectOutputLocation()
                }
                .disabled(viewModel.state == .processing)
            }
        }
    }

    private var footerView: some View {
        let isDisabled = !viewModel.canStart

        return HStack {
            Button("Cancel") {
                if case .processing = viewModel.state {
                    viewModel.cancel()
                } else {
                    dismiss()
                }
            }
            .keyboardShortcut(.cancelAction)

            statusContent
                .frame(maxWidth: .infinity, minHeight: 36)

            Button {
                viewModel.startConversion()
            } label: {
                Text("Convert")
                    .foregroundStyle(
                        isDisabled ? Color(nsColor: .disabledControlTextColor) : .white
                    )
            }
            .keyboardShortcut(.defaultAction)
            .disabled(isDisabled)
            .buttonStyle(.borderedProminent)
            .tint(isDisabled ? Color(nsColor: .disabledControlTextColor) : .accentColor)
        }
        .padding()
    }

    @ViewBuilder
    private var statusContent: some View {
        if case .processing = viewModel.state {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(viewModel.currentMessage)
                        .font(.caption)
                    Spacer()
                    Text("\(Int(viewModel.overallProgress * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: viewModel.overallProgress)
            }
        } else if case .error(let message) = viewModel.state {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
        } else if case .completed(let url) = viewModel.state {
            HStack {
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Complete!")
                    .font(.caption)
                Button("Show in Finder") {
                    NSWorkspace.shared.selectFile(
                        url.path,
                        inFileViewerRootedAtPath: url.deletingLastPathComponent().path,
                    )
                }
                .font(.caption)
            }
        } else if !viewModel.canStart {
            Text(disabledReason)
                .font(.caption)
                .foregroundStyle(.red)
        } else {
            Spacer()
        }
    }

    private var disabledReason: String {
        if viewModel.files.isEmpty {
            return "Add MP3 files"
        }
        if viewModel.outputURL == nil {
            return "Select output"
        }
        return ""
    }

    private func selectMP3Files() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType.mp3]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = "Select MP3 files to combine"

        if panel.runModal() == .OK {
            viewModel.addFiles(panel.urls)
        }
    }

    private func selectOutputLocation() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "m4b")!]
        panel.nameFieldStringValue = viewModel.suggestedFilename
        panel.message = "Save M4B audiobook"

        if panel.runModal() == .OK {
            viewModel.outputURL = panel.url
        }
    }
}

private struct FileDropDelegate: DropDelegate {
    let fileID: UUID
    let viewModel: MP3ToM4BConverterViewModel
    @Binding var draggingFileID: UUID?

    func performDrop(info: DropInfo) -> Bool {
        draggingFileID = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragging = draggingFileID,
            dragging != fileID,
            let fromIndex = viewModel.files.firstIndex(where: { $0.id == dragging }),
            let toIndex = viewModel.files.firstIndex(where: { $0.id == fileID })
        else {
            return
        }

        withAnimation(.easeInOut(duration: 0.2)) {
            viewModel.files.move(
                fromOffsets: IndexSet(integer: fromIndex),
                toOffset: toIndex > fromIndex ? toIndex + 1 : toIndex,
            )
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }
}

#endif
