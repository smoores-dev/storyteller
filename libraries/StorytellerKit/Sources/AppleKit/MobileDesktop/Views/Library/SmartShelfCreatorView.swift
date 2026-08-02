#if os(macOS)
import SwiftUI

private struct IdentifiedCondition: Identifiable, Equatable {
    let id: UUID
    var condition: ShelfCondition

    init(_ condition: ShelfCondition) {
        self.id = UUID()
        self.condition = condition
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.condition == rhs.condition
    }
}

struct SmartShelfCreatorView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.dismiss) private var dismiss

    let existingShelf: SmartShelf?
    let onSave: (SmartShelf) -> Void

    @State private var shelfName: String
    @State private var identifiedConditions: [IdentifiedCondition]
    @State private var showingConditionPicker = false
    @State private var editingConditionIndex: Int?
    @State private var showValidation = false
    @State private var selectedConditionType: ShelfConditionType?
    @State private var matchingBooks: [BookMetadata] = []
    @State private var matchingBooksTask: Task<Void, Never>?
    @State private var matchingBooksGeneration = 0
    @State private var draftShelfID: UUID
    @AppStorage("coverPref.smartShelfCreator") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble.rawValue

    private var coverPreference: CoverPreference {
        CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook
    }

    private var conditions: [ShelfCondition] {
        identifiedConditions.map(\.condition)
    }

    init(existingShelf: SmartShelf? = nil, onSave: @escaping (SmartShelf) -> Void) {
        self.existingShelf = existingShelf
        self.onSave = onSave
        _shelfName = State(initialValue: existingShelf?.name ?? "")
        _identifiedConditions = State(
            initialValue: (existingShelf?.conditions ?? []).map { IdentifiedCondition($0) }
        )
        _draftShelfID = State(initialValue: existingShelf?.id ?? UUID())
    }

    private var previewShelf: SmartShelf? {
        let raw = conditions
        guard !raw.isEmpty else { return nil }
        return SmartShelf(
            id: draftShelfID,
            name: shelfName,
            conditions: raw,
        )
    }

    private var hasName: Bool {
        !shelfName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hasConditions: Bool {
        conditions.contains(where: {
            if case .orSeparator = $0 { return false }
            return true
        })
    }

    private var canSave: Bool {
        hasName && hasConditions
    }

    private var validationMessage: String? {
        if !hasName && !hasConditions { return "Add a name and at least one condition" }
        if !hasName { return "Add a shelf name" }
        if !hasConditions { return "Add at least one condition" }
        return nil
    }

    var body: some View {
        VStack(spacing: 0) {
            headerBar

            Divider()

            HSplitView {
                conditionPanel
                    .frame(minWidth: 280, idealWidth: 320, maxWidth: 400)

                previewPanel
                    .frame(minWidth: 300, idealWidth: 500)
            }

            Divider()

            footerBar
        }
        .frame(minWidth: 700, idealWidth: 850, minHeight: 500, idealHeight: 600)
        .background(Color(nsColor: .controlBackgroundColor))
        .sheet(item: $selectedConditionType) { type in
            ConditionEditorSheet(
                conditionType: type
            ) { newConditions in
                appendConditions(newConditions)
            }
        }
        .onAppear {
            debugLog(
                "[SmartShelfCreator] appeared, vm=\(ObjectIdentifier(mediaViewModel)), isReady=\(mediaViewModel.isReady), libraryVersion=\(mediaViewModel.libraryVersion), bookMetaData.count=\(mediaViewModel.library.bookMetaData.count)"
            )
            requestMatchingBooks()
        }
        .onChange(of: identifiedConditions) { _, _ in
            requestMatchingBooks()
        }
        .onChange(of: mediaViewModel.libraryVersion) { _, _ in
            requestMatchingBooks()
        }
        .onDisappear {
            matchingBooksTask?.cancel()
        }
    }

    private var headerBar: some View {
        HStack {
            TextField("Shelf Name", text: $shelfName)
                .textFieldStyle(.plain)
                .font(.system(size: 20, weight: .medium))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
        }
    }

    private var conditionPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Conditions")
                    .font(.headline)
                Spacer()
                addConditionMenu
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            if identifiedConditions.isEmpty {
                VStack(spacing: 8) {
                    Text("No conditions added")
                        .foregroundStyle(.secondary)
                    Text("Add conditions to filter your library")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(Array(identifiedConditions.enumerated()), id: \.element.id) {
                        index,
                        ic in
                        conditionRow(ic.condition, at: index)
                            .listRowSeparator(.hidden)
                            .listRowInsets(
                                EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12)
                            )
                    }
                    .onMove(perform: moveConditions)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private func moveConditions(from source: IndexSet, to destination: Int) {
        identifiedConditions.move(fromOffsets: source, toOffset: destination)
    }

    @ViewBuilder
    private func conditionRow(_ condition: ShelfCondition, at index: Int) -> some View {
        if case .orSeparator = condition {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(Color.secondary.opacity(0.3))
                    .frame(height: 1)
                Text("OR")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
                Rectangle()
                    .fill(Color.secondary.opacity(0.3))
                    .frame(height: 1)
                Button {
                    identifiedConditions.remove(at: index)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .imageScale(.small)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 4)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                if index > 0 && !isPrecededByOrSeparator(at: index) {
                    Text("AND")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 4)
                }

                HStack {
                    Text(condition.displayLabel)
                        .font(.callout)
                        .lineLimit(2)

                    Spacer()

                    Button {
                        identifiedConditions.remove(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.secondary.opacity(0.1))
                )
            }
        }
    }

    private func isPrecededByOrSeparator(at index: Int) -> Bool {
        guard index > 0 else { return false }
        if case .orSeparator = identifiedConditions[index - 1].condition { return true }
        return false
    }

    private var addConditionMenu: some View {
        Menu {
            addConditionMenuContent
        } label: {
            Label("Add Condition", systemImage: "plus.circle")
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    /// Registry-driven, mirroring the sort/columns/filter menus: fields appear in canonical order
    /// with a divider on each section change, Alignment as a nested submenu, the translator extra
    /// grouped with the narrator, and the shelf-only Format/Rating/OR appended last.
    @ViewBuilder
    private var addConditionMenuContent: some View {
        let fields = LibraryMetadataField.shelfFields
        ForEach(Array(fields.enumerated()), id: \.element.field) { index, descriptor in
            if index > 0, descriptor.section != fields[index - 1].section {
                Divider()
            }
            if descriptor.isSubmenu,
                let types = ShelfConditionType.submenuTypes(for: descriptor.field)
            {
                Menu {
                    ForEach(types) { conditionButton($0) }
                } label: {
                    Label(descriptor.label, systemImage: "waveform")
                }
            } else if let type = ShelfConditionType.from(descriptor.field) {
                conditionButton(type)
                if type == .narrator { conditionButton(.translator) }
            }
        }

        Divider()
        conditionButton(.format)
        conditionButton(.rating)
        Button {
            identifiedConditions.append(IdentifiedCondition(.orSeparator))
        } label: {
            Label("OR", systemImage: ShelfConditionType.boolean.systemImage)
        }
    }

    private func conditionButton(_ type: ShelfConditionType) -> some View {
        Button {
            selectedConditionType = type
        } label: {
            Label(type.label, systemImage: type.systemImage)
        }
    }

    private func appendConditions(_ newConditions: [ShelfCondition]) {
        for condition in newConditions {
            if isInclusionCondition(condition) {
                mergeInclusionCondition(condition)
            } else {
                identifiedConditions.append(IdentifiedCondition(condition))
            }
        }
    }

    private func isInclusionCondition(_ condition: ShelfCondition) -> Bool {
        switch condition {
            case .format, .status, .location, .progress,
                .tag, .series, .author, .narrator, .translator, .publicationYear,
                .language, .collection, .source, .alignedWith, .alignedVersion:
                return true
            default:
                return false
        }
    }

    private func mergeInclusionCondition(_ condition: ShelfCondition) {
        let lastOrIndex = identifiedConditions.lastIndex(where: {
            if case .orSeparator = $0.condition { return true }
            return false
        })
        let groupStart = (lastOrIndex ?? -1) + 1

        if let existingIndex = identifiedConditions[groupStart...].firstIndex(where: {
            inclusionConditionMatches($0.condition, condition)
        }) {
            identifiedConditions[existingIndex].condition =
                mergedInclusionValues(
                    existing: identifiedConditions[existingIndex].condition,
                    new: condition,
                )
        } else {
            identifiedConditions.append(IdentifiedCondition(condition))
        }
    }

    private func inclusionConditionMatches(_ existing: ShelfCondition, _ new: ShelfCondition)
        -> Bool
    {
        switch (existing, new) {
            case (.format(let m1, _), .format(let m2, _)): return m1 == m2
            case (.status(let m1, _), .status(let m2, _)): return m1 == m2
            case (.location(let m1, _), .location(let m2, _)): return m1 == m2
            case (.progress(let m1, _), .progress(let m2, _)): return m1 == m2
            case (.tag(let m1, _), .tag(let m2, _)): return m1 == m2
            case (.series(let m1, _), .series(let m2, _)): return m1 == m2
            case (.author(let m1, _), .author(let m2, _)): return m1 == m2
            case (.narrator(let m1, _), .narrator(let m2, _)): return m1 == m2
            case (.translator(let m1, _), .translator(let m2, _)): return m1 == m2
            case (.publicationYear(let m1, _), .publicationYear(let m2, _)): return m1 == m2
            case (.language(let m1, _), .language(let m2, _)): return m1 == m2
            case (.collection(let m1, _), .collection(let m2, _)): return m1 == m2
            case (.source(let m1, _), .source(let m2, _)): return m1 == m2
            case (.alignedWith(let m1, _), .alignedWith(let m2, _)): return m1 == m2
            case (.alignedVersion(let m1, _), .alignedVersion(let m2, _)): return m1 == m2
            default: return false
        }
    }

    private func mergedInclusionValues(existing: ShelfCondition, new: ShelfCondition)
        -> ShelfCondition
    {
        switch (existing, new) {
            case (.format(let m, let c1), .format(_, let c2)):
                return .format(mode: m, conditions: mergedValues(c1, c2))
            case (.status(let m, let v1), .status(_, let v2)):
                return .status(mode: m, values: mergedValues(v1, v2))
            case (.location(let m, let c1), .location(_, let c2)):
                return .location(mode: m, conditions: mergedValues(c1, c2))
            case (.progress(let m, let c1), .progress(_, let c2)):
                return .progress(mode: m, conditions: mergedValues(c1, c2))
            case (.tag(let m, let v1), .tag(_, let v2)):
                return .tag(mode: m, values: mergedValues(v1, v2))
            case (.series(let m, let v1), .series(_, let v2)):
                return .series(mode: m, values: mergedValues(v1, v2))
            case (.author(let m, let v1), .author(_, let v2)):
                return .author(mode: m, values: mergedValues(v1, v2))
            case (.narrator(let m, let v1), .narrator(_, let v2)):
                return .narrator(mode: m, values: mergedValues(v1, v2))
            case (.translator(let m, let v1), .translator(_, let v2)):
                return .translator(mode: m, values: mergedValues(v1, v2))
            case (.publicationYear(let m, let v1), .publicationYear(_, let v2)):
                return .publicationYear(mode: m, values: mergedValues(v1, v2))
            case (.language(let m, let v1), .language(_, let v2)):
                return .language(mode: m, values: mergedValues(v1, v2))
            case (.collection(let m, let v1), .collection(_, let v2)):
                return .collection(mode: m, values: mergedValues(v1, v2))
            case (.source(let m, let v1), .source(_, let v2)):
                return .source(mode: m, values: mergedValues(v1, v2))
            case (.alignedWith(let m, let v1), .alignedWith(_, let v2)):
                return .alignedWith(mode: m, values: mergedValues(v1, v2))
            case (.alignedVersion(let m, let v1), .alignedVersion(_, let v2)):
                return .alignedVersion(mode: m, values: mergedValues(v1, v2))
            default:
                return existing
        }
    }

    private func mergedValues<T: Equatable>(_ existing: [T], _ new: [T]) -> [T] {
        var result = existing
        for value in new where !result.contains(value) {
            result.append(value)
        }
        return result
    }

    private var previewPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Preview")
                    .font(.headline)
                Spacer()
                Text("\(matchingBooks.count) book\(matchingBooks.count == 1 ? "" : "s")")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            if conditions.isEmpty {
                VStack(spacing: 8) {
                    Text("Add conditions to see matching books")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if matchingBooks.isEmpty {
                VStack(spacing: 8) {
                    Text("No books match")
                        .foregroundStyle(.secondary)
                    Text("Try adjusting your conditions")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    let columns = [GridItem(.adaptive(minimum: 80, maximum: 100), spacing: 12)]
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(matchingBooks) { book in
                            previewBookTile(book)
                        }
                    }
                    .padding(12)
                }
            }
        }
    }

    @ViewBuilder
    private func previewBookTile(_ book: BookMetadata) -> some View {
        let variant = resolveCoverVariant(for: book)
        let coverState = mediaViewModel.coverState(for: book, variant: variant)
        let aspectRatio = coverPreference.preferredContainerAspectRatio

        VStack(spacing: 4) {
            ZStack {
                Color(white: 0.2)
                if let image = coverState.image {
                    image
                        .resizable()
                        .interpolation(.medium)
                        .scaledToFill()
                }
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .task {
                mediaViewModel.ensureCoverLoaded(for: book, variant: variant)
            }
            .onDisappear {
                mediaViewModel.cancelCoverLoad(for: book, variant: variant)
            }

            Text(book.title)
                .font(.system(size: 10))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }

    private func resolveCoverVariant(for item: BookMetadata) -> MediaViewModel.CoverVariant {
        switch coverPreference {
            case .preferEbook, .storytellerDouble:
                if item.hasAvailableEbook { return .standard }
                return item.hasAvailableAudiobook ? .audioSquare : .standard
            case .preferAudiobook:
                if item.hasAvailableAudiobook || item.isAudiobookOnly { return .audioSquare }
                return .standard
        }
    }

    private var footerBar: some View {
        HStack {
            if showValidation, let message = validationMessage {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.red)
            }

            Spacer()
            Button("Cancel") {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)

            Button(existingShelf != nil ? "Save Changes" : "Create Smart Shelf") {
                if canSave {
                    let shelf = SmartShelf(
                        id: draftShelfID,
                        name: shelfName.trimmingCharacters(in: .whitespacesAndNewlines),
                        conditions: conditions,
                        createdAt: existingShelf?.createdAt ?? Date(),
                    )
                    onSave(shelf)
                    dismiss()
                } else {
                    showValidation = true
                }
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func requestMatchingBooks() {
        matchingBooksTask?.cancel()
        guard let shelf = previewShelf else {
            matchingBooks = []
            return
        }
        matchingBooksGeneration += 1
        let generation = matchingBooksGeneration
        matchingBooksTask = Task { @MainActor in
            let books = await mediaViewModel.smartShelfBooks(for: shelf)
            guard !Task.isCancelled, generation == matchingBooksGeneration else { return }
            matchingBooks = books
        }
    }
}
#endif
