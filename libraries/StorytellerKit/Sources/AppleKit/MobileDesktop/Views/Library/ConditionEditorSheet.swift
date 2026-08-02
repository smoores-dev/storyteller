#if os(macOS)
import SwiftUI

struct ConditionEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    @Environment(MediaViewModel.self) private var mediaViewModel

    let conditionType: ShelfConditionType
    let onAdd: ([ShelfCondition]) -> Void

    @State private var ratingMode: RatingMode = .single
    @State private var ratingComparison: NumericComparison = .greaterThanOrEqual
    @State private var ratingValue = 3
    @State private var ratingRangeLow = 2
    @State private var ratingRangeHigh = 4

    @State private var yearTab: YearTab = .beforeAfter
    @State private var yearCompareMode: YearCompareMode = .single
    @State private var yearComparison: YearComparison = .newerThan
    @State private var selectedYear = 0
    @State private var yearRangeLow = 0
    @State private var yearRangeHigh = 0

    @State private var inclusionMode: InclusionMode = .include
    @State private var selectedItems: Set<String> = []
    @State private var searchText = ""
    @State private var presenceMode: PresenceMode = .selectSpecific

    @State private var numericMode: RatingMode = .single
    @State private var numericComparison: NumericComparison = .greaterThanOrEqual
    @State private var numericValue = 0
    @State private var numericRangeLow = 0
    @State private var numericRangeHigh = 0

    @State private var dateComparison: YearComparison = .newerThan
    @State private var selectedDate = Date()

    private enum PresenceMode: String, CaseIterable, Hashable {
        case selectSpecific = "Select Specific"
        case anyPresent = "Any Present"
        case nonePresent = "None Present"
    }

    private enum RatingMode: String, CaseIterable, Hashable {
        case single = "Single"
        case range = "Range"
    }

    private enum YearTab: String, CaseIterable, Hashable {
        case beforeAfter = "Before / After"
        case specificYears = "Specific Years"
    }

    private enum YearCompareMode: String, CaseIterable, Hashable {
        case single = "Single"
        case range = "Range"
    }

    init(
        conditionType: ShelfConditionType,
        onAdd: @escaping ([ShelfCondition]) -> Void,
    ) {
        self.conditionType = conditionType
        self.onAdd = onAdd
    }

    private var availableValues: [ShelfConditionType: [String]] {
        let books = mediaViewModel.library.bookMetaData
        var tagSet = Set<String>()
        var seriesSet = Set<String>()
        var authorSet = Set<String>()
        var narratorSet = Set<String>()
        var translatorSet = Set<String>()
        var yearSet = Set<String>()
        var languageSet = Set<String>()
        var collectionSet = Set<String>()
        var sourceSet = Set<String>()
        var alignedWithSet = Set<String>()
        var alignedVersionSet = Set<String>()

        for book in books {
            for tag in book.tagNames { tagSet.insert(tag) }
            for s in book.series ?? [] { seriesSet.insert(s.name) }
            for a in book.authors ?? [] { if let n = a.name { authorSet.insert(n) } }
            for n in book.narrators ?? [] { if let name = n.name { narratorSet.insert(name) } }
            for c in book.creators ?? [] where c.role == "trl" {
                if let n = c.name { translatorSet.insert(n) }
            }
            let year = book.sortablePublicationYear
            if !year.isEmpty { yearSet.insert(year) }
            if let language = book.language, !language.isEmpty { languageSet.insert(language) }
            for collection in book.collections ?? [] { collectionSet.insert(collection.name) }
            if let source = book.source, !source.isEmpty { sourceSet.insert(source) }
            if let alignedWith = book.alignedWith, !alignedWith.isEmpty {
                alignedWithSet.insert(alignedWith)
            }
            if let version = book.alignedByStorytellerVersion, !version.isEmpty {
                alignedVersionSet.insert(version)
            }
        }

        return [
            .tag: tagSet.sorted(),
            .series: seriesSet.sorted(),
            .author: authorSet.sorted(),
            .narrator: narratorSet.sorted(),
            .translator: translatorSet.sorted(),
            .publicationYear: yearSet.sorted(),
            .language: languageSet.sorted(),
            .collection: collectionSet.sorted(),
            .source: sourceSet.sorted(),
            .alignedWith: alignedWithSet.sorted(),
            .alignedVersion: alignedVersionSet.sorted(),
        ]
    }

    private var availableStatuses: [String] {
        var statusSet = Set<String>()
        for book in mediaViewModel.library.bookMetaData {
            if let name = book.status?.name { statusSet.insert(name) }
        }
        return statusSet.sorted()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Add \(conditionType.label) Condition")
                    .font(.headline)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .imageScale(.large)
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            editorContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            Button {
                if let conditions = buildConditions() {
                    onAdd(conditions)
                    dismiss()
                }
            } label: {
                Text("Add Condition")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canAdd)
            .padding()
        }
        .frame(minWidth: 400, minHeight: 450)
        .onAppear {
            debugLog("[ConditionEditorSheet] opened for \(conditionType.label)")
            debugLog(
                "[ConditionEditorSheet] vm=\(ObjectIdentifier(mediaViewModel)), isReady=\(mediaViewModel.isReady), libraryVersion=\(mediaViewModel.libraryVersion), bookMetaData.count=\(mediaViewModel.library.bookMetaData.count)"
            )

            let books = mediaViewModel.library.bookMetaData
            let booksWithAuthors = books.filter { !($0.authors?.isEmpty ?? true) }.count
            let booksWithNarrators = books.filter { !($0.narrators?.isEmpty ?? true) }.count
            let booksWithTags = books.filter { !$0.tagNames.isEmpty }.count
            debugLog(
                "[ConditionEditorSheet] books with metadata: authors=\(booksWithAuthors), narrators=\(booksWithNarrators), tags=\(booksWithTags)"
            )

            let values = availableValues
            debugLog(
                "[ConditionEditorSheet] computed values: authors=\(values[.author]?.count ?? 0), narrators=\(values[.narrator]?.count ?? 0), tags=\(values[.tag]?.count ?? 0), series=\(values[.series]?.count ?? 0)"
            )

            if conditionType == .publicationYear {
                let years = (values[.publicationYear] ?? []).compactMap { Int($0) }.sorted()
                selectedYear = years.last ?? 0
                yearRangeLow = years.first ?? 0
                yearRangeHigh = years.last ?? 0
            }
        }
    }

    @ViewBuilder
    private var editorContent: some View {
        switch conditionType {
            case .format:
                let basicFormats: [FormatCondition] = [.ebook, .audiobook, .readaloud]
                multiSelectEditor(
                    items: basicFormats.map(\.label),
                    itemLabel: "Formats",
                    searchable: false,
                )
            case .status:
                multiSelectEditor(
                    items: availableStatuses,
                    itemLabel: "Statuses",
                    searchable: availableStatuses.count > 5,
                )
            case .location:
                multiSelectEditor(
                    items: LocationCondition.allCases.map(\.label),
                    itemLabel: "Locations",
                    searchable: false,
                )
            case .progress:
                multiSelectEditor(
                    items: ProgressCondition.allCases.map(\.label),
                    itemLabel: "Progress States",
                    searchable: false,
                )
            case .rating:
                ratingEditor
            case .publicationYear:
                publicationYearEditor
            case .tag:
                multiSelectEditor(
                    items: availableValues[.tag] ?? [],
                    itemLabel: "Tags",
                    supportsPresence: true,
                )
            case .series:
                multiSelectEditor(
                    items: availableValues[.series] ?? [],
                    itemLabel: "Series",
                    supportsPresence: true,
                )
            case .author:
                multiSelectEditor(
                    items: availableValues[.author] ?? [],
                    itemLabel: "Authors",
                    supportsPresence: true,
                )
            case .narrator:
                multiSelectEditor(
                    items: availableValues[.narrator] ?? [],
                    itemLabel: "Narrators",
                    supportsPresence: true,
                )
            case .translator:
                multiSelectEditor(
                    items: availableValues[.translator] ?? [],
                    itemLabel: "Translators",
                    supportsPresence: true,
                )
            case .language:
                multiSelectEditor(items: availableValues[.language] ?? [], itemLabel: "Languages")
            case .collection:
                multiSelectEditor(
                    items: availableValues[.collection] ?? [],
                    itemLabel: "Collections",
                )
            case .source:
                multiSelectEditor(items: availableValues[.source] ?? [], itemLabel: "Sources")
            case .alignedWith:
                multiSelectEditor(
                    items: availableValues[.alignedWith] ?? [],
                    itemLabel: "Alignment Engines",
                )
            case .alignedVersion:
                multiSelectEditor(
                    items: availableValues[.alignedVersion] ?? [],
                    itemLabel: "Alignment Versions",
                )
            case .pages:
                numericEditor(unitLabel: "pages")
            case .duration:
                numericEditor(unitLabel: "minutes")
            case .fileSize:
                numericEditor(unitLabel: "MB")
            case .dateAdded, .dateRead, .alignedAt:
                dateEditor
            case .boolean:
                EmptyView()
        }
    }

    @ViewBuilder
    private var ratingEditor: some View {
        VStack(spacing: 0) {
            Picker("Presence", selection: $presenceMode) {
                ForEach(PresenceMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding()

            if presenceMode == .anyPresent {
                Text("Matches books with any rating")
                    .foregroundStyle(.secondary)
                    .font(.callout)
                    .padding()
                Spacer()
            } else if presenceMode == .nonePresent {
                Text("Matches books with no rating")
                    .foregroundStyle(.secondary)
                    .font(.callout)
                    .padding()
                Spacer()
            } else {
                Divider()

                VStack(spacing: 20) {
                    Picker("Mode", selection: $ratingMode) {
                        ForEach(RatingMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .padding(.horizontal)

                    Spacer()

                    if ratingMode == .single {
                        singleRatingEditor
                    } else {
                        rangeRatingEditor
                    }

                    Spacer()
                }
                .padding(.top)
            }
        }
    }

    private var singleRatingEditor: some View {
        VStack(spacing: 16) {
            Picker("Comparison", selection: $ratingComparison) {
                ForEach(NumericComparison.allCases) { comp in
                    Text(comp.label).tag(comp)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 300)

            Stepper(value: $ratingValue, in: 1...5) {
                starsView(count: ratingValue)
            }
            .frame(maxWidth: 200)

            Text(
                verbatim:
                    "User Rating \(ratingComparison.symbol) \(ratingValue) star\(ratingValue == 1 ? "" : "s")"
            )
            .foregroundStyle(.secondary)
            .font(.callout)
        }
    }

    private var rangeRatingEditor: some View {
        VStack(spacing: 16) {
            HStack {
                Text("From")
                    .frame(width: 40, alignment: .leading)
                Stepper(value: $ratingRangeLow, in: 1...5) {
                    starsView(count: ratingRangeLow)
                }
            }
            .frame(maxWidth: 250)

            HStack {
                Text("To")
                    .frame(width: 40, alignment: .leading)
                Stepper(value: $ratingRangeHigh, in: 1...5) {
                    starsView(count: ratingRangeHigh)
                }
            }
            .frame(maxWidth: 250)

            if ratingRangeLow < ratingRangeHigh {
                Text(verbatim: "User Rating between \(ratingRangeLow) and \(ratingRangeHigh) stars")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            } else {
                Text("'From' must be less than 'To'")
                    .foregroundStyle(.red)
                    .font(.callout)
            }
        }
    }

    private func starsView(count: Int) -> some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: star <= count ? "star.fill" : "star")
                    .foregroundStyle(star <= count ? .yellow : .secondary)
            }
        }
    }

    @ViewBuilder
    private func numericEditor(unitLabel: String) -> some View {
        VStack(spacing: 20) {
            Picker("Mode", selection: $numericMode) {
                ForEach(RatingMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal)

            Spacer()

            if numericMode == .single {
                VStack(spacing: 16) {
                    Picker("Comparison", selection: $numericComparison) {
                        ForEach(NumericComparison.allCases) { comp in
                            Text(comp.label).tag(comp)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(maxWidth: 300)

                    numericField(value: $numericValue, unitLabel: unitLabel)

                    Text(verbatim: "\(numericComparison.symbol) \(numericValue) \(unitLabel)")
                        .foregroundStyle(.secondary)
                        .font(.callout)
                }
            } else {
                VStack(spacing: 16) {
                    HStack {
                        Text("From").frame(width: 48, alignment: .leading)
                        numericField(value: $numericRangeLow, unitLabel: unitLabel)
                    }
                    HStack {
                        Text("To").frame(width: 48, alignment: .leading)
                        numericField(value: $numericRangeHigh, unitLabel: unitLabel)
                    }
                    if numericRangeLow < numericRangeHigh {
                        Text(
                            verbatim:
                                "Between \(numericRangeLow) and \(numericRangeHigh) \(unitLabel)"
                        )
                        .foregroundStyle(.secondary)
                        .font(.callout)
                    } else {
                        Text("'From' must be less than 'To'")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }
            }

            Spacer()
        }
        .padding(.top)
    }

    private func numericField(value: Binding<Int>, unitLabel: String) -> some View {
        HStack(spacing: 8) {
            TextField(unitLabel, value: value, format: .number)
                .textFieldStyle(.roundedBorder)
                .frame(width: 120)
                .multilineTextAlignment(.trailing)
            Stepper("", value: value, in: 0...Int.max)
                .labelsHidden()
            Text(unitLabel).foregroundStyle(.secondary)
        }
    }

    private var dateEditor: some View {
        VStack(spacing: 20) {
            Picker("Comparison", selection: $dateComparison) {
                ForEach(YearComparison.allCases) { comp in
                    Text(comp.label).tag(comp)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 350)
            .padding(.horizontal)

            Spacer()

            DatePicker(
                "Date",
                selection: $selectedDate,
                displayedComponents: .date,
            )
            .datePickerStyle(.graphical)
            .labelsHidden()
            .frame(maxWidth: 320)

            Spacer()
        }
        .padding(.top)
    }

    @ViewBuilder
    private var publicationYearEditor: some View {
        let yearStrings = availableValues[.publicationYear] ?? []
        let years = yearStrings.compactMap { Int($0) }.sorted(by: >)

        VStack(spacing: 0) {
            Picker("Presence", selection: $presenceMode) {
                ForEach(PresenceMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding()

            if presenceMode == .anyPresent {
                Text("Matches books with any publication year")
                    .foregroundStyle(.secondary)
                    .font(.callout)
                    .padding()
                Spacer()
            } else if presenceMode == .nonePresent {
                Text("Matches books with no publication year")
                    .foregroundStyle(.secondary)
                    .font(.callout)
                    .padding()
                Spacer()
            } else {
                Divider()

                Picker("Tab", selection: $yearTab) {
                    ForEach(YearTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding()

                if yearTab == .beforeAfter {
                    yearCompareEditor(years: years)
                } else {
                    yearSpecificEditor(yearStrings: yearStrings)
                }
            }
        }
    }

    @ViewBuilder
    private func yearCompareEditor(years: [Int]) -> some View {
        VStack(spacing: 16) {
            Picker("Mode", selection: $yearCompareMode) {
                ForEach(YearCompareMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal)

            Spacer()

            if years.isEmpty {
                Text("No publication years available")
                    .foregroundStyle(.secondary)
            } else if yearCompareMode == .single {
                yearCompareSingleEditor(years: years)
            } else {
                yearCompareRangeEditor(years: years)
            }

            Spacer()
        }
    }

    private func yearCompareSingleEditor(years: [Int]) -> some View {
        VStack(spacing: 16) {
            Picker("Comparison", selection: $yearComparison) {
                ForEach(YearComparison.allCases) { comp in
                    Text(comp.label).tag(comp)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 350)

            Picker("Year", selection: $selectedYear) {
                ForEach(years, id: \.self) { year in
                    Text(verbatim: "\(year)").tag(year)
                }
            }
            .labelsHidden()
            .frame(maxWidth: 200)

            Text(verbatim: "Year \(yearComparison.label.lowercased()) \(selectedYear)")
                .foregroundStyle(.secondary)
                .font(.callout)
        }
    }

    private func yearCompareRangeEditor(years: [Int]) -> some View {
        VStack(spacing: 16) {
            HStack {
                Text("From")
                Picker("From", selection: $yearRangeLow) {
                    ForEach(years, id: \.self) { year in
                        Text(verbatim: "\(year)").tag(year)
                    }
                }
                .labelsHidden()
            }
            .frame(maxWidth: 200)

            HStack {
                Text("To")
                Picker("To", selection: $yearRangeHigh) {
                    ForEach(years, id: \.self) { year in
                        Text(verbatim: "\(year)").tag(year)
                    }
                }
                .labelsHidden()
            }
            .frame(maxWidth: 200)

            if yearRangeLow <= yearRangeHigh {
                Text(verbatim: "Years from \(yearRangeLow) to \(yearRangeHigh)")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            } else {
                Text("'From' must not be greater than 'To'")
                    .foregroundStyle(.red)
                    .font(.callout)
            }
        }
    }

    @ViewBuilder
    private func yearSpecificEditor(yearStrings: [String]) -> some View {
        VStack(spacing: 0) {
            Picker("Mode", selection: $inclusionMode) {
                ForEach(InclusionMode.allCases) { mode in
                    Text(mode.label.capitalized).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding()

            if yearStrings.isEmpty {
                ContentUnavailableView {
                    Label("No Years", systemImage: "calendar")
                } description: {
                    Text("No publication years available in your library.")
                }
            } else {
                searchableList(items: yearStrings, prompt: "Filter years")
            }
        }
    }

    @ViewBuilder
    private func multiSelectEditor(
        items: [String],
        itemLabel: String,
        supportsPresence: Bool = false,
        searchable: Bool = true,
    ) -> some View {
        VStack(spacing: 0) {
            if supportsPresence {
                Picker("Presence", selection: $presenceMode) {
                    ForEach(PresenceMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding()

                if presenceMode == .anyPresent {
                    Text("Matches books with any \(conditionType.label.lowercased())")
                        .foregroundStyle(.secondary)
                        .font(.callout)
                        .padding()
                    Spacer()
                } else if presenceMode == .nonePresent {
                    Text("Matches books with no \(conditionType.label.lowercased())")
                        .foregroundStyle(.secondary)
                        .font(.callout)
                        .padding()
                    Spacer()
                }
            }

            if !supportsPresence || presenceMode == .selectSpecific {
                if supportsPresence {
                    Divider()
                }

                Picker("Mode", selection: $inclusionMode) {
                    ForEach(InclusionMode.allCases) { mode in
                        Text(mode.label.capitalized).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding()

                if items.isEmpty {
                    ContentUnavailableView {
                        Label("No \(itemLabel)", systemImage: conditionType.systemImage)
                    } description: {
                        Text("No \(itemLabel.lowercased()) available in your library.")
                    }
                } else {
                    searchableList(
                        items: items,
                        prompt: "Filter \(itemLabel.lowercased())",
                        searchable: searchable,
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func searchableList(items: [String], prompt: String, searchable: Bool = true)
        -> some View
    {
        if searchable {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField(prompt, text: $searchText)
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.secondary.opacity(0.1))
            )
            .padding(.horizontal)
            .padding(.bottom, 8)
        }

        let filtered =
            searchable && !searchText.isEmpty
            ? items.filter { $0.localizedCaseInsensitiveContains(searchText) }
            : items

        List(filtered, id: \.self) { item in
            HStack {
                Text(item)
                Spacer()
                if selectedItems.contains(item) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if selectedItems.contains(item) {
                    selectedItems.remove(item)
                } else {
                    selectedItems.insert(item)
                }
            }
        }
        .listStyle(.plain)

        if !selectedItems.isEmpty {
            HStack {
                Text("\(selectedItems.count) selected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Clear") {
                    selectedItems.removeAll()
                }
                .font(.caption)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private var canAdd: Bool {
        switch conditionType {
            case .format, .status, .location, .progress:
                return !selectedItems.isEmpty
            case .rating:
                if presenceMode != .selectSpecific { return true }
                return ratingMode == .single || ratingRangeLow < ratingRangeHigh
            case .publicationYear:
                if presenceMode != .selectSpecific { return true }
                if yearTab == .beforeAfter {
                    let hasYears = !(availableValues[.publicationYear] ?? []).isEmpty
                    if !hasYears { return false }
                    return yearCompareMode == .single || yearRangeLow <= yearRangeHigh
                }
                return !selectedItems.isEmpty
            case .tag, .series, .author, .narrator, .translator:
                return presenceMode != .selectSpecific || !selectedItems.isEmpty
            case .language, .collection, .source, .alignedWith, .alignedVersion:
                return !selectedItems.isEmpty
            case .pages, .duration, .fileSize:
                return numericMode == .single || numericRangeLow < numericRangeHigh
            case .dateAdded, .dateRead, .alignedAt:
                return true
            case .boolean:
                return false
        }
    }

    private func buildConditions() -> [ShelfCondition]? {
        guard canAdd else { return nil }
        switch conditionType {
            case .format:
                let basicFormats: [FormatCondition] = [.ebook, .audiobook, .readaloud]
                let conditions = basicFormats.filter { selectedItems.contains($0.label) }
                return [.format(mode: inclusionMode, conditions: conditions)]
            case .status:
                return [.status(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .location:
                let conditions = LocationCondition.allCases.filter {
                    selectedItems.contains($0.label)
                }
                return [.location(mode: inclusionMode, conditions: conditions)]
            case .progress:
                let conditions = ProgressCondition.allCases.filter {
                    selectedItems.contains($0.label)
                }
                return [.progress(mode: inclusionMode, conditions: conditions)]
            case .rating:
                if presenceMode == .anyPresent { return [.hasRating] }
                if presenceMode == .nonePresent { return [.noRating] }
                if ratingMode == .single {
                    return [.rating(comparison: ratingComparison, value: ratingValue)]
                }
                return [
                    .rating(comparison: .greaterThanOrEqual, value: ratingRangeLow),
                    .rating(comparison: .lessThanOrEqual, value: ratingRangeHigh),
                ]
            case .publicationYear:
                if presenceMode == .anyPresent { return [.hasPublicationYear] }
                if presenceMode == .nonePresent { return [.noPublicationYear] }
                if yearTab == .beforeAfter {
                    if yearCompareMode == .single {
                        return [
                            .publicationYearComparison(
                                comparison: yearComparison,
                                value: selectedYear,
                            )
                        ]
                    }
                    return [
                        .publicationYearComparison(
                            comparison: .newerThan,
                            value: yearRangeLow - 1,
                        ),
                        .publicationYearComparison(
                            comparison: .olderThan,
                            value: yearRangeHigh + 1,
                        ),
                    ]
                }
                return [
                    .publicationYear(mode: inclusionMode, values: Array(selectedItems).sorted())
                ]
            case .tag:
                if presenceMode == .anyPresent { return [.hasTag] }
                if presenceMode == .nonePresent { return [.noTag] }
                return [.tag(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .series:
                if presenceMode == .anyPresent { return [.hasSeries] }
                if presenceMode == .nonePresent { return [.noSeries] }
                return [.series(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .author:
                if presenceMode == .anyPresent { return [.hasAuthor] }
                if presenceMode == .nonePresent { return [.noAuthor] }
                return [.author(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .narrator:
                if presenceMode == .anyPresent { return [.hasNarrator] }
                if presenceMode == .nonePresent { return [.noNarrator] }
                return [.narrator(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .translator:
                if presenceMode == .anyPresent { return [.hasTranslator] }
                if presenceMode == .nonePresent { return [.noTranslator] }
                return [.translator(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .language:
                return [.language(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .collection:
                return [.collection(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .source:
                return [.source(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .alignedWith:
                return [.alignedWith(mode: inclusionMode, values: Array(selectedItems).sorted())]
            case .alignedVersion:
                return [
                    .alignedVersion(mode: inclusionMode, values: Array(selectedItems).sorted())
                ]
            case .pages:
                return numericConditions { .pages(comparison: $0, value: $1) }
            case .duration:
                return numericConditions { .duration(comparison: $0, value: $1 * 60) }
            case .fileSize:
                return numericConditions { .fileSize(comparison: $0, value: $1 * 1024 * 1024) }
            case .dateAdded:
                return [.dateAddedComparison(comparison: dateComparison, value: selectedDate)]
            case .dateRead:
                return [.dateReadComparison(comparison: dateComparison, value: selectedDate)]
            case .alignedAt:
                return [.alignedAtComparison(comparison: dateComparison, value: selectedDate)]
            case .boolean:
                return nil
        }
    }

    /// Builds one comparison condition (single mode) or a low/high pair (range mode) from the
    /// numeric editor state. `make` receives the friendly-unit value; callers convert to the
    /// canonical unit they store (seconds / bytes).
    private func numericConditions(
        _ make: (NumericComparison, Int) -> ShelfCondition
    ) -> [ShelfCondition] {
        if numericMode == .single {
            return [make(numericComparison, numericValue)]
        }
        return [
            make(.greaterThanOrEqual, numericRangeLow),
            make(.lessThanOrEqual, numericRangeHigh),
        ]
    }
}
#endif
