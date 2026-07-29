#if os(iOS) || os(macOS)
import SwiftUI

struct BookReportsView: View {
    #if os(iOS)
    @Binding var searchText: String
    @Binding var showSettings: Bool
    var showOfflineSheet: Binding<Bool>?
    #else
    let searchText: String
    #endif

    var body: some View {
        #if os(iOS)
        NavigationStack {
            BookReportsContent(searchText: searchText)
                .navigationTitle("Book Reports")
                .navigationBarTitleDisplayMode(.inline)
                .iOSLibraryToolbar(
                    showSettings: $showSettings,
                    showOfflineSheet: showOfflineSheet ?? .constant(false),
                )
                .searchable(
                    text: $searchText,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search",
                )
        }
        #else
        BookReportsContent(searchText: searchText)
            .navigationTitle("Book Reports")
        #endif
    }
}

#if os(iOS)
struct MoreBookReportsView: View {
    @Binding var searchText: String
    @Binding var showSettings: Bool
    @Binding var showOfflineSheet: Bool

    var body: some View {
        BookReportsContent(searchText: searchText)
            .navigationTitle("Book Reports")
            .navigationBarTitleDisplayMode(.inline)
            .iOSLibraryToolbar(showSettings: $showSettings, showOfflineSheet: $showOfflineSheet)
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search",
            )
    }
}
#endif

private struct BookReportsContent: View {
    let searchText: String

    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var selectedGrade: String?
    @State private var reportBook: BookMetadata?

    private var reportedBooks: [BookMetadata] {
        AlignmentGradeScale.booksWorstFirst(mediaViewModel.library.bookMetaData)
    }

    private var gradeFacets: [(grade: String, count: Int)] {
        var counts: [String: Int] = [:]
        for book in reportedBooks {
            guard let grade = book.alignmentSummary?.grade else { continue }
            counts[grade, default: 0] += 1
        }
        return AlignmentGradeScale.orderedFacets(from: counts)
    }

    private var filteredBooks: [BookMetadata] {
        var books = reportedBooks
        if let selectedGrade {
            books = books.filter { $0.alignmentSummary?.grade == selectedGrade }
        }
        if !searchText.isEmpty {
            let lower = searchText.lowercased()
            books = books.filter { $0.title.lowercased().contains(lower) }
        }
        return books
    }

    var body: some View {
        Group {
            if reportedBooks.isEmpty {
                ContentUnavailableView {
                    Label("No alignment reports", systemImage: "checkmark.seal")
                } description: {
                    Text(
                        "Books get a report when processed by a server that supports alignment quality."
                    )
                }
            } else {
                #if os(macOS)
                HStack(spacing: 0) {
                    gradeSidebar
                        .frame(width: 190)
                    Divider()
                    bookList
                }
                #else
                bookList
                #endif
            }
        }
        .sheet(item: $reportBook) { book in
            BookAlignmentReportScreen(book: book)
        }
    }

    private var bookList: some View {
        List {
            #if os(iOS)
            if !gradeFacets.isEmpty {
                Section {
                    gradeChips
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
            #endif
            Section {
                ForEach(filteredBooks) { book in
                    Button {
                        reportBook = book
                    } label: {
                        BookReportRow(book: book)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        #if os(macOS)
        .listStyle(.inset)
        #endif
    }

    #if os(macOS)
    private var gradeSidebar: some View {
        List(selection: $selectedGrade) {
            HStack {
                Text("All Graded")
                Spacer()
                Text("\(reportedBooks.count)")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .tag(String?.none)
            ForEach(gradeFacets, id: \.grade) { facet in
                HStack(spacing: 8) {
                    Circle()
                        .fill(AlignmentGradeScale.color(for: facet.grade))
                        .frame(width: 8, height: 8)
                    Text(facet.grade)
                    Spacer()
                    Text("\(facet.count)")
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .tag(String?.some(facet.grade))
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
    }
    #endif

    #if os(iOS)
    private var gradeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(gradeFacets, id: \.grade) { facet in
                    gradeChip(grade: facet.grade, count: facet.count)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
        }
    }
    #endif

    #if os(iOS)
    private func gradeChip(grade: String, count: Int) -> some View {
        let color = AlignmentGradeScale.color(for: grade)
        let isSelected = selectedGrade == grade
        return Button {
            selectedGrade = isSelected ? nil : grade
        } label: {
            HStack(spacing: 5) {
                Text(grade)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(color)
                Text("\(count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(isSelected ? 0.28 : 0.12), in: Capsule())
            .overlay {
                if isSelected {
                    Capsule().strokeBorder(color, lineWidth: 1)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
    #endif
}

private struct BookReportRow: View {
    let book: BookMetadata

    @Environment(MediaViewModel.self) private var mediaViewModel

    private var summary: AlignmentSummary? { book.alignmentSummary }

    var body: some View {
        HStack(spacing: 10) {
            BookReportCoverThumb(item: book)
            VStack(alignment: .leading, spacing: 2) {
                Text(book.title)
                    .font(.callout)
                    .lineLimit(1)
                if let author = book.authors?.first?.name, !author.isEmpty {
                    Text(author)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let summary {
                HStack(spacing: 10) {
                    statColumn(
                        value: "\(summary.missingSentences)",
                        label: "missing",
                    )
                    statColumn(
                        value: "\(summary.mutedChapters)",
                        label: "muted",
                    )
                    if let score = summary.score {
                        Text("\(score)%")
                            .font(.callout.weight(.medium))
                            .monospacedDigit()
                            .frame(minWidth: 42, alignment: .trailing)
                    }
                    GradePill(grade: summary.grade)
                        .frame(minWidth: 34)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func statColumn(value: String, label: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(value)
                .font(.caption.weight(.medium))
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 44, alignment: .trailing)
    }
}

private struct BookReportCoverThumb: View {
    let item: BookMetadata

    @Environment(MediaViewModel.self) private var mediaViewModel

    private let height: CGFloat = 46

    var body: some View {
        let variant = mediaViewModel.coverVariant(for: item)
        let coverState = mediaViewModel.coverState(for: item, variant: variant)
        ZStack {
            Color.secondary.opacity(0.2)
            if let image = coverState.image {
                image
                    .resizable()
                    .interpolation(.medium)
                    .scaledToFill()
            }
        }
        .frame(width: height * variant.preferredAspectRatio, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .task(id: "\(item.id)-\(variant)") {
            mediaViewModel.ensureCoverLoaded(
                for: item,
                variant: variant,
                debugSource: "BookReportRow",
            )
        }
    }
}

#endif
