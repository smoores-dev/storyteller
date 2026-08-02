#if os(iOS) || os(macOS)
import SwiftUI

#if canImport(AppKit)
import AppKit
#endif

extension CoverProvider {
    var title: String {
        switch self {
            case .hardcover: return "Hardcover"
            case .apple: return "iTunes"
        }
    }
}

extension CoverCandidate {
    var scope: MetadataCoverScope { mediaKind == .audiobook ? .audiobook : .ebook }
}

private enum MetadataCoverSort: String, CaseIterable, Identifiable {
    case relevance = "Relevance"
    case resolution = "Resolution"

    var id: String { rawValue }
}

struct MetadataCoverImportView: View {
    let bookId: BookID
    @Bindable var viewModel: MetadataEditorViewModel
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var hardcoverVM = HardcoverImportViewModel()
    @State private var tokenHelpPresented = false
    @State private var isSearchingItunes = false
    @State private var isSearchingHardcover = false
    @State private var applyingCandidateId: String?
    @State private var selectedCandidateIds: [MetadataCoverScope: String] = [:]
    @State private var itunesCandidates: [MetadataCoverScope: [CoverCandidate]] = [:]
    @State private var hardcoverCandidates: [MetadataCoverScope: [CoverCandidate]] = [:]
    @State private var errorMessage: String?
    @State private var previewingCover: PreviewCover?
    @AppStorage("hardcoverImport.filterLanguage.audiobook") private
        var audiobookHardcoverFilterLanguage: String?
    @AppStorage("hardcoverImport.filterFormat.audiobook") private
        var audiobookHardcoverFilterFormat: String?
    @AppStorage("hardcoverImport.filterLanguage.ebook") private var ebookHardcoverFilterLanguage:
        String?
    @AppStorage("hardcoverImport.filterFormat.ebook") private var ebookHardcoverFilterFormat:
        String?
    @State private var hardcoverMinResolutions: [MetadataCoverScope: Int] = [:]
    @State private var hardcoverSort: MetadataCoverSort = .relevance
    @State private var itunesSort: MetadataCoverSort = .relevance
    @State private var filterPopoverScope: MetadataCoverScope?
    @State private var compactSelectedScope: MetadataCoverScope = .audiobook
    @State private var compactSelectedSource: CoverProvider = .hardcover
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    private var isIOS: Bool {
        #if os(iOS)
        true
        #else
        false
        #endif
    }

    private var book: MetadataEditorViewModel.EditableBook? {
        viewModel.books.first { $0.id == bookId }
    }

    private var sheetWidth: CGFloat? {
        if isCompactIOS { return nil }
        if isIOS { return 920 }
        return 1120
    }

