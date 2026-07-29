#if os(iOS) || os(macOS)
import SwiftUI

struct LocalFolderSourceHelpButton: View {
    let title: String
    @State private var showingHelp = false

    init(title: String = "How do I add files?") {
        self.title = title
    }

    var body: some View {
        Button {
            showingHelp = true
        } label: {
            Label(title, systemImage: "questionmark.circle")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.blue)
        .sheet(isPresented: $showingHelp) {
            LocalFolderSourceHelpView()
        }
    }
}

struct LocalFolderSourceHelpView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selection: LocalFolderLayoutHelp = .collectionFolders

    private let helpTitle = "How Storyteller Finds Your Books"

    var body: some View {
        #if os(macOS)
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            VStack(alignment: .leading, spacing: 18) {
                Picker("Layout", selection: $selection) {
                    ForEach(LocalFolderLayoutHelp.allCases) { layout in
                        Text(layout.title).tag(layout)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                .frame(maxWidth: .infinity, alignment: .center)

                layoutDetail(selection)
            }
            .padding(24)
        }
        .frame(width: 820)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
        #else
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    intro
                    ForEach(LocalFolderLayoutHelp.allCases) { layout in
                        layoutDetail(layout, showTitle: true)
                    }
                }
                .padding(20)
            }
            .navigationTitle(helpTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .textSelection(.enabled)
        #endif
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(
                "Simply copy files into this folder and they will appear. Storyteller groups files into books in one of two ways, depending on how the folder is organized. A book's title and cover come from the file's embedded details when available, otherwise from the filename."
            )
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Text("Two folder layouts are supported, described below.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text(helpTitle)
                    .font(.title2.bold())
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            intro
        }
        .padding(20)
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\u{2022}")
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 15))
    }

    private func layoutDetail(_ layout: LocalFolderLayoutHelp, showTitle: Bool = false) -> some View
    {
        let prose = VStack(alignment: .leading, spacing: 14) {
            if showTitle {
                Label(layout.title, systemImage: layout.systemImage)
                    .font(.title3.bold())
            }
            Text(layout.summary)
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(layout.rules, id: \.self) { rule in
                    bullet(rule)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)

        let example = VStack(alignment: .leading, spacing: 12) {
            Text("Example")
                .font(.headline)
            FileTreeView(nodes: layout.treeNodes)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)

        #if os(macOS)
        return AnyView(
            HStack(alignment: .top, spacing: 24) {
                prose
                example
            }
        )
        #else
        return AnyView(
            VStack(alignment: .leading, spacing: 16) {
                prose
                example
            }
        )
        #endif
    }
}

private struct FileTreeView: View {
    let nodes: [FileTreeNode]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(nodes) { node in
                FileTreeNodeView(node: node, depth: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.quaternary.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct FileTreeNodeView: View {
    let node: FileTreeNode
    let depth: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Image(systemName: node.systemImage)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(node.isFolder ? .blue : .secondary)
                    .frame(width: 18)
                Text(node.name)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
            }
            .font(.callout)
            .padding(.vertical, 4)
            .padding(.leading, CGFloat(depth) * 20)

            ForEach(node.children) { child in
                FileTreeNodeView(node: child, depth: depth + 1)
            }
        }
    }
}

private struct FileTreeNode: Identifiable {
    let id = UUID()
    let name: String
    let children: [FileTreeNode]

    init(_ name: String, children: [FileTreeNode] = []) {
        self.name = name
        self.children = children
    }

    var isFolder: Bool {
        !children.isEmpty || name.hasSuffix("/")
    }

    var systemImage: String {
        if isFolder {
            return "folder.fill"
        }
        if name.localizedCaseInsensitiveContains("readaloud") {
            return "waveform.and.book"
        }
        switch name.split(separator: ".").last?.lowercased() {
            case "epub":
                return "book.closed"
            case "cbz":
                return "photo.on.rectangle"
            case "mp3", "m4b", "m4a", "aac", "flac", "wav":
                return "headphones"
            default:
                return "doc"
        }
    }
}

private enum LocalFolderLayoutHelp: String, CaseIterable, Identifiable {
    case collectionFolders
    case mediaTypeSubfolders

    var id: String { rawValue }

    var title: String {
        switch self {
            case .collectionFolders: "Collection Folders"
            case .mediaTypeSubfolders: "Media Type Subfolders"
        }
    }

    var systemImage: String {
        switch self {
            case .collectionFolders: "folder"
            case .mediaTypeSubfolders: "square.grid.2x2"
        }
    }

    var summary: String {
        switch self {
            case .collectionFolders:
                "Books are grouped by filename, so organize the folder however you like: everything in one big folder, or sorted into nested folders for collections, series, authors, etc."
            case .mediaTypeSubfolders:
                "Give a book its own folder, then sort its files into named subfolders. The subfolders do the grouping, so the filenames don't need to match."
        }
    }

    var rules: [String] {
        switch self {
            case .collectionFolders:
                [
                    "Files combine only when one filename is the start of another, like \"Jade City.epub\" and \"Jade City - Fonda Lee.m4b\".",
                    "Names that share a leading prefix but then differ stay separate, like \"This Is How You Lose the Time War\" and \"This Woven Kingdom\".",
                    "Capitalization, punctuation, a trailing number, and format words like readaloud, unabridged, ebook, and audiobook are ignored when names are compared.",
                    "Files in different folders are never merged.",
                ]
            case .mediaTypeSubfolders:
                [
                    "Put the ebook epub in an ebook subfolder.",
                    "Put a readaloud epub in a synced subfolder.",
                    "Put the audio files in an audio subfolder.",
                    "Put a comic cbz in a comic subfolder.",
                    "These subfolder names only have this meaning directly inside a book's own folder.",
                ]
        }
    }

    var treeNodes: [FileTreeNode] {
        switch self {
            case .collectionFolders:
                [
                    FileTreeNode(
                        "My Library/",
                        children: [
                            FileTreeNode("Six of Crows - Leigh Bardugo.epub"),
                            FileTreeNode("Six of Crows.m4b"),
                            FileTreeNode("Spinning Silver.epub"),
                            FileTreeNode("Spinning Silver readaloud.epub"),
                            FileTreeNode("Spinning Silver.m4b"),
                            FileTreeNode(
                                "Jade City/",
                                children: [
                                    FileTreeNode("Jade City - Fonda Lee.epub"),
                                    FileTreeNode("Jade City 01.mp3"),
                                ],
                            ),
                            FileTreeNode(
                                "Favorites/",
                                children: [
                                    FileTreeNode("Piranesi.epub"),
                                    FileTreeNode("Piranesi.m4b"),
                                ],
                            ),
                        ],
                    )
                ]
            case .mediaTypeSubfolders:
                [
                    FileTreeNode(
                        "My Library/",
                        children: [
                            FileTreeNode(
                                "Jade City/",
                                children: [
                                    FileTreeNode(
                                        "ebook/",
                                        children: [FileTreeNode("book.epub")],
                                    ),
                                    FileTreeNode(
                                        "synced/",
                                        children: [FileTreeNode("readaloud.epub")],
                                    ),
                                    FileTreeNode(
                                        "audio/",
                                        children: [FileTreeNode("audiobook.m4b")],
                                    ),
                                ],
                            ),
                            FileTreeNode(
                                "Saga Vol 1/",
                                children: [
                                    FileTreeNode(
                                        "comic/",
                                        children: [FileTreeNode("issue.cbz")],
                                    )
                                ],
                            ),
                        ],
                    )
                ]
        }
    }
}

#endif
