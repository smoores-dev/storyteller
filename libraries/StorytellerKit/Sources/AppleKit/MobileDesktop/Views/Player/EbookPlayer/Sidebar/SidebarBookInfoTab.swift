#if os(macOS)
import SwiftUI

struct SidebarBookInfoTab: View {
    let viewModel: EbookPlayerViewModel
    let theme: EbookSidebarTheme

    @AppStorage("EbookPlayerSidebarDescriptionExpanded")
    private var isDescriptionExpanded = false

    @State private var attributedDescription: AttributedString?

    private var metadata: BookMetadata? {
        viewModel.bookData?.metadata
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerSection

                descriptionSection

                if let metadata {
                    section("Publication", rows: publicationRows(metadata))
                    section("Book", rows: bookRows(metadata))
                    section("Library", rows: libraryRows(metadata))
                }
            }
            .padding(16)
        }
        .task(id: metadata?.description) {
            attributedDescription = nil
            guard let raw = metadata?.description, !raw.isEmpty else { return }
            attributedDescription = await Task.detached(priority: .userInitiated) {
                BookDescriptionText.attributed(from: raw)
            }.value
        }
    }

    @ViewBuilder
    private var descriptionSection: some View {
        if let attributedDescription {
            VStack(alignment: .leading, spacing: 6) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isDescriptionExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text("DESCRIPTION")
                            .font(.caption.weight(.semibold))
                            .kerning(0.8)
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .rotationEffect(.degrees(isDescriptionExpanded ? 90 : 0))
                        Spacer()
                    }
                    .foregroundStyle(theme.tertiary)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Text(attributedDescription)
                    .font(.callout)
                    .foregroundStyle(theme.foreground)
                    .lineLimit(isDescriptionExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
    }

    private var headerSection: some View {
        HStack(alignment: .top, spacing: 14) {
            Group {
                if let cover = viewModel.bookData?.ebookCoverArt ?? viewModel.bookData?.coverArt {
                    cover
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(theme.foreground.opacity(0.1))
                        .overlay(
                            Image(systemName: "book.closed")
                                .foregroundStyle(theme.tertiary)
                        )
                }
            }
            .frame(width: 84, height: 120)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                Text(metadata?.title ?? "Untitled")
                    .font(.headline)
                    .foregroundStyle(theme.foreground)
                    .lineLimit(3)

                if let author = metadata?.authors?.first?.name {
                    Text(author)
                        .font(.subheadline)
                        .foregroundStyle(theme.secondary)
                }

                progressSection
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var progressSection: some View {
        let fraction = normalizedFraction(viewModel.progressManager?.bookFraction)
        let remaining = viewModel.mediaOverlayManager?.bookTimeRemaining
        return VStack(alignment: .leading, spacing: 4) {
            ProgressView(value: fraction ?? 0)
                .progressViewStyle(.linear)
                .tint(theme.accent)

            Text(progressLabel(fraction: fraction, remaining: remaining))
                .font(.caption)
                .foregroundStyle(theme.secondary)
        }
        .padding(.top, 4)
    }

    private func progressLabel(fraction: Double?, remaining: TimeInterval?) -> String {
        var parts: [String] = [formatPercent(fraction)]
        if let remaining, remaining.isFinite, remaining > 0 {
            parts.append("\(BookMetadata.formatDuration(seconds: Int(remaining))) left")
        }
        return parts.joined(separator: " - ")
    }

    private struct InfoRow: Identifiable {
        let label: String
        let value: String
        var id: String { label }
    }

    private func publicationRows(_ metadata: BookMetadata) -> [InfoRow] {
        var rows: [InfoRow] = []
        if let date = metadata.publicationDateValue {
            rows.append(InfoRow(
                label: "Published",
                value: date.formatted(date: .long, time: .omitted),
            ))
        }
        if let language = metadata.language, !language.isEmpty {
            let display = Locale.current.localizedString(forIdentifier: language) ?? language
            rows.append(InfoRow(label: "Language", value: display))
        }
        if let isbn = metadata.identifierList.first(where: { $0.kind == "isbn-13" })?.value
            ?? metadata.primaryIdentifier?.value
        {
            rows.append(InfoRow(label: "ISBN", value: isbn))
        }
        return rows
    }

    private func bookRows(_ metadata: BookMetadata) -> [InfoRow] {
        var rows: [InfoRow] = []
        if let series = metadata.series?.first {
            var value = series.name
            if let position = series.position {
                let formatted =
                    position.truncatingRemainder(dividingBy: 1) == 0
                    ? String(Int(position))
                    : String(position)
                value += ", book \(formatted)"
            }
            rows.append(InfoRow(label: "Series", value: value))
        }
        if !metadata.pagesDisplay.isEmpty {
            rows.append(InfoRow(label: "Pages", value: metadata.pagesDisplay))
        }
        let tags = metadata.tagNames
        if !tags.isEmpty {
            rows.append(InfoRow(label: "Genre", value: tags.prefix(3).joined(separator: ", ")))
        }
        if let narrator = metadata.narrators?.first?.name {
            var value = narrator
            if !metadata.durationDisplay.isEmpty {
                value += " - \(metadata.durationDisplay)"
            }
            rows.append(InfoRow(label: "Narrator", value: value))
        } else if !metadata.durationDisplay.isEmpty {
            rows.append(InfoRow(label: "Duration", value: metadata.durationDisplay))
        }
        return rows
    }

    private func libraryRows(_ metadata: BookMetadata) -> [InfoRow] {
        var rows: [InfoRow] = []
        if let added = metadata.createdAtValue {
            rows.append(InfoRow(
                label: "Added",
                value: added.formatted(date: .abbreviated, time: .omitted),
            ))
        }
        if let lastRead = metadata.lastReadValue {
            rows.append(InfoRow(
                label: "Last opened",
                value: lastRead.formatted(date: .abbreviated, time: .shortened),
            ))
        }
        var sourceParts: [String] = []
        if let source = metadata.source, !source.isEmpty {
            sourceParts.append(source)
        }
        if !metadata.fileSizeDisplay.isEmpty {
            sourceParts.append(metadata.fileSizeDisplay)
        }
        if !sourceParts.isEmpty {
            rows.append(InfoRow(label: "Source", value: sourceParts.joined(separator: " - ")))
        }
        if let collections = metadata.collections, !collections.isEmpty {
            rows.append(InfoRow(
                label: "Collections",
                value: collections.map(\.name).joined(separator: ", "),
            ))
        }
        if let status = metadata.status?.name, !status.isEmpty {
            rows.append(InfoRow(label: "Status", value: status))
        }
        return rows
    }

    @ViewBuilder
    private func section(_ title: String, rows: [InfoRow]) -> some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(title.uppercased())
                    .font(.caption.weight(.semibold))
                    .kerning(0.8)
                    .foregroundStyle(theme.tertiary)
                    .padding(.bottom, 2)

                ForEach(rows) { row in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(row.label)
                            .font(.callout)
                            .foregroundStyle(theme.secondary)
                            .frame(width: 92, alignment: .leading)
                        Text(row.value)
                            .font(.callout)
                            .foregroundStyle(theme.foreground)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}
#endif
