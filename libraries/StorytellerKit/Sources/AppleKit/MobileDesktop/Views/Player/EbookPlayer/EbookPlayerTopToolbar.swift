#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
import UIKit

struct EbookPlayerTopToolbar: View {
    @Environment(\.colorScheme) private var colorScheme

    let hasAudioNarration: Bool
    let playbackSpeed: Double
    let chapters: [ChapterItem]
    let selectedChapterId: String?
    let isSynced: Bool
    let sleepTimerActive: Bool
    let sleepTimerRemaining: TimeInterval?
    let sleepTimerType: SleepTimerType?

    @Binding var showCustomizePopover: Bool
    @Binding var showSearchSheet: Bool
    @Binding var showBookmarksPanel: Bool
    @Binding var showAudioSidebar: Bool

    let searchManager: EbookSearchManager?

    let onDismiss: () -> Void
    let onChapterSelected: (ChapterItem) -> Void
    let onSyncToggle: (Bool) async throws -> Void
    let onSearchResultSelected: (SearchResult) -> Void
    let onSleepTimerStart: (TimeInterval?, SleepTimerType) -> Void
    let onSleepTimerCancel: () -> Void

    let settingsVM: SettingsViewModel

    @State private var showSleepTimerSheet = false
    @State private var showOptionsSheet = false

    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    private var toolbarForegroundColor: Color {
        let bgHex =
            settingsVM.backgroundColor
            ?? (colorScheme == .dark ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
        return isLightColor(hex: bgHex) ? .black : .white
    }

    private var toolbarBackgroundColor: Color {
        if let bgColor = settingsVM.backgroundColor, let color = Color(hex: bgColor) {
            return color
        }
        return colorScheme == .dark
            ? Color(hex: kDefaultBackgroundColorDark) ?? .black
            : Color(hex: kDefaultBackgroundColorLight) ?? .white
    }

    private func isLightColor(hex: String) -> Bool {
        guard let color = Color(hex: hex),
            let components = UIColor(color).cgColor.components,
            components.count >= 3
        else {
            return colorScheme == .light
        }
        let brightness = (components[0] * 299 + components[1] * 587 + components[2] * 114) / 1000
        return brightness > 0.5
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 8) {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(toolbarForegroundColor)
                        .contentShape(Rectangle())
                }
                .frame(width: 44, height: 44)

                Spacer(minLength: 0)

                HStack(spacing: 4) {
                    if hasAudioNarration {
                        sleepTimerButton
                    }

                    ChaptersButton(
                        chapters: chapters,
                        selectedChapterId: selectedChapterId,
                        onChapterSelected: onChapterSelected,
                        backgroundColor: toolbarForegroundColor,
                        foregroundColor: toolbarForegroundColor,
                        transparency: 1.0,
                        showLabel: false,
                        buttonSize: 44,
                        showBackground: false,
                    )

                    Button {
                        showBookmarksPanel = true
                    } label: {
                        Image(systemName: "bookmark")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(toolbarForegroundColor)
                            .contentShape(Rectangle())
                    }
                    .frame(width: 44, height: 44)

                    Button {
                        showSearchSheet = true
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(toolbarForegroundColor)
                            .contentShape(Rectangle())
                    }
                    .frame(width: 44, height: 44)
                    .sheet(isPresented: $showSearchSheet) {
                        NavigationStack {
                            if let manager = searchManager {
                                EbookSearchPanel(
                                    searchManager: manager,
                                    onDismiss: { showSearchSheet = false },
                                    onResultSelected: { result in
                                        onSearchResultSelected(result)
                                        showSearchSheet = false
                                    },
                                )
                                .navigationTitle("Search")
                                .navigationBarTitleDisplayMode(.inline)
                                .toolbar {
                                    ToolbarItem(placement: .topBarTrailing) {
                                        Button("Done") {
                                            showSearchSheet = false
                                        }
                                    }
                                }
                            }
                        }
                        .presentationDetents([.medium, .large])
                    }

                    Button {
                        showCustomizePopover = true
                    } label: {
                        Image(systemName: "textformat.size")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(toolbarForegroundColor)
                            .contentShape(Rectangle())
                    }
                    .frame(width: 44, height: 44)
                    .sheet(isPresented: $showCustomizePopover) {
                        NavigationStack {
                            ScrollView {
                                EbookPlayerSettings(
                                    settingsVM: settingsVM,
                                    hasAudioNarration: hasAudioNarration,
                                    onDismiss: nil,
                                )
                                .padding()
                            }
                            .navigationTitle("Customize Reader")
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("Done") {
                                        showCustomizePopover = false
                                    }
                                }
                            }
                        }
                        .presentationDetents([.fraction(0.7)])
                    }

                    if isPad {
                        Button {
                            withAnimation(.easeInOut) { showAudioSidebar.toggle() }
                        } label: {
                            Image(systemName: "sidebar.trailing")
                                .font(.system(size: 20, weight: .regular))
                                .symbolVariant(showAudioSidebar ? .fill : .none)
                                .foregroundStyle(toolbarForegroundColor)
                                .contentShape(Rectangle())
                        }
                        .frame(width: 44, height: 44)
                    }

