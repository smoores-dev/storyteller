#if os(iOS) || os(macOS)
import SwiftUI

public struct AudiobookPlayerView: View {
    private let bookData: PlayerBookData?
    private let onClose: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var sessionState: AudiobookSessionState?
    @State private var chapterProgress = 0.0
    @State private var errorMessage: String?
    @State private var stateObserverID: UUID?
    @State private var showServerPositionDialog = false
    @State private var lastPendingServerPosition: AudiobookSessionServerPosition?

    public init(bookData: PlayerBookData?, onClose: (() -> Void)? = nil) {
        self.bookData = bookData
        self.onClose = onClose
    }

    public var body: some View {
        readingSidebarView
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            #if os(iOS)
        .toolbar(.hidden, for: .tabBar)
            #endif
            .alert("Audiobook Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") {
                    errorMessage = nil
                }
            } message: {
                if let error = errorMessage {
                    Text(error)
                }
            }
            .alert(
                "Server Has Newer Position",
                isPresented: $showServerPositionDialog,
            ) {
                Button("Go to New Position") {
                    control(.acceptServerPosition)
                    showServerPositionDialog = false
                }
                Button("Stay Here", role: .cancel) {
                    control(.declineServerPosition)
                    showServerPositionDialog = false
                }
            } message: {
                Text(serverPositionDescription)
            }
            .onAppear {
                Task { @MainActor in
                    await openSession()
                }
            }
            .onDisappear {
                #if os(iOS)
                debugLog(
                    "[AudiobookPlayerView] onDisappear scenePhase=\(scenePhase) bookId=\(bookData?.metadata.uuid ?? "nil")"
                )
                guard scenePhase == .active else {
                    debugLog(
                        "[AudiobookPlayerView] Background disappear - preserving audio playback"
                    )
                    return
                }
                let keepsSession = PlayerPresenter.shared.cardDismissalKeepsSession()
                #else
                let keepsSession = false
                #endif

                let observerID = stateObserverID
                stateObserverID = nil
                let bookID = bookData?.metadata.id
                Task {
                    if let observerID {
                        await AudioSessionActor.shared.removeStateObserver(id: observerID)
                    }
                    if !keepsSession, let bookID {
                        await AudioSessionActor.shared.close(ifOwnedBy: bookID)
                    }
                }
            }
            #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    closeBook()
                } label: {
                    Label("Library", systemImage: "chevron.left")
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        #endif
    }

    #if os(iOS)
    private func closeBook() {
        if let onClose {
            onClose()
        } else {
            dismiss()
        }
    }
    #endif

    private var readingSidebarView: some View {
        let state = sessionState
        let currentChapter = state?.currentChapterIndex.flatMap { index in
            state?.chapters[safe: index]
        }
        let chapters =
            state?.chapters.map { chapter in
                ChapterItem(
                    id: chapter.id,
                    label: chapter.title,
                    href: chapter.id,
                    level: 0,
                )
            } ?? []
        let sleepTimerType = state?.sleepTimerMode.map { mode in
            switch mode {
                case .duration: SleepTimerType.duration
                case .endOfChapter: SleepTimerType.endOfChapter
            }
        }
        let progressData = state.map { state in
            ProgressData(
                chapterId: state.currentChapterID,
                chapterLabel: currentChapter?.title,
                chapterCurrentPage: nil,
                chapterTotalPages: nil,
                chapterCurrentSecondsAudio: state.chapterElapsed,
                chapterTotalSecondsAudio: state.chapterDuration,
                bookCurrentSecondsAudio: state.currentTime,
                bookTotalSecondsAudio: state.duration,
                bookCurrentFraction: state.bookProgress,
            )
        }

        return ReadingSidebarView(
            bookData: bookData,
            model: .init(
                title: state?.title ?? bookData?.metadata.title ?? "Unknown Book",
                author: state?.author ?? bookData?.metadata.authors?.first?.name
                    ?? "Unknown Author",
                chapterTitle: currentChapter?.title ?? "Loading...",
                coverArt: bookData?.coverArt,
                ebookCoverArt: bookData?.ebookCoverArt,
                chapterDuration: state?.chapterDuration ?? 0,
                totalRemaining: max(0, (state?.duration ?? 0) - (state?.currentTime ?? 0)),
                playbackRate: state?.playbackRate ?? 1,
                volume: state?.volume ?? 1,
                isPlaying: state?.isPlaying ?? false,
                sleepTimerActive: state?.sleepTimerMode != nil,
                sleepTimerRemaining: state?.sleepTimerRemaining,
                sleepTimerType: sleepTimerType,
            ),
            mode: .audiobook,
            chapterProgress: $chapterProgress,
            chapters: chapters,
            progressData: progressData,
            onChapterSelected: { chapter in
                control(.selectChapter(chapter.id))
            },
            onPrevChapter: {
                control(.previousChapter)
            },
            onSkipBackward: {
                control(.skipBackward)
            },
            onPlayPause: {
                control(.togglePlayPause)
            },
            onSkipForward: {
                control(.skipForward)
            },
            onNextChapter: {
                control(.nextChapter)
            },
            onPlaybackRateChange: { rate in
                control(.setPlaybackRate(rate))
            },
            onVolumeChange: { volume in
                control(.setVolume(volume))
            },
            onSleepTimerStart: { duration, type in
                if type == .endOfChapter {
                    control(.startEndOfChapterSleepTimer)
                } else if let duration {
                    control(.startSleepTimer(duration))
                }
            },
            onSleepTimerCancel: {
                control(.cancelSleepTimer)
            },
            onProgressSeek: { fraction in
                control(.seekChapterFraction(fraction))
            },
            seekWhileDragging: false,
        )
    }

    @MainActor
    private func openSession() async {
        guard let bookData, let mediaURL = bookData.localMediaPath else {
            errorMessage = "No audiobook file available"
            return
        }

        do {
            try await AudioSessionActor.shared.openAudiobook(
                book: bookData.metadata,
                mediaURL: mediaURL,
            )

            if stateObserverID == nil {
                stateObserverID = await AudioSessionActor.shared.addStateObserver { state in
                    Task { @MainActor in
                        applySessionState(state)
                    }
                }
            }
            applySessionState(await AudioSessionActor.shared.currentState())
        } catch {
            errorMessage = "Failed to load audiobook: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func applySessionState(_ state: AudiobookSessionState?) {
        sessionState = state
        if let state {
            chapterProgress = state.chapterProgress
            if state.pendingServerPosition != lastPendingServerPosition {
                lastPendingServerPosition = state.pendingServerPosition
                showServerPositionDialog = state.pendingServerPosition != nil
            }
        } else {
            lastPendingServerPosition = nil
            showServerPositionDialog = false
        }
    }

    private func control(_ command: AudiobookSessionCommand) {
        Task {
            do {
                try await AudioSessionActor.shared.control(command)
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private var serverPositionDescription: String {
        guard let position = sessionState?.pendingServerPosition else {
            return "Another device has synced a more recent reading position."
        }
        var details: [String] = []
        if let title = position.title {
            details.append(title)
        }
        if let progression = position.totalProgression {
            details.append("\(Int(progression * 100))%")
        }
        let location = details.isEmpty ? "" : " (\(details.joined(separator: ", ")))"
        return
            "Another device has synced a more recent reading position\(location). Would you like to go to that location?"
    }
}

#endif
