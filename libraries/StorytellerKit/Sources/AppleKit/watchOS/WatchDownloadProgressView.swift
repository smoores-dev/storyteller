#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchDownloadProgressView: View {
    let bookId: BookID
    let bookTitle: String
    let category: LocalMediaCategory
    let onDismiss: () -> Void

    private let bookMetadata: BookMetadata?

    init(record: DownloadRecord, onDismiss: @escaping () -> Void) {
        self.bookId = record.bookID
        self.bookTitle = record.bookTitle
        self.category = record.category
        self.bookMetadata = nil
        self.onDismiss = onDismiss
        self.recordId = record.id
    }

    @Environment(\.scenePhase) private var scenePhase

    @State private var progress: Double = 0
    @State private var bytesDownloaded: Int64 = 0
    @State private var totalBytes: Int64 = 0
    @State private var downloadSpeed: Double = 0
    @State private var lastBytesDownloaded: Int64 = -1
    @State private var lastSpeedUpdate: Date = Date()
    @State private var isComplete = false
    @State private var didFail = false
    @State private var isDownloading = false

    private let recordId: UUID

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(lineWidth: 8)
                    .opacity(0.2)
                    .foregroundStyle(progressColor)

                Circle()
                    .trim(from: 0, to: CGFloat(progress))
                    .stroke(style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .foregroundStyle(progressColor)
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 2) {
                    Text(String(format: "%.1f%%", progress * 100))
                        .font(.title2.bold())

                    if totalBytes > 0 {
                        Text(formatBytes(bytesDownloaded))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(width: 110, height: 110)

            Text(bookTitle)
                .font(.caption)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            if didFail {
                Text("Download interrupted")
                    .font(.caption2)
                    .foregroundStyle(.red)

                Button {
                    didFail = false
                    isDownloading = true
                    Task {
                        await DownloadManager.shared.resumeDownload(
                            for: bookId,
                            category: category,
                        )
                    }
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .font(.caption)
                }
                .tint(.blue)
            } else if isComplete {
                Text("Complete!")
                    .font(.caption2)
                    .foregroundStyle(.green)
            } else if isDownloading {
                Text(timeRemainingText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Starting...")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "chevron.left")
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(role: .destructive) {
                    Task {
                        await DownloadManager.shared.cancelDownload(
                            for: bookId,
                            category: category,
                        )
                    }
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(.red)
                }
            }
        }
        .task {
            await beginAndObserve()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await syncCurrentState()
                }
            }
        }
    }

    private var progressColor: Color {
        if didFail { return .red }
        if isComplete { return .green }
        return .blue
    }

    private var timeRemainingText: String {
        guard downloadSpeed > 0, totalBytes > 0 else {
            return "Calculating..."
        }

        let remainingBytes = totalBytes - bytesDownloaded
        let secondsRemaining = Double(remainingBytes) / downloadSpeed

        if secondsRemaining < 60 {
            return "\(Int(secondsRemaining))s remaining"
        } else if secondsRemaining < 3600 {
            let minutes = Int(secondsRemaining / 60)
            let seconds = Int(secondsRemaining) % 60
            return "\(minutes)m \(seconds)s remaining"
        } else {
            let hours = Int(secondsRemaining / 3600)
            let minutes = Int(secondsRemaining / 60) % 60
            return "\(hours)h \(minutes)m remaining"
        }
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func syncCurrentState() async {
        let record = await DownloadManager.shared.downloadState(for: bookId, category: category)

        guard let record else {
            progress = 1.0
            isComplete = true
            isDownloading = false
            didFail = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                onDismiss()
            }
            return
        }

        progress = record.progressFraction
        bytesDownloaded = record.receivedBytes
        if let expected = record.expectedBytes {
            totalBytes = expected
        }

        switch record.state {
            case .completed:
                isComplete = true
                isDownloading = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    onDismiss()
                }
            case .failed, .paused:
                didFail = true
                isDownloading = false
            case .downloading:
                isDownloading = true
                didFail = false
            case .queued, .importing:
                isDownloading = true
        }
    }

    private func beginAndObserve() async {
        if let book = bookMetadata {
            await DownloadManager.shared.startDownload(for: book, category: category)
        } else {
            await DownloadManager.shared.resumeDownload(for: bookId, category: category)
        }

        let _ = await DownloadManager.shared.addObserver { [recordId] records in
            Task { @MainActor in
                guard let record = records.first(where: { $0.id == recordId }) else {
                    if isDownloading || bytesDownloaded > 0 {
                        progress = 1.0
                        isComplete = true
                        isDownloading = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                            onDismiss()
                        }
                    }
                    return
                }

                let now = Date()
                if lastBytesDownloaded < 0 {
                    lastBytesDownloaded = record.receivedBytes
                    lastSpeedUpdate = now
                } else {
                    let elapsed = now.timeIntervalSince(lastSpeedUpdate)
                    if elapsed >= 1.0 && record.receivedBytes > lastBytesDownloaded {
                        let instantSpeed =
                            Double(record.receivedBytes - lastBytesDownloaded) / elapsed
                        downloadSpeed =
                            downloadSpeed > 0
                            ? 0.3 * instantSpeed + 0.7 * downloadSpeed : instantSpeed
                        lastBytesDownloaded = record.receivedBytes
                        lastSpeedUpdate = now
                    }
                }

                progress = record.progressFraction
                bytesDownloaded = record.receivedBytes
                if let expected = record.expectedBytes {
                    totalBytes = expected
                }

                switch record.state {
                    case .completed:
                        isComplete = true
                        isDownloading = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                            onDismiss()
                        }
                    case .failed, .paused:
                        didFail = true
                        isDownloading = false
                    case .downloading:
                        isDownloading = true
                        didFail = false
                    case .queued, .importing:
                        isDownloading = true
                }
            }
        }
    }
}

#endif
