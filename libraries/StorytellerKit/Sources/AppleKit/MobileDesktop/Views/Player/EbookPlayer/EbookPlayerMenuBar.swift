#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
import UIKit

struct EbookPlayerMenuBar: View {
    @Environment(\.colorScheme) private var colorScheme

    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    let sleepTimerActive: Bool
    let sleepTimerType: SleepTimerType?

    @Binding var showCustomizePopover: Bool
    @Binding var showSearchSheet: Bool
    @Binding var showBookmarksPanel: Bool
    @Binding var showAudioSidebar: Bool
    @Binding var showSleepTimerSheet: Bool

    let searchManager: EbookSearchManager?

    let onDismiss: () -> Void
    let onSearchResultSelected: (SearchResult) -> Void
    let onSleepTimerStart: (TimeInterval?, SleepTimerType) -> Void
    let onSleepTimerCancel: () -> Void

    let settingsVM: SettingsViewModel

    @State private var customizeCard: CustomizeCard?

    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    private var toolbarForegroundColor: Color {
        let bgHex =
            settingsVM.backgroundColor
            ?? (colorScheme == .dark ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
        return isLightColor(hex: bgHex) ? .black : .white
    }

    private var toolbarBackgroundColor: Color { settingsVM.pageBackground(for: colorScheme) }

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

                HStack(spacing: 0) {
                    ForEach(Array(visibleSlots.enumerated()), id: \.offset) { _, comp in
                        PlayerComplicationView(
                            complication: comp,
                            display: display,
                            actions: toolbarActions,
                            style: .menuBar(tint: toolbarForegroundColor),
                        )
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

                    Menu {
                        Section("Customize:") {
                            Button {
                                customizeCard = .textLayout
                            } label: {
                                Label("Text & Layout", systemImage: "textformat.size")
                            }
                            Button {
                                customizeCard = .readaloud
                            } label: {
                                Label("Readaloud", systemImage: "highlighter")
                            }
                            Button {
                                customizeCard = .theme
                            } label: {
                                Label("Theme", systemImage: "paintpalette")
                            }
                            Button {
                                customizeCard = .menuBar
                            } label: {
                                Label(
                                    "Menu Bar",
                                    systemImage: "rectangle.tophalf.inset.filled",
                                )
                            }
                            Button {
                                customizeCard = .miniplayer
                            } label: {
                                Label("Miniplayer", systemImage: "play.rectangle")
                            }
                            Button {
                                customizeCard = .dock
                            } label: {
                                Label(
                                    "Dock",
                                    systemImage: "rectangle.bottomhalf.inset.filled",
                                )
                            }
                        }
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(toolbarForegroundColor)
                            .contentShape(Rectangle())
                    }
                    .frame(width: 44, height: 44)
                    .fullScreenCover(item: $customizeCard) { card in
                        switch card {
                            case .textLayout:
                                EbookPlayerSettings(settingsVM: settingsVM)
                            case .readaloud:
                                ReadaloudHighlightCard(
                                    settingsVM: settingsVM,
                                    hasAudioNarration: display.hasAudioNarration,
                                )
                            case .menuBar:
                                MenuBarCustomizeCard(settingsVM: settingsVM)
                            case .miniplayer:
                                MiniPlayerCustomizeCard(settingsVM: settingsVM)
                            case .dock:
                                DockCustomizeCard(settingsVM: settingsVM)
                            case .theme:
                                ThemeCustomizeCard(settingsVM: settingsVM)
                        }
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
    }

    private var visibleSlots: [PlayerComplication] {
        settingsVM.menuBarSlots.filter {
            $0 != .none && (display.hasAudioNarration || !$0.requiresAudio)
        }
    }

    private var toolbarActions: MiniPlayerActions {
        var overridden = actions
        overridden.onOpenSleepTimer = {
            if sleepTimerActive {
                onSleepTimerCancel()
            } else {
                showSleepTimerSheet = true
            }
        }
        return overridden
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