                    Button {
                        showOptionsSheet = true
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(toolbarForegroundColor)
                            .contentShape(Rectangle())
                    }
                    .frame(width: 44, height: 44)
                    .sheet(isPresented: $showOptionsSheet) {
                        optionsSheet
                    }
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 44)
            .background(toolbarBackgroundColor.ignoresSafeArea(edges: .top))

            Spacer()
        }
        .sheet(isPresented: $showSleepTimerSheet) {
            sleepTimerSheet
        }
    }

    private var sleepTimerButton: some View {
        Button(action: {
            if sleepTimerActive {
                onSleepTimerCancel()
            } else {
                showSleepTimerSheet = true
            }
        }) {
            Image(systemName: sleepTimerActive ? "moon.zzz.fill" : "moon.zzz")
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(sleepTimerActive ? .accentColor : toolbarForegroundColor)
                .contentShape(Rectangle())
        }
        .frame(width: 44, height: 44)
        .overlay(alignment: .bottom) {
            if sleepTimerActive {
                Group {
                    if sleepTimerType == .endOfChapter {
                        Text("End Ch.")
                    } else if let remaining = sleepTimerRemaining {
                        Text(formatSleepTimerRemaining(remaining))
                    }
                }
                .font(.caption2)
                .foregroundStyle(toolbarForegroundColor.opacity(0.7))
                .offset(y: 10)
            }
        }
    }

    private func formatSleepTimerRemaining(_ time: TimeInterval) -> String {
        let totalSeconds = max(Int(time.rounded()), 0)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private var optionsSheet: some View {
        NavigationStack {
            List {
                if hasAudioNarration {
                    Section("Playback") {
                        Toggle(
                            isOn: Binding(
                                get: { !isSynced },
                                set: { newValue in
                                    Task { try? await onSyncToggle(!newValue) }
                                },
                            )
                        ) {
                            Label("Free Browse When Paused", systemImage: "lock.open")
                        }
                    }

                    Section("Mini Player") {
                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.alwaysShowMiniPlayer },
                                set: { newValue in
                                    settingsVM.alwaysShowMiniPlayer = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Always Show", systemImage: "rectangle.bottomhalf.inset.filled")
                        }

                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showMiniPlayerStats },
                                set: { newValue in
                                    settingsVM.showMiniPlayerStats = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Show Stats Below", systemImage: "clock")
                        }
                    }
                }

                Section("Overlay Info") {
                    Toggle(
                        isOn: Binding(
                            get: { settingsVM.showProgress },
                            set: { newValue in
                                settingsVM.showProgress = newValue
                                Task { try? await settingsVM.save() }
                            },
                        )
                    ) {
                        Label("Book Progress", systemImage: "percent")
                    }

                    Toggle(
                        isOn: Binding(
                            get: { settingsVM.showPageNumber },
                            set: { newValue in
                                settingsVM.showPageNumber = newValue
                                Task { try? await settingsVM.save() }
                            },
                        )
                    ) {
                        Label("Page Number", systemImage: "book.pages")
                    }

                    if hasAudioNarration {
                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showTimeRemainingInBook },
                                set: { newValue in
                                    settingsVM.showTimeRemainingInBook = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Time in Book", systemImage: "clock")
                        }

                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showTimeRemainingInChapter },
                                set: { newValue in
                                    settingsVM.showTimeRemainingInChapter = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Time in Chapter", systemImage: "clock.badge")
                        }
                    }
                }

                if hasAudioNarration {
                    Section("Overlay Controls") {
                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showOverlaySkipBackward },
                                set: { newValue in
                                    settingsVM.showOverlaySkipBackward = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Skip Back", systemImage: "arrow.counterclockwise")
                        }

                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showOverlayPlayPause },
                                set: { newValue in
                                    settingsVM.showOverlayPlayPause = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Play/Pause", systemImage: "play")
                        }

                        Toggle(
                            isOn: Binding(
                                get: { settingsVM.showOverlaySkipForward },
                                set: { newValue in
                                    settingsVM.showOverlaySkipForward = newValue
                                    Task { try? await settingsVM.save() }
                                },
                            )
                        ) {
                            Label("Skip Forward", systemImage: "arrow.clockwise")
                        }
                    }
                }
            }
            .navigationTitle("Display Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        showOptionsSheet = false
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var sleepTimerSheet: some View {
        NavigationStack {
            List {
                Section {
                    sleepTimerOption(title: "10 minutes", duration: 10 * 60)
                    sleepTimerOption(title: "15 minutes", duration: 15 * 60)
                    sleepTimerOption(title: "30 minutes", duration: 30 * 60)
                    sleepTimerOption(title: "1 hour", duration: 60 * 60)
                }

                Section {
                    sleepTimerOption(
                        title: "At End of Chapter",
                        duration: nil,
                        type: .endOfChapter,
                    )
                }
            }
            .navigationTitle("Sleep Timer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        showSleepTimerSheet = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func sleepTimerOption(
        title: String,
        duration: TimeInterval?,
        type: SleepTimerType = .duration,
    ) -> some View {
        Button(action: {
            onSleepTimerStart(duration, type)
            showSleepTimerSheet = false
        }) {
            HStack {
                Text(title)
                    .foregroundStyle(.primary)
                Spacer()
                if sleepTimerActive && sleepTimerType == type {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}
#endif

#endif
