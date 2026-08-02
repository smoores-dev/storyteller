#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
import UIKit
#else
import AppKit
#endif

struct SyncHistorySheet: View {
    let bookId: BookID
    let bookTitle: String
    @Environment(\.dismiss) private var dismiss
    @State private var history: [SyncHistoryEntry] = []
    @State private var isLoading = true
    @State private var showServerUpdates = false
    @State private var showOnlyAcceptedUpdates = false
    @State private var entryToRestore: SyncHistoryEntry?
    @State private var showRestoreConfirmation = false

    private var filteredHistory: [SyncHistoryEntry] {
        if showServerUpdates {
            if showOnlyAcceptedUpdates {
                return history.filter { $0.result != .serverIncomingRejected }
            }
            return history
        } else {
            return history.filter {
                $0.result != .serverIncomingAccepted && $0.result != .serverIncomingRejected
            }
        }
    }

    var body: some View {
        #if os(iOS)
        NavigationStack {
            historyContent
                .navigationTitle("Sync History")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        HStack(spacing: 12) {
                            if !history.isEmpty {
                                Button("Clear") {
                                    Task {
                                        await ProgressSyncActor.shared.clearSyncHistory(for: bookId)
                                        history = []
                                    }
                                }
                                .foregroundStyle(.red)
                                Button {
                                    copyToClipboard()
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                }
                            }
                            Button {
                                Task { await refresh() }
                            } label: {
                                Image(systemName: "arrow.clockwise")
                            }
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    VStack(spacing: 8) {
                        Toggle("Show server updates", isOn: $showServerUpdates)
                        Toggle("Show only accepted", isOn: $showOnlyAcceptedUpdates)
                            .disabled(!showServerUpdates)
                            .foregroundStyle(showServerUpdates ? .primary : .tertiary)
                    }
                    .padding()
                    .background(.regularMaterial)
                }
        }
        .task {
            await refresh()
        }
        #else
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                Text("Sync History")
                    .font(.headline)
                Spacer()
                Button {
                    Task { await refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                if !history.isEmpty {
                    Button {
                        copyToClipboard()
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.plain)
                    Button("Clear") {
                        Task {
                            await ProgressSyncActor.shared.clearSyncHistory(for: bookId)
                            history = []
                        }
                    }
                    .foregroundStyle(.red)
                    .buttonStyle(.plain)
                }
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(6)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            historyContent
                .frame(maxHeight: .infinity, alignment: .top)

            Divider()

            VStack(spacing: 8) {
                Toggle("Show server updates", isOn: $showServerUpdates)
                Toggle("Show only accepted", isOn: $showOnlyAcceptedUpdates)
                    .disabled(!showServerUpdates)
                    .foregroundStyle(showServerUpdates ? .primary : .tertiary)
            }
            .padding()
        }
        .frame(minWidth: 400, minHeight: 500)
        .task {
            await refresh()
        }
        #endif
    }

    private func refresh() async {
        isLoading = true
        history = await ProgressSyncActor.shared.getSyncHistory(for: bookId)
        isLoading = false
    }

    private func copyToClipboard() {
        var lines: [String] = []
        lines.append("Sync History for: \(bookTitle)")
        lines.append("Book ID: \(bookId)")
        lines.append("Exported: \(Date().formatted())")
        lines.append("Entries: \(history.count)")
        lines.append("")

        for entry in history.reversed() {
            lines.append("---")
            lines.append("Position Time: \(entry.humanTimestamp)")
            lines.append("Arrived At: \(entry.humanArrivedAt)")
            lines.append("Source: \(entry.sourceIdentifier)")
            lines.append("Location: \(entry.locationDescription)")
            lines.append("Reason: \(entry.reason.rawValue)")
            lines.append("Result: \(entry.result.rawValue)")
            lines.append("Locator: \(entry.locatorSummary)")
            lines.append("Position Timestamp (ms): \(Int(entry.timestamp))")
            lines.append("Arrived Timestamp (ms): \(Int(entry.arrivedAt))")
        }

        let text = lines.joined(separator: "\n")

        #if os(iOS)
        UIPasteboard.general.string = text
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }

    @ViewBuilder
    private var historyContent: some View {
        if isLoading {
            ProgressView("Loading...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if filteredHistory.isEmpty {
            ContentUnavailableView(
                "No Sync History",
                systemImage: "clock.arrow.circlepath",
                description: Text(
                    history.isEmpty
                        ? "No sync events have been recorded for this book yet."
                        : "No outgoing syncs. Enable 'Show server updates' to see incoming syncs."
                ),
            )
        } else {
            List {
                ForEach(filteredHistory.reversed(), id: \.arrivedAt) { entry in
                    SyncHistoryEntryRow(entry: entry) {
                        entryToRestore = entry
                        showRestoreConfirmation = true
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #else
            .listStyle(.inset)
            #endif
            .alert("Restore Position?", isPresented: $showRestoreConfirmation) {
                Button("Cancel", role: .cancel) {
                    entryToRestore = nil
                }
                Button("Restore") {
                    if let entry = entryToRestore, let locator = entry.locator {
                        Task {
                            let _ = await ProgressSyncActor.shared.restorePosition(
                                bookID: bookId,
                                locator: locator,
                                locationDescription: entry.locationDescription,
                            )
                            await refresh()
                        }
                    }
                    entryToRestore = nil
                }
            } message: {
                if let entry = entryToRestore {
                    Text("Restore position to \(entry.locationDescription)?")
                }
            }
        }
    }
}

struct SyncHistoryEntryRow: View {
    let entry: SyncHistoryEntry
    var onRestore: (() -> Void)?

    private var showArrivedTime: Bool {
        abs(entry.arrivedAt - entry.timestamp) > 1000
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.humanTimestamp)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    if showArrivedTime {
                        Text("recv: \(entry.humanArrivedAt)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if entry.locator != nil, let onRestore {
                    Button {
                        onRestore()
                    } label: {
                        Image(systemName: "arrow.uturn.backward.circle")
                            .font(.title)
                            .foregroundStyle(.blue)
                    }
                    .buttonStyle(.plain)
                }
                resultBadge
            }

            Text(entry.locationDescription.isEmpty ? "Unknown location" : entry.locationDescription)
                .font(.body)
                .foregroundStyle(.primary)

            HStack(spacing: 12) {
                Label(entry.sourceIdentifier, systemImage: sourceIcon)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Label(formatReason(entry.reason), systemImage: reasonIcon(entry.reason))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(entry.locatorSummary)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }

    private var resultBadge: some View {
        let (color, text) = resultInfo
        return Text(text)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var resultInfo: (Color, String) {
        switch entry.result {
            case .queued:
                return (.orange, "Queued")
            case .sent:
                return (.blue, "Sent")
            case .completed:
                return (.green, "Completed")
            case .rejectedAsOlder:
                return (.red, "Rejected")

            case .serverIncomingAccepted:
                return (.green, "Accepted")
            case .serverIncomingRejected:
                return (.purple, "Ignored")
        }
    }

    private var sourceIcon: String {
        if entry.sourceIdentifier.contains("Server") {
            return "cloud.fill"
        } else if entry.sourceIdentifier.contains("CarPlay") {
            return "car.fill"
        } else if entry.sourceIdentifier.contains("Watch") {
            return "applewatch"
        } else if entry.sourceIdentifier.contains("Audiobook") {
            return "headphones"
        } else if entry.sourceIdentifier.contains("Readaloud") {
            return "speaker.wave.2.fill"
        } else {
            return "book.fill"
        }
    }

    private func reasonIcon(_ reason: SyncReason) -> String {
        switch reason {
            case .userPausedPlayback: return "pause.fill"
            case .userStartedPlayback: return "play.fill"
            case .userSkippedForward: return "forward.fill"
            case .userSkippedBackward: return "backward.fill"
            default: return "arrow.triangle.2.circlepath"
        }
    }

    private func formatReason(_ reason: SyncReason) -> String {
        switch reason {
            case .userFlippedPage: return "Page flip"
            case .userSelectedChapter: return "Chapter select"
            case .userDraggedSeekBar: return "Seek"
            case .userPausedPlayback: return "Paused"
            case .userStartedPlayback: return "Started"
            case .userSkippedForward: return "Skip forward"
            case .userSkippedBackward: return "Skip back"
            case .periodicDuringActivePlayback: return "Periodic (playing)"
            case .periodicWhileReading: return "Periodic (reading)"
            case .userClosedBook: return "Closed book"
            case .userRestoredFromHistory: return "Restored"
            case .appBackgrounding: return "App backgrounded"
            case .appTerminating: return "App closing"
            case .connectionRestored: return "Reconnected"
            case .watchReconnected: return "Watch reconnected"
            case .relayedFromWatch: return "Relayed from watch"
            case .initialLoad: return "Initial load"
            case .appWokeFromSleep: return "Wake from sleep"
        }
    }
}

#endif
