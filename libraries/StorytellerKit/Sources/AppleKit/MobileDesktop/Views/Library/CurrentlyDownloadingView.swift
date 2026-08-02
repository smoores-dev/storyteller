#if os(iOS) || os(macOS)
import StorytellerKit
import SwiftUI

struct CurrentlyDownloadingView: View {
    @State private var downloads: [DownloadRecord] = []
    @State private var observerId: UUID?

    var body: some View {
        Group {
            if downloads.isEmpty {
                ContentUnavailableView(
                    "No Active Downloads",
                    systemImage: "arrow.down.circle",
                    description: Text(
                        "Downloads that are in progress, paused, or failed will appear here."
                    ),
                )
            } else {
                #if os(macOS)
                macOSTable
                #else
                iOSList
                #endif
            }
        }
        .navigationTitle("Downloading")
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            downloads = await DownloadManager.shared.incompleteDownloads

            observerId = await DownloadManager.shared.addObserver { records in
                Task { @MainActor in
                    downloads =
                        records
                        .filter { $0.isIncomplete }
                        .sorted { $0.createdAt < $1.createdAt }
                }
            }
        }
    }

    #if os(macOS)
    private var macOSTable: some View {
        Table(downloads) {
            TableColumn("Title") { record in
                Text(record.bookTitle)
                    .lineLimit(1)
            }
            .width(min: 120, ideal: 200)

            TableColumn("Type") { record in
                Text(categoryLabel(for: record))
                    .foregroundStyle(.secondary)
            }
            .width(min: 60, ideal: 80)

            TableColumn("Status") { record in
                Text(stateLabel(for: record))
                    .foregroundStyle(stateLabelColor(for: record))
            }
            .width(min: 80, ideal: 120)

            TableColumn("Progress") { record in
                if showProgressBar(for: record) {
                    ProgressView(value: record.progressFraction)
                        .tint(progressTint(for: record))
                }
            }
            .width(min: 80, ideal: 120)

            TableColumn("Size") { record in
                if record.expectedBytes != nil || record.receivedBytes > 0 {
                    HStack(spacing: 2) {
                        Text(formatBytes(record.receivedBytes))
                        if let expected = record.expectedBytes {
                            Text("/ \(formatBytes(expected))")
                        }
                    }
                    .foregroundStyle(.secondary)
                    .font(.caption)
                }
            }
            .width(min: 80, ideal: 120)

            TableColumn("") { record in
                HStack(spacing: 8) {
                    if canResume(record) {
                        Button {
                            Task {
                                await DownloadManager.shared.resumeDownload(
                                    for: record.bookID,
                                    category: record.category,
                                )
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: resumeIcon(for: record))
                                    .font(.system(size: 11, weight: .semibold))
                                Text(resumeLabel(for: record))
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundStyle(Color.accentColor)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.accentColor.opacity(0.15))
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }

                    Button {
                        Task {
                            await DownloadManager.shared.cancelDownload(
                                for: record.bookID,
                                category: record.category,
                            )
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Cancel download")
                }
            }
            .width(min: 80, ideal: 120)
        }
        .alternatingRowBackgrounds()
    }
    #endif

    private var iOSList: some View {
        List {
            ForEach(downloads) { record in
                DownloadRecordRow(record: record)
            }
        }
    }

    fileprivate static func categoryLabel(for record: DownloadRecord) -> String {
        switch record.category {
            case .ebook: "Ebook"
            case .audio: "Audiobook"
            case .synced: "Readaloud"
        }
    }

    fileprivate static func stateLabel(for record: DownloadRecord) -> String {
        switch record.state {
            case .queued: "Queued"
            case .downloading(let progress):
                "Downloading \(Int(progress * 100))%"
            case .paused: "Paused"
            case .failed(let error, _): "Failed: \(error)"
            case .importing: "Importing..."
            case .completed: "Completed"
        }
    }

    fileprivate static func stateLabelColor(for record: DownloadRecord) -> Color {
        switch record.state {
            case .failed: .red
            case .paused: .orange
            case .completed: .green
            default: .secondary
        }
    }

    fileprivate static func showProgressBar(for record: DownloadRecord) -> Bool {
        switch record.state {
            case .downloading, .importing, .queued: true
            case .paused(let hasResume): hasResume
            case .failed(_, let hasResume): hasResume
            case .completed: false
        }
    }

    fileprivate static func progressTint(for record: DownloadRecord) -> Color {
        switch record.state {
            case .paused: .orange
            case .failed: .red
            default: .accentColor
        }
    }

    fileprivate static func canResume(_ record: DownloadRecord) -> Bool {
        switch record.state {
            case .paused, .failed: true
            default: false
        }
    }

    fileprivate static func resumeLabel(for record: DownloadRecord) -> String {
        if case .failed = record.state { return "Retry" }
        return "Resume"
    }

    fileprivate static func resumeIcon(for record: DownloadRecord) -> String {
        if case .failed = record.state { return "arrow.clockwise" }
        return "play.fill"
    }

    fileprivate static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func categoryLabel(for record: DownloadRecord) -> String {
        Self.categoryLabel(for: record)
    }
    private func stateLabel(for record: DownloadRecord) -> String {
        Self.stateLabel(for: record)
    }
    private func stateLabelColor(for record: DownloadRecord) -> Color {
        Self.stateLabelColor(for: record)
    }
    private func showProgressBar(for record: DownloadRecord) -> Bool {
        Self.showProgressBar(for: record)
    }
    private func progressTint(for record: DownloadRecord) -> Color {
        Self.progressTint(for: record)
    }
    private func canResume(_ record: DownloadRecord) -> Bool {
        Self.canResume(record)
    }
    private func resumeLabel(for record: DownloadRecord) -> String {
        Self.resumeLabel(for: record)
    }
    private func resumeIcon(for record: DownloadRecord) -> String {
        Self.resumeIcon(for: record)
    }
    private func formatBytes(_ bytes: Int64) -> String {
        Self.formatBytes(bytes)
    }
}

private struct DownloadRecordRow: View {
    let record: DownloadRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(record.bookTitle)
                .font(.headline)
                .lineLimit(1)

            HStack {
                Text(CurrentlyDownloadingView.categoryLabel(for: record))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(CurrentlyDownloadingView.stateLabel(for: record))
                    .font(.caption)
                    .foregroundStyle(CurrentlyDownloadingView.stateLabelColor(for: record))
            }

            if CurrentlyDownloadingView.showProgressBar(for: record) {
                ProgressView(value: record.progressFraction)
                    .tint(CurrentlyDownloadingView.progressTint(for: record))
            }

            HStack {
                if record.expectedBytes != nil || record.receivedBytes > 0 {
                    Text(CurrentlyDownloadingView.formatBytes(record.receivedBytes))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if let expected = record.expectedBytes {
                        Text("of \(CurrentlyDownloadingView.formatBytes(expected))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if CurrentlyDownloadingView.canResume(record) {
                    Button {
                        Task {
                            await DownloadManager.shared.resumeDownload(
                                for: record.bookID,
                                category: record.category,
                            )
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: CurrentlyDownloadingView.resumeIcon(for: record))
                                .font(.system(size: 11, weight: .semibold))
                            Text(CurrentlyDownloadingView.resumeLabel(for: record))
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(Color.accentColor)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.accentColor.opacity(0.15))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                Task {
                    await DownloadManager.shared.cancelDownload(
                        for: record.bookID,
                        category: record.category,
                    )
                }
            } label: {
                Label("Cancel", systemImage: "xmark.circle")
            }
        }
    }
}

#endif
