#if os(iOS) || os(macOS)
import SwiftUI

struct UnifiedMetadataImportView: View {
    @State private var viewModel = UnifiedMetadataImportViewModel()
    let bookTitle: String
    let bookAuthor: String?
    let currentBook: MetadataEditorViewModel.EditableBook
    let onImport:
        (
            [MetadataEditorViewModel.HardcoverImportSource: BookMetadataCandidate],
            Set<String>,
            MetadataEditorViewModel.IdentifierImportChanges?,
        ) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompactIOS: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    private let labelWidth: CGFloat = 120

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if isCompactIOS {
                ScrollView {
                    VStack(spacing: 0) {
                        leftPicker.frame(height: 320)
                        Divider()
                        compactComparison
                    }
                }
            } else {
                HStack(spacing: 0) {
                    leftPicker.frame(width: 340)
                    Divider()
                    comparisonTable
                }
            }
            Divider()
            bottomBar
        }
        .frame(width: isCompactIOS ? nil : 1120, height: isCompactIOS ? nil : 660)
        .frame(maxWidth: isCompactIOS ? .infinity : nil, maxHeight: isCompactIOS ? .infinity : nil)
        .task { await viewModel.setup(book: currentBook) }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Import Metadata")
                    .font(.title3.weight(.semibold))
                Text("Pick each field's source, then import. Fields left on Current are unchanged.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                viewModel.showCurrentColumn.toggle()
            } label: {
                Label(
                    viewModel.showCurrentColumn ? "Hide Current" : "Show Current",
                    systemImage: viewModel.showCurrentColumn ? "eye.slash" : "eye",
                )
            }
            .help("Show or hide the Current values column")
        }
        .padding(12)
    }

    private var leftPicker: some View {
        VStack(spacing: 0) {
            Picker("Source", selection: $viewModel.pickerSource) {
                ForEach(UnifiedMetadataImportViewModel.pickerColumns) { source in
                    Text(source.title).tag(source)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(10)
            Divider()
            switch viewModel.pickerSource {
                case .hardcover: hardcoverPicker
                default: audnexusPicker
            }
        }
    }

    private var audnexusPicker: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                TextField("Search audiobooks", text: $viewModel.audnexus.searchQuery)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await viewModel.searchAudnexus() } }
                Picker("Region", selection: $viewModel.audnexus.region) {
                    ForEach(AudnexusImportViewModel.regions, id: \.self) { region in
                        Text(region.uppercased()).tag(region)
                    }
                }
                .labelsHidden()
                .frame(width: 72)
                .onChange(of: viewModel.audnexus.region) { _, _ in
                    viewModel.audnexus.persistRegion()
                    Task { await viewModel.searchAudnexus() }
                }
                searchButton(isBusy: viewModel.audnexus.isSearching) {
                    Task { await viewModel.searchAudnexus() }
                }
            }
            .padding(10)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let error = viewModel.audnexus.error,
                        viewModel.audnexus.searchResults.isEmpty
                    {
                        pickerMessage(error)
                    }
                    ForEach(viewModel.audnexus.searchResults) { result in
                        audnexusRow(result)
                        Divider()
                    }
                }
            }
        }
    }

    private func audnexusRow(_ result: AudnexusSearchResult) -> some View {
        let isSelected = viewModel.audnexus.selectedAsin == result.asin
        return Button {
            Task { await viewModel.selectAudnexus(result) }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                coverThumb(result.coverUrl)
                VStack(alignment: .leading, spacing: 2) {
                    Text(result.title).font(.callout.weight(.semibold)).lineLimit(2)
                    if !result.authors.isEmpty {
                        Text(result.authors.joined(separator: ", "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if let series = result.seriesName {
                        Text(result.seriesPosition.map { "\(series) #\($0)" } ?? series)
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if !result.narrators.isEmpty {
                        Text("Narrated by \(result.narrators.joined(separator: ", "))")
                            .font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.14) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var hardcoverPicker: some View {
        if !viewModel.hardcover.hasToken {
            hardcoverTokenEntry
        } else {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    TextField("Search Hardcover", text: $viewModel.hardcover.searchQuery)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await viewModel.searchHardcover() } }
                    searchButton(isBusy: viewModel.hardcover.isSearching) {
                        Task { await viewModel.searchHardcover() }
                    }
                }
                .padding(10)
                Divider()
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if let error = viewModel.hardcover.error,
                            viewModel.hardcover.searchResults.isEmpty
                        {
                            pickerMessage(error)
                        }
                        ForEach(viewModel.hardcover.searchResults) { result in
                            hardcoverResultRow(result)
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private var hardcoverTokenEntry: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Connect Hardcover").font(.callout.weight(.semibold))
            Text("Paste a Hardcover API token to search its catalog.")
                .font(.caption).foregroundStyle(.secondary)
            SecureField("Hardcover token", text: $viewModel.hardcover.tokenInput)
                .textFieldStyle(.roundedBorder)
            Button("Save Token") { Task { await viewModel.saveHardcoverToken() } }
                .disabled(
                    viewModel.hardcover.tokenInput.trimmingCharacters(in: .whitespaces).isEmpty
                )
            if let error = viewModel.hardcover.error {
                Text(error).font(.caption).foregroundStyle(.orange)
            }
            Spacer()
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func hardcoverResultRow(_ result: HardcoverSearchResult) -> some View {
        let isExpanded = viewModel.expandedHardcoverResultIds.contains(result.id)
        let editions = viewModel.hardcover.infoDetails[result.id]?.editions ?? []
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Button {
                    Task { await viewModel.expandHardcover(result) }
                } label: {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption).foregroundStyle(.secondary).frame(width: 16)
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        if viewModel.hardcover.infoDetails[result.id] == nil {
                            await viewModel.hardcover.fetchInfo(for: result)
                        }
                        viewModel.selectHardcoverWork(result)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(result.title).font(.callout.weight(.semibold)).lineLimit(2)
                        Text(
                            [result.authors.first, result.releaseYear.map(String.init)]
                                .compactMap { $0 }.joined(separator: " - ")
                        )
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(
                viewModel.hardcoverSelectionKey == "work-\(result.id)"
                    ? Color.accentColor.opacity(0.14) : Color.clear
            )

            if isExpanded {
                if viewModel.hardcover.infoFetchingId == result.id {
                    ProgressView().controlSize(.small).padding(.leading, 34).padding(.vertical, 4)
                }
                ForEach(editions) { edition in
                    hardcoverEditionRow(edition, result: result)
                }
            }
        }
    }

    private func hardcoverEditionRow(
        _ edition: BookEditionCandidate,
        result: HardcoverSearchResult,
    ) -> some View {
        let isSelected = viewModel.hardcoverSelectionKey == "edition-\(edition.id)"
        let subtitle = [edition.language, editionYear(edition)]
            .compactMap { $0 }.joined(separator: " - ")
        return Button {
            viewModel.selectHardcoverEdition(edition, result: result)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "book.closed").font(.caption2).foregroundStyle(.tertiary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(edition.editionInfo ?? edition.format.capitalized)
                        .font(.caption).lineLimit(1)
                    if !subtitle.isEmpty {
                        Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 5)
            .padding(.leading, 34)
            .padding(.trailing, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.14) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var comparisonTable: some View {
        VStack(spacing: 0) {
            columnHeaderRow
            Divider()
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(UnifiedMetadataImportViewModel.scalarFields, id: \.self) { field in
                        scalarRow(field)
                        Divider()
                    }
                    identifiersRow
                    Divider()
                    tagsRow
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Compact iOS can't fit 2-3 side-by-side value columns after a fixed label column, so each
    /// field becomes a card that stacks its sources vertically at full width.
    private var compactComparison: some View {
        LazyVStack(spacing: 14) {
            compactSelectAllBar
            ForEach(UnifiedMetadataImportViewModel.scalarFields, id: \.self) { field in
                compactFieldCard(field)
            }
            compactIdentifiersCard
            compactTagsCard
        }
        .padding(12)
    }

    private var compactSelectAllBar: some View {
        HStack(spacing: 8) {
            Text("Fill all from")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(viewModel.visibleColumns) { column in
                Button(column.title) { viewModel.selectAll(column: column) }
                    .font(.caption.weight(.medium))
                    .buttonStyle(.bordered)
                    .disabled(!viewModel.hasCandidate(column))
            }
            Spacer(minLength: 0)
        }
    }

    private func compactFieldCard(_ field: String) -> some View {
        let label = UnifiedMetadataImportViewModel.fieldLabels[field] ?? field
        let expandable = isFieldExpandable(field)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(label).font(.callout.weight(.semibold))
                if expandable {
                    Button {
                        viewModel.toggleExpanded(field)
                    } label: {
                        Image(
                            systemName: viewModel.isExpanded(field) ? "chevron.up" : "chevron.down"
                        )
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            ForEach(viewModel.visibleColumns) { column in
                compactSourceRow(field: field, column: column)
            }
        }
    }

    @ViewBuilder
    private func compactSourceRow(
        field: String,
        column: UnifiedMetadataImportViewModel.Column,
    ) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            compactUnavailableRow(column)
        } else {
            let value = viewModel.value(field, from: column)
            let hasValue = !value.isEmpty
            let isCurrent = column == .current
            let selectable = isCurrent || hasValue
            let isSelected = viewModel.isSelected(field, column: column)
            Button {
                viewModel.selectField(field, column: column)
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(
                        systemName: isSelected
                            ? "largecircle.fill.circle"
                            : (selectable ? "circle" : "minus.circle")
                    )
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.5))
                    .font(.callout)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(column.title)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Group {
                            if field == "description", hasValue {
                                Text(viewModel.renderedDescription(value))
                            } else {
                                Text(hasValue ? value : (isCurrent ? "(empty)" : "(none)"))
                            }
                        }
                        .font(.callout)
                        .foregroundStyle(hasValue ? .primary : .tertiary)
                        .lineLimit(viewModel.isExpanded(field) ? nil : 3)
                        .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(
                            isSelected
                                ? Color.accentColor.opacity(0.10) : Color.secondary.opacity(0.05)
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(
                            isSelected ? Color.accentColor.opacity(0.5) : Color.clear,
                            lineWidth: 1,
                        )
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!selectable)
        }
    }

    private func compactUnavailableRow(
        _ column: UnifiedMetadataImportViewModel.Column
    ) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "minus.circle")
                .foregroundStyle(.tertiary)
                .font(.callout)
            VStack(alignment: .leading, spacing: 2) {
                Text(column.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(noCandidateHint(column))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.03)))
    }

    private var compactTagsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Genres & Tags").font(.callout.weight(.semibold))
            ForEach(viewModel.visibleColumns) { column in
                compactTagRow(column)
            }
        }
    }

    @ViewBuilder
    private func compactTagRow(_ column: UnifiedMetadataImportViewModel.Column) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            compactUnavailableRow(column)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(column.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                tagCellContent(column: column)
            }
        }
    }

    private var columnHeaderRow: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("Field")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: labelWidth, alignment: .leading)
            ForEach(viewModel.visibleColumns) { column in
                VStack(alignment: .leading, spacing: 2) {
                    Text(column.title).font(.caption.weight(.semibold))
                    if viewModel.hasCandidate(column) {
                        Button("Select all") { viewModel.selectAll(column: column) }
                            .font(.caption2)
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.accentColor)
                    } else {
                        Text(noCandidateHint(column))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func scalarRow(_ field: String) -> some View {
        let expandable = isFieldExpandable(field)
        let label = UnifiedMetadataImportViewModel.fieldLabels[field] ?? field
        return HStack(alignment: .top, spacing: 8) {
            Group {
                if expandable {
                    Button {
                        viewModel.toggleExpanded(field)
                    } label: {
                        HStack(spacing: 4) {
                            Text(label).font(.callout.weight(.medium))
                            Image(
                                systemName: viewModel.isExpanded(field)
                                    ? "chevron.up" : "chevron.down"
                            )
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help(viewModel.isExpanded(field) ? "Collapse" : "Expand")
                } else {
                    Text(label).font(.callout.weight(.medium))
                }
            }
            .frame(width: labelWidth, alignment: .leading)

            ForEach(viewModel.visibleColumns) { column in
                scalarCell(field: field, column: column)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func scalarCell(
        field: String,
        column: UnifiedMetadataImportViewModel.Column,
    ) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            noCandidateCell
        } else {
            selectableScalarCell(field: field, column: column)
        }
    }

    private var noCandidateCell: some View {
        Text("—")
            .font(.callout)
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
    }

    private func selectableScalarCell(
        field: String,
        column: UnifiedMetadataImportViewModel.Column,
    ) -> some View {
        let value = viewModel.value(field, from: column)
        let hasValue = !value.isEmpty
        let isCurrent = column == .current
        let selectable = isCurrent || hasValue
        let isSelected = viewModel.isSelected(field, column: column)
        return Button {
            viewModel.selectField(field, column: column)
        } label: {
            HStack(alignment: .top, spacing: 6) {
                Image(
                    systemName: isSelected
                        ? "largecircle.fill.circle"
                        : (selectable ? "circle" : "minus.circle")
                )
                .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.5))
                .font(.callout)
                Group {
                    if field == "description", hasValue {
                        Text(viewModel.renderedDescription(value))
                    } else {
                        Text(hasValue ? value : (isCurrent ? "(empty)" : "(none)"))
                    }
                }
                .font(.callout)
                .foregroundStyle(hasValue ? .primary : .tertiary)
                .lineLimit(viewModel.isExpanded(field) ? nil : 3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(
                        isSelected ? Color.accentColor.opacity(0.10) : Color.secondary.opacity(0.05)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(
                        isSelected ? Color.accentColor.opacity(0.5) : Color.clear,
                        lineWidth: 1,
                    )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!selectable)
    }

    private var identifiersRow: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("Identifiers")
                .font(.callout.weight(.medium))
                .frame(width: labelWidth, alignment: .leading)
            ForEach(viewModel.visibleColumns) { column in
                identifierCell(column: column)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func identifierCell(column: UnifiedMetadataImportViewModel.Column) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            noCandidateCell
        } else {
            identifierCellContent(column: column)
        }
    }

    private func identifierCellContent(
        column: UnifiedMetadataImportViewModel.Column
    ) -> some View {
        let entries = viewModel.identifierEntries(for: column)
        var scopeOrder: [String] = []
        var entriesByScope: [String: [UnifiedMetadataImportViewModel.IdentifierEntry]] = [:]
        for entry in entries {
            if entriesByScope[entry.scopeLabel] == nil {
                scopeOrder.append(entry.scopeLabel)
            }
            entriesByScope[entry.scopeLabel, default: []].append(entry)
        }

        return Group {
            if entries.isEmpty {
                Text("(none)")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, minHeight: 24, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(scopeOrder, id: \.self) { scopeLabel in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(scopeLabel)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                            ForEach(entriesByScope[scopeLabel] ?? []) { entry in
                                identifierBubble(entry)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.05)))
    }

    private func identifierBubble(
        _ entry: UnifiedMetadataImportViewModel.IdentifierEntry
    ) -> some View {
        let isSelected = viewModel.isIdentifierSelected(entry.key)
        return Button {
            viewModel.toggleIdentifier(entry.key)
        } label: {
            Text(entry.label)
                .font(.caption)
                .foregroundStyle(isSelected ? Color.white : Color.primary)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background {
                    RoundedRectangle(cornerRadius: 7)
                        .fill(
                            isSelected
                                ? Color.accentColor.opacity(0.88)
                                : Color.secondary.opacity(0.10)
                        )
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(
                            isSelected
                                ? Color.white.opacity(0.35) : Color.secondary.opacity(0.28),
                            lineWidth: isSelected ? 1.0 : 0.75,
                        )
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var compactIdentifiersCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Identifiers").font(.callout.weight(.semibold))
            ForEach(viewModel.visibleColumns) { column in
                compactIdentifierRow(column)
            }
        }
    }

    @ViewBuilder
    private func compactIdentifierRow(
        _ column: UnifiedMetadataImportViewModel.Column
    ) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            compactUnavailableRow(column)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(column.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                identifierCellContent(column: column)
            }
        }
    }

    private var tagsRow: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("Genres & Tags")
                .font(.callout.weight(.medium))
                .frame(width: labelWidth, alignment: .leading)
            ForEach(viewModel.visibleColumns) { column in
                tagCell(column: column)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func tagCell(column: UnifiedMetadataImportViewModel.Column) -> some View {
        if column != .current, !viewModel.hasCandidate(column) {
            noCandidateCell
        } else {
            tagCellContent(column: column)
        }
    }

    private func tagCellContent(column: UnifiedMetadataImportViewModel.Column) -> some View {
        let tags = viewModel.tags(for: column)
        return ZStack(alignment: .topTrailing) {
            if tags.isEmpty {
                Text("(none)")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, minHeight: 24, alignment: .leading)
            } else {
                PillFlowLayout {
                    ForEach(tags, id: \.self) { tag in
                        Button {
                            viewModel.toggleTag(tag)
                        } label: {
                            Text(tag).metadataImportTagPill(
                                isSelected: viewModel.isTagSelected(tag)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 14)

                Image(
                    systemName: viewModel.allTagsSelected(in: column)
                        ? "checkmark.circle.fill" : "plus.circle"
                )
                .font(.caption2)
                .foregroundStyle(.secondary.opacity(0.45))
                .help("Select or clear all tags in this cell")
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.05)))
        .contentShape(Rectangle())
        .onTapGesture { viewModel.toggleAllTags(in: column) }
    }

    private var bottomBar: some View {
        HStack(spacing: 12) {
            Text("\(viewModel.changedCount) field(s) will change")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Cancel", role: .cancel) { dismiss() }
                .keyboardShortcut(.cancelAction)
            Button("Import") { performImport() }
                .keyboardShortcut(.defaultAction)
                .disabled(viewModel.changedCount == 0)
        }
        .padding(12)
    }

    private func performImport() {
        onImport(
            viewModel.buildImports(),
            viewModel.selectedFieldIds(),
            viewModel.identifierChanges(),
        )
        dismiss()
    }

    private func noCandidateHint(_ column: UnifiedMetadataImportViewModel.Column) -> String {
        column == .hardcover ? "Select a match first" : "Select a result first"
    }

    private func isFieldExpandable(_ field: String) -> Bool {
        UnifiedMetadataImportViewModel.Column.allCases.contains {
            viewModel.value(field, from: $0).count > 90
        }
    }

    private func searchButton(isBusy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if isBusy {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "magnifyingglass")
            }
        }
    }

    private func pickerMessage(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
    }

    private func coverThumb(_ url: String?) -> some View {
        Group {
            if let url, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { image in
                    image.resizable().aspectRatio(contentMode: .fit)
                } placeholder: {
                    Color.secondary.opacity(0.12)
                }
            } else {
                Color.secondary.opacity(0.12)
            }
        }
        .frame(width: 48, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func editionYear(_ edition: BookEditionCandidate) -> String? {
        guard let raw = edition.releaseDate, raw.count >= 4 else { return nil }
        return String(raw.prefix(4))
    }
}
#endif