    private var sheetHeight: CGFloat? {
        if isCompactIOS { return nil }
        if isIOS { return 760 }
        return 720
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            tokenSection
            Divider()
            if isCompactIOS {
                compactCoverBrowser
            } else if isIOS {
                iPadCoverBrowser
            } else {
                HStack(alignment: .top, spacing: 14) {
                    editionColumn(scope: .audiobook)
                    Divider()
                    editionColumn(scope: .ebook)
                }
                .padding(14)
            }
            Divider()
            bottomBar
        }
        .frame(width: sheetWidth, height: sheetHeight)
        .frame(maxWidth: isCompactIOS ? .infinity : nil, maxHeight: isCompactIOS ? .infinity : nil)
        .task {
            await loadInitialCandidates()
        }
        .sheet(item: $previewingCover) { cover in
            coverPreviewSheet(cover)
        }
    }

    private var iPadCoverBrowser: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Picker("Edition", selection: $compactSelectedScope) {
                    ForEach(MetadataCoverScope.allCases) { scope in
                        Text(scopeTitle(scope)).tag(scope)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 420)

                selectedCoverSummary(scope: compactSelectedScope)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                currentCoverPanel(scope: compactSelectedScope)

                HStack(alignment: .top, spacing: 12) {
                    sourceColumn(source: .hardcover, scope: compactSelectedScope)
                    sourceColumn(source: .apple, scope: compactSelectedScope)
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }
            .padding(12)
        }
    }

    private var compactCoverBrowser: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Picker("Edition", selection: $compactSelectedScope) {
                    ForEach(MetadataCoverScope.allCases) { scope in
                        Text(scopeTitle(scope)).tag(scope)
                    }
                }
                .pickerStyle(.segmented)

                selectedCoverSummary(scope: compactSelectedScope)
            }
            .padding(12)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    currentCoverPanel(scope: compactSelectedScope)

                    Picker("Source", selection: $compactSelectedSource) {
                        ForEach(CoverProvider.allCases) { source in
                            Text(source.title).tag(source)
                        }
                    }
                    .pickerStyle(.segmented)

                    sourceColumn(source: compactSelectedSource, scope: compactSelectedScope)
                        .frame(minHeight: 360)
                }
                .padding(12)
            }
        }
    }

    @ViewBuilder
    private func selectedCoverSummary(scope: MetadataCoverScope) -> some View {
        if selectedCandidateIds[scope] != nil {
            HStack(spacing: 6) {
                Text("1 selected for \(scopeTitle(scope))")
                    .font(.caption.weight(.semibold))
                Button {
                    selectedCandidateIds[scope] = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Clear \(scopeTitle(scope).lowercased()) selection")
            }
            .foregroundStyle(Color.accentColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.accentColor.opacity(0.12), in: Capsule())
        }
    }

    private enum PreviewCover: Identifiable {
        case image(Image, String)
        case data(Data, String)
        case url(URL, String)

        var id: String {
            switch self {
                case .image(_, let label): return "image-\(label)"
                case .data(_, let label): return "data-\(label)"
                case .url(let url, _): return url.absoluteString
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Import Covers")
                    .font(.title3.weight(.semibold))
                Text(
                    "Choose a candidate cover for each edition. Imported covers are staged locally until you save to Storyteller."
                )
                .font(.callout)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Refresh") {
                Task { await loadInitialCandidates(force: true) }
            }
            .disabled(isSearchingItunes || isSearchingHardcover)
        }
        .padding(12)
    }

    @ViewBuilder
    private var tokenSection: some View {
        Group {
            if isCompactIOS {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "key.fill")
                            .foregroundStyle(hardcoverVM.hasToken ? .green : .secondary)
                        Text("Hardcover API")
                            .font(.callout.weight(.semibold))
                        Spacer()
                        if !hardcoverVM.hasToken || hardcoverVM.isEditingToken {
                            tokenHelpButton
                        }
                    }

                    if hardcoverVM.hasToken && !hardcoverVM.isEditingToken {
                        HStack {
                            Text("Token saved")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Change") {
                                hardcoverVM.isEditingToken = true
                            }
                            .font(.callout)
                            Button("Clear") {
                                Task { await hardcoverVM.clearToken() }
                            }
                            .font(.callout)
                            .foregroundStyle(.red)
                        }
                    } else {
                        SecureField("Hardcover API Token", text: $hardcoverVM.tokenInput)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit {
                                Task {
                                    await hardcoverVM.saveToken()
                                    await searchHardcoverCovers()
                                }
                            }
                        HStack {
                            Button("Save") {
                                Task {
                                    await hardcoverVM.saveToken()
                                    await searchHardcoverCovers()
                                }
                            }
                            .disabled(
                                hardcoverVM.tokenInput.trimmingCharacters(
                                    in: .whitespacesAndNewlines
                                )
                                .isEmpty
                            )
                            if hardcoverVM.hasToken {
                                Button("Cancel") {
                                    hardcoverVM.isEditingToken = false
                                    hardcoverVM.tokenInput = ""
                                }
                            } else {
                                Text("Hardcover covers require an API key.")
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "key.fill")
                        .foregroundStyle(hardcoverVM.hasToken ? .green : .secondary)
                    Text("Hardcover API")
                        .font(.callout.weight(.semibold))

                    if hardcoverVM.hasToken && !hardcoverVM.isEditingToken {
                        Text("Token saved")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Change") {
                            hardcoverVM.isEditingToken = true
                        }
                        .font(.callout)
                        Button("Clear") {
                            Task { await hardcoverVM.clearToken() }
                        }
                        .font(.callout)
                        .foregroundStyle(.red)
                    } else {
                        SecureField("Hardcover API Token", text: $hardcoverVM.tokenInput)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit {
                                Task {
                                    await hardcoverVM.saveToken()
                                    await searchHardcoverCovers()
                                }
                            }
                        Button("Save") {
                            Task {
                                await hardcoverVM.saveToken()
                                await searchHardcoverCovers()
                            }
                        }
                        .disabled(
                            hardcoverVM.tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
                                .isEmpty
                        )
                        if hardcoverVM.hasToken {
                            Button("Cancel") {
                                hardcoverVM.isEditingToken = false
                                hardcoverVM.tokenInput = ""
                            }
                        } else {
                            Text("Hardcover covers require an API key.")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                            tokenHelpButton
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(hardcoverVM.hasToken ? Color.clear : .yellow.opacity(0.05))
    }

    private var tokenHelpButton: some View {
        Button {
            tokenHelpPresented.toggle()
        } label: {
            Image(systemName: "questionmark.circle")
        }
        .buttonStyle(.borderless)
        .help("How to get a Hardcover API token")
        .popover(isPresented: $tokenHelpPresented) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Hardcover API Token")
                    .font(.headline)
                Text(
                    "Create or copy a token from your Hardcover account API settings, then paste it here."
                )
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
                Link(
                    "Open Hardcover API settings",
                    destination: URL(string: "https://hardcover.app/account/api")!,
                )
                .font(.callout)
            }
            .padding()
            .frame(width: 320)
        }
    }

    private func editionColumn(scope: MetadataCoverScope) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(scopeTitle(scope), systemImage: scope == .audiobook ? "headphones" : "book")
                    .font(.headline)
                if selectedCandidateIds[scope] != nil {
                    HStack(spacing: 4) {
                        Text("1 selected")
                            .font(.caption.weight(.semibold))
                        Button {
                            selectedCandidateIds[scope] = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.caption)
                        }
                        .buttonStyle(.borderless)
                        .help("Clear \(scopeTitle(scope).lowercased()) selection")
                    }
                    .foregroundStyle(Color.accentColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.accentColor.opacity(0.12), in: Capsule())
                }
                Spacer()
                if replacementCover(scope: scope) != nil {
                    Button("Revert Cover") {
                        clearReplacementCover(scope: scope)
                    }
                    .font(.callout)
                }
            }

            currentCoverPanel(scope: scope)

            Group {
                if isCompactIOS {
                    VStack(alignment: .leading, spacing: 10) {
                        sourceColumn(source: .hardcover, scope: scope)
                        sourceColumn(source: .apple, scope: scope)
                    }
                } else {
                    HStack(alignment: .top, spacing: 10) {
                        sourceColumn(source: .hardcover, scope: scope)
                        sourceColumn(source: .apple, scope: scope)
                    }
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func currentCoverPanel(scope: MetadataCoverScope) -> some View {
        let coverWidth = currentCoverWidth(scope)
        let coverHeight = currentCoverHeight(scope)

        return GeometryReader { geometry in
            if geometry.size.width >= coverWidth + 180 {
                let detailsLeading = (geometry.size.width / 2) + (coverWidth / 2) + 12

                ZStack {
                    currentCoverImage(scope: scope)
                        .frame(width: coverWidth, height: coverHeight)

                    HStack {
                        Spacer()
                            .frame(width: detailsLeading)
                        currentCoverDetails(scope: scope)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Spacer(minLength: 0)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HStack(alignment: .center, spacing: 12) {
                    Spacer(minLength: 0)
                    currentCoverImage(scope: scope)
                        .frame(width: coverWidth, height: coverHeight)
                    currentCoverDetails(scope: scope)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(10)
        .frame(height: 168, alignment: .center)
        .metadataEditorBoundary(cornerRadius: 8)
    }

    private func currentCoverImage(scope: MetadataCoverScope) -> some View {
        let replacement = replacementCover(scope: scope)
        let serverImage = currentServerCover(scope: scope)
        debugLog(
            "[MetadataCoverRefresh] CoverImport currentCoverImage bookID=\(bookId) scope=\(scope.rawValue) variant=\(scope.variant) replacement=\(replacement != nil) serverImage=\(serverImage != nil)"
        )
        return coverImageView(
            data: replacement?.data,
            serverImage: serverImage,
            aspectRatio: scope.aspectRatio,
        )
        .metadataEditorBoundary(cornerRadius: 8)
    }

    private func currentCoverDetails(scope: MetadataCoverScope) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Current Cover")
                .font(.subheadline.weight(.semibold))
            Text(
                replacementCover(scope: scope) == nil
                    ? "Storyteller cover" : "Replacement staged"
            )
            .font(.callout)
            .foregroundStyle(.secondary)
            if let resolution = currentResolution(scope: scope) {
                Text(resolution)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let preview = currentPreview(scope: scope) {
                Button {
                    previewingCover = preview
                } label: {
                    Label("Preview", systemImage: "magnifyingglass")
                }
                .font(.caption)
                .buttonStyle(.borderless)
            }
        }
    }

    private func sourceColumn(source: CoverProvider, scope: MetadataCoverScope) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(source.title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if isLoading(source) {
                    ProgressView()
                        .controlSize(.small)
                }
                sourceControls(source: source, scope: scope)
            }

            ScrollView {
                LazyVStack(spacing: 8) {
                    let candidates = candidates(source: source, scope: scope)
                    if candidates.isEmpty && !isLoading(source) {
                        Text(emptyText(source: source))
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else {
                        ForEach(candidates) { candidate in
                            candidateCard(candidate)
                        }
                    }
                }
                .padding(.trailing, 4)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(10)
        .metadataEditorBoundary(cornerRadius: 8)
    }

    @ViewBuilder
    private func sourceControls(source: CoverProvider, scope: MetadataCoverScope) -> some View {
        Menu {
            Picker("Sort", selection: sortBinding(for: source)) {
                ForEach(MetadataCoverSort.allCases) { sort in
                    Text(sort.rawValue).tag(sort)
                }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.callout)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Sort \(source.title) covers")

        if source == .hardcover {
            let active =
                hardcoverFilterLanguage(for: scope) != nil
                || hardcoverFilterFormat(for: scope) != nil
                || hardcoverMinResolutions[scope] != nil
            Button {
                filterPopoverScope = scope
            } label: {
                Image(
                    systemName: active
                        ? "line.3.horizontal.decrease.circle.fill"
                        : "line.3.horizontal.decrease.circle"
                )
                .font(.callout)
                .foregroundStyle(active ? Color.accentColor : .secondary)
            }
            .buttonStyle(.borderless)
            .help("Filter Hardcover editions")
            .popover(
                isPresented: Binding(
                    get: { filterPopoverScope == scope },
                    set: { if !$0 { filterPopoverScope = nil } },
                )
            ) {
                hardcoverFilterPopover(scope: scope)
            }
        }
    }

    private func hardcoverFilterPopover(scope: MetadataCoverScope) -> some View {
        let candidates = hardcoverCandidates[scope] ?? []
        let languages = Array(Set(candidates.compactMap(\.language))).sorted()
        let formats = Array(Set(candidates.compactMap(\.format))).sorted()
        let resolutions = Array(
            Set(
                candidates.compactMap { candidate -> Int? in
                    let resolution = max(candidate.width ?? 0, candidate.height ?? 0)
                    return resolution > 0 ? resolution : nil
                }
            )
        ).sorted()

        return VStack(alignment: .leading, spacing: 10) {
            Text("Filter Editions")
                .font(.headline)

            VStack(alignment: .leading, spacing: 4) {
                Text("Language")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Picker("", selection: hardcoverFilterLanguageBinding(for: scope)) {
                    Text("All").tag(String?.none)
                    ForEach(languages, id: \.self) { language in
                        Text(language).tag(Optional(language))
                    }
                }
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Format")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Picker("", selection: hardcoverFilterFormatBinding(for: scope)) {
                    Text("All").tag(String?.none)
                    Divider()
                    Text("Digital Only").tag(Optional("digital"))
                    Text("Physical Only").tag(Optional("physical"))
                    Text("Ebook Only").tag(Optional("ebook"))
                    Text("Audiobook Only").tag(Optional("audiobook"))
                    Divider()
                    ForEach(formats, id: \.self) { format in
                        Text(format).tag(Optional(format))
                    }
                }
                .labelsHidden()
            }

            if !resolutions.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Min Resolution")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Picker("", selection: hardcoverMinResolutionBinding(for: scope)) {
                        Text("Any").tag(Int?.none)
                        ForEach(resolutions, id: \.self) { resolution in
                            Text("\(resolution)px+").tag(Optional(resolution))
                        }
                    }
                    .labelsHidden()
                }
            }

            HStack {
                Spacer()
                Button("Clear Filters") {
                    setHardcoverFilterLanguage(nil, for: scope)
                    setHardcoverFilterFormat(nil, for: scope)
                    hardcoverMinResolutions[scope] = nil
                }
                .disabled(
                    hardcoverFilterLanguage(for: scope) == nil
                        && hardcoverFilterFormat(for: scope) == nil
                        && hardcoverMinResolutions[scope] == nil
                )
            }
            .font(.callout)
        }
        .padding()
        .frame(width: 230)
    }

    private func hardcoverFilterLanguage(for scope: MetadataCoverScope) -> String? {
        switch scope {
            case .audiobook: return audiobookHardcoverFilterLanguage
            case .ebook: return ebookHardcoverFilterLanguage
        }
    }

    private func setHardcoverFilterLanguage(_ value: String?, for scope: MetadataCoverScope) {
        switch scope {
            case .audiobook:
                audiobookHardcoverFilterLanguage = value
            case .ebook:
                ebookHardcoverFilterLanguage = value
        }
    }

    private func hardcoverFilterLanguageBinding(for scope: MetadataCoverScope) -> Binding<String?> {
        Binding(
            get: { hardcoverFilterLanguage(for: scope) },
            set: { setHardcoverFilterLanguage($0, for: scope) },
        )
    }

    private func hardcoverFilterFormat(for scope: MetadataCoverScope) -> String? {
        switch scope {
            case .audiobook: return audiobookHardcoverFilterFormat
            case .ebook: return ebookHardcoverFilterFormat
        }
    }

    private func setHardcoverFilterFormat(_ value: String?, for scope: MetadataCoverScope) {
        switch scope {
            case .audiobook:
                audiobookHardcoverFilterFormat = value
            case .ebook:
                ebookHardcoverFilterFormat = value
        }
    }

    private func hardcoverFilterFormatBinding(for scope: MetadataCoverScope) -> Binding<String?> {
        Binding(
            get: { hardcoverFilterFormat(for: scope) },
            set: { setHardcoverFilterFormat($0, for: scope) },
        )
    }

    private func hardcoverMinResolutionBinding(for scope: MetadataCoverScope) -> Binding<Int?> {
        Binding(
            get: { hardcoverMinResolutions[scope] },
            set: { hardcoverMinResolutions[scope] = $0 },
        )
    }

    private func candidateCard(_ candidate: CoverCandidate) -> some View {
        let isSelected = selectedCandidateIds[candidate.scope] == candidate.id
        return HStack(alignment: .top, spacing: 8) {
            AsyncImage(url: candidate.url) { phase in
                switch phase {
                    case .success(let image):
                        image.resizable().interpolation(.high).scaledToFit()
                    case .failure:
                        Image(systemName: "photo")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    default:
                        ProgressView()
                            .controlSize(.small)
                }
            }
            .frame(width: 58, height: candidate.scope == .audiobook ? 58 : 86)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(candidate.title)
                    .font(.callout.weight(.semibold))
                    .lineLimit(2)
                if let subtitle = candidate.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if let width = candidate.width, let height = candidate.height {
                    Text("\(width) x \(height)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 4)
            VStack(spacing: 8) {
                Button {
                    previewingCover = .url(candidate.url, candidate.title)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                }
                .buttonStyle(.borderless)
                .help("Preview cover")
                Button {
                    toggleSelectedCandidate(candidate)
                } label: {
                    if applyingCandidateId == candidate.id {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 22, height: 22)
                    } else {
                        Image(systemName: isSelected ? "arrow.up.circle.fill" : "arrow.up.circle")
                            .font(.title3)
                            .foregroundStyle(.blue)
                            .frame(width: 22, height: 22)
                    }
                }
                .buttonStyle(.borderless)
                .disabled(applyingCandidateId != nil)
                .help(
                    isSelected
                        ? "Selected for import"
                        : "Select this \(scopeTitle(candidate.scope).lowercased()) cover"
                )
            }
            .frame(width: 28, alignment: .top)
        }
        .frame(minHeight: candidate.scope == .audiobook ? 82 : 110, alignment: .top)
        .padding(8)
        .background(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.06))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 1.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onTapGesture {
            toggleSelectedCandidate(candidate)
        }
    }

    private var bottomBar: some View {
        HStack {
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
            Spacer()
            #if !os(iOS)
            Button("Cancel") {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)
            #endif

            Button("Apply Selected Covers") {
                Task {
                    await applySelectedCandidates()
                    dismiss()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(selectedCandidates.isEmpty || applyingCandidateId != nil)
        }
        .padding(12)
    }

    private func coverPreviewSheet(_ cover: PreviewCover) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(previewTitle(cover))
                    .font(.headline)
                Spacer()
                Button("Done") { previewingCover = nil }
                    .keyboardShortcut(.cancelAction)
            }
            .padding()

            Divider()

            Group {
                switch cover {
                    case .image(let image, _):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    case .data(let data, _):
                        dataImage(data)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    case .url(let url, _):
                        AsyncImage(url: url) { phase in
                            switch phase {
                                case .success(let image):
                                    image
                                        .resizable()
                                        .aspectRatio(contentMode: .fit)
                                case .failure:
                                    ContentUnavailableView(
                                        "Failed to load image",
                                        systemImage: "photo",
                                    )
                                default:
                                    ProgressView()
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                }
            }
            .padding()
        }
        .frame(width: isCompactIOS ? nil : 620, height: isCompactIOS ? nil : 720)
        .frame(maxWidth: isCompactIOS ? .infinity : nil, maxHeight: isCompactIOS ? .infinity : nil)
    }

    private func loadInitialCandidates(force: Bool = false) async {
        guard book != nil else { return }
        await hardcoverVM.loadToken()
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await searchItunesCovers(force: force) }
            group.addTask { await searchHardcoverCovers(force: force) }
        }
    }

    private var selectedCandidates: [CoverCandidate] {
        selectedCandidateIds.compactMap { scope, id in
            allCandidates(scope: scope).first { $0.id == id }
        }
    }

    private func searchItunesCovers(force: Bool = false) async {
        guard let book else { return }
        if !force, itunesCandidates.values.contains(where: { !$0.isEmpty }) { return }
        isSearchingItunes = true
        defer { isSearchingItunes = false }
        do {
            let candidates = try await CoverSearch.apple(
                title: book.title,
                author: book.authors.first,
            )
            itunesCandidates = grouped(candidates)
        } catch {
            errorMessage = "iTunes cover search failed: \(error.localizedDescription)"
        }
    }

    private func grouped(_ candidates: [CoverCandidate]) -> [MetadataCoverScope: [CoverCandidate]] {
        var grouped: [MetadataCoverScope: [CoverCandidate]] = [.audiobook: [], .ebook: []]
        for candidate in candidates {
            grouped[candidate.scope, default: []].append(candidate)
        }
        return grouped
    }

    private func searchHardcoverCovers(force: Bool = false) async {
        guard let book, hardcoverVM.hasToken else { return }
        if !force, hardcoverCandidates.values.contains(where: { !$0.isEmpty }) { return }
        isSearchingHardcover = true
        defer { isSearchingHardcover = false }
        hardcoverVM.prefill(title: book.title, author: book.authors.first)
        await hardcoverVM.search()

        // Goes through the view model rather than CoverSearch.hardcover so the work details stay
        // shared with the metadata tabs' cache.
        var candidates: [CoverCandidate] = []
        for result in hardcoverVM.searchResults.prefix(6) {
            await hardcoverVM.fetchInfo(for: result)
            guard let details = hardcoverVM.infoDetails[result.id] else { continue }
            candidates += CoverSearch.candidates(from: details, fallbackTitle: result.title)
        }

        hardcoverCandidates = grouped(CoverSearch.dedupedByURL(candidates))
    }

    private func apply(_ candidate: CoverCandidate) async {
        applyingCandidateId = candidate.id
        defer { applyingCandidateId = nil }
        do {
            let cover = try await CoverDownload.fetch(candidate)
            guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
            switch candidate.scope {
                case .audiobook:
                    viewModel.books[index].replacementAudiobookCover = (
                        data: cover.data, filename: cover.filename,
                    )
                case .ebook:
                    viewModel.books[index].replacementEbookCover = (
                        data: cover.data, filename: cover.filename,
                    )
            }
            errorMessage = nil
        } catch {
            errorMessage = "Could not download cover: \(error.localizedDescription)"
        }
    }

    private func applySelectedCandidates() async {
        for candidate in selectedCandidates {
            await apply(candidate)
        }
        selectedCandidateIds.removeAll()
    }

    private func toggleSelectedCandidate(_ candidate: CoverCandidate) {
        if selectedCandidateIds[candidate.scope] == candidate.id {
            selectedCandidateIds[candidate.scope] = nil
        } else {
            selectedCandidateIds[candidate.scope] = candidate.id
        }
    }

    private func candidates(source: CoverProvider, scope: MetadataCoverScope)
        -> [CoverCandidate]
    {
        let candidates: [CoverCandidate]
        switch source {
            case .hardcover:
                candidates = filteredHardcoverCandidates(scope: scope)
            case .apple:
                candidates = itunesCandidates[scope] ?? []
        }

        return sortedCandidates(candidates, sort: sortValue(for: source))
    }

    private func sortValue(for source: CoverProvider) -> MetadataCoverSort {
        switch source {
            case .hardcover: return hardcoverSort
            case .apple: return itunesSort
        }
    }

    private func sortBinding(for source: CoverProvider) -> Binding<MetadataCoverSort> {
        switch source {
            case .hardcover:
                return Binding(
                    get: { hardcoverSort },
                    set: { hardcoverSort = $0 },
                )
            case .apple:
                return Binding(
                    get: { itunesSort },
                    set: { itunesSort = $0 },
                )
        }
    }

    private func allCandidates(scope: MetadataCoverScope) -> [CoverCandidate] {
        candidates(source: .hardcover, scope: scope) + candidates(source: .apple, scope: scope)
    }

    private func filteredHardcoverCandidates(scope: MetadataCoverScope) -> [CoverCandidate] {
        let filterLanguage = hardcoverFilterLanguage(for: scope)
        let filterFormat = hardcoverFilterFormat(for: scope)
        let minResolution = hardcoverMinResolutions[scope]

        return (hardcoverCandidates[scope] ?? []).filter { candidate in
            if let filterLanguage {
                guard candidate.language?.lowercased() == filterLanguage.lowercased() else {
                    return false
                }
            }

            if let filterFormat {
                switch filterFormat {
                    case "digital":
                        guard Self.digitalFormats.contains(candidate.format ?? "") else {
                            return false
                        }
                    case "physical":
                        guard Self.physicalFormats.contains(candidate.format ?? "") else {
                            return false
                        }
                    case "ebook":
                        guard Self.ebookFormats.contains(candidate.format ?? "") else {
                            return false
                        }
                    case "audiobook":
                        guard Self.audiobookFormats.contains(candidate.format ?? "") else {
                            return false
                        }
                    default:
                        guard candidate.format == filterFormat else { return false }
                }
            }

            if let minResolution {
                guard max(candidate.width ?? 0, candidate.height ?? 0) >= minResolution else {
                    return false
                }
            }

            return true
        }
    }

    private func sortedCandidates(
        _ candidates: [CoverCandidate],
        sort: MetadataCoverSort,
    ) -> [CoverCandidate] {
        switch sort {
            case .relevance:
                return candidates
            case .resolution:
                return candidates.sorted {
                    let lhs = max($0.width ?? 0, $0.height ?? 0)
                    let rhs = max($1.width ?? 0, $1.height ?? 0)
                    if lhs != rhs { return lhs > rhs }
                    return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
                }
        }
    }

    private func isLoading(_ source: CoverProvider) -> Bool {
        switch source {
            case .hardcover: return isSearchingHardcover
            case .apple: return isSearchingItunes
        }
    }

    private func emptyText(source: CoverProvider) -> String {
        switch source {
            case .hardcover:
                return hardcoverVM.hasToken
                    ? "No Hardcover covers found." : "Add a Hardcover API key above."
            case .apple:
                return "No iTunes covers found."
        }
    }

    private func replacementCover(scope: MetadataCoverScope) -> (data: Data, filename: String)? {
        switch scope {
            case .audiobook: return book?.replacementAudiobookCover
            case .ebook: return book?.replacementEbookCover
        }
    }

    private func clearReplacementCover(scope: MetadataCoverScope) {
        guard let index = viewModel.books.firstIndex(where: { $0.id == bookId }) else { return }
        switch scope {
            case .audiobook:
                viewModel.books[index].replacementAudiobookCover = nil
            case .ebook:
                viewModel.books[index].replacementEbookCover = nil
        }
    }

    private func currentServerCover(scope: MetadataCoverScope) -> Image? {
        guard let metadata = book?.originalMetadata else { return nil }
        let state = mediaViewModel.coverState(for: metadata, variant: scope.variant)
        #if canImport(AppKit)
        let nsImageSize =
            state.nsImage.map { "\(Int($0.size.width))x\(Int($0.size.height))" } ?? "nil"
        #else
        let nsImageSize = "unavailable"
        #endif
        debugLog(
            "[MetadataCoverRefresh] CoverImport currentServerCover bookID=\(metadata.id) scope=\(scope.rawValue) variant=\(scope.variant) stateObject=\(ObjectIdentifier(state)) image=\(state.image != nil) nsImage=\(nsImageSize)"
        )
        return state.image
    }

    private func currentPreview(scope: MetadataCoverScope) -> PreviewCover? {
        if let data = replacementCover(scope: scope)?.data {
            debugLog(
                "[MetadataCoverRefresh] CoverImport currentPreview replacement bookID=\(bookId) scope=\(scope.rawValue) bytes=\(data.count)"
            )
            return .data(data, scopeTitle(scope))
        }
        if let image = currentServerCover(scope: scope) {
            debugLog(
                "[MetadataCoverRefresh] CoverImport currentPreview serverImage bookID=\(bookId) scope=\(scope.rawValue)"
            )
            return .image(image, scopeTitle(scope))
        }
        debugLog(
            "[MetadataCoverRefresh] CoverImport currentPreview nil bookID=\(bookId) scope=\(scope.rawValue)"
        )
        return nil
    }

    private func currentResolution(scope: MetadataCoverScope) -> String? {
        if let data = replacementCover(scope: scope)?.data {
            return resolutionString(from: data)
        }
        guard let metadata = book?.originalMetadata else { return nil }
        #if canImport(AppKit)
        let state = mediaViewModel.coverState(for: metadata, variant: scope.variant)
        guard let nsImage = state.nsImage, let rep = nsImage.representations.first else {
            return nil
        }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #else
        return nil
        #endif
    }

    private func coverImageView(data: Data?, serverImage: Image?, aspectRatio: CGFloat) -> some View
    {
        ZStack {
            Color.secondary.opacity(0.1)
            if let data {
                dataImage(data)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else if let serverImage {
                serverImage
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(8)
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "photo")
                        .font(.title)
                    Text("No cover")
                        .font(.caption)
                }
                .foregroundStyle(.secondary)
            }
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
    }

    private func currentCoverWidth(_ scope: MetadataCoverScope) -> CGFloat {
        scope == .audiobook ? 132 : 96
    }

    private func currentCoverHeight(_ scope: MetadataCoverScope) -> CGFloat {
        scope == .audiobook ? 132 : 144
    }

    private func scopeTitle(_ scope: MetadataCoverScope) -> String {
        scope == .audiobook ? "Audiobook Edition" : "Ebook Edition"
    }

    private static let digitalFormats: Set<String> = ["Ebook", "Kindle", "Audible", "Audiobook"]
    private static let physicalFormats: Set<String> = [
        "Hardcover", "Paperback", "Mass Market Paperback",
    ]
    private static let ebookFormats: Set<String> = ["Ebook", "Kindle"]
    private static let audiobookFormats: Set<String> = ["Audible", "Audiobook"]
    private func resolutionString(from data: Data) -> String? {
        #if canImport(AppKit)
        guard let image = NSImage(data: data), let rep = image.representations.first else {
            return nil
        }
        return "\(rep.pixelsWide) x \(rep.pixelsHigh)"
        #else
        return nil
        #endif
    }

    private func previewTitle(_ cover: PreviewCover) -> String {
        switch cover {
            case .image(_, let label), .data(_, let label), .url(_, let label):
                return label
        }
    }

    private func dataImage(_ data: Data) -> Image {
        #if canImport(AppKit)
        if let nsImage = NSImage(data: data) {
            return Image(nsImage: nsImage)
        }
        #endif
        return Image(systemName: "photo")
    }
}

#endif
