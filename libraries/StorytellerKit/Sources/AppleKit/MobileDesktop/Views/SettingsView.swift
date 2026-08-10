#if os(iOS) || os(macOS)
import SwiftUI
import UniformTypeIdentifiers

#if os(macOS)
import AppKit
#else
import UIKit
#endif

#if os(macOS)
@MainActor
public final class SettingsTabRequest: ObservableObject {
    public static let shared = SettingsTabRequest()
    @Published public var requestedTab: Int? = nil
    private init() {}

    public func requestReaderSettings() {
        requestedTab = 1
    }

    public func requestBookSources() {
        requestedTab = 3
    }
}
#endif

@MainActor
private class SettingsReloader: ObservableObject {
    @Published var trigger = 0
    private var observerID: UUID?

    init() {
        Task {
            observerID = await SettingsActor.shared.request_notify { @MainActor [weak self] in
                self?.trigger += 1
            }
        }
    }

    deinit {
        if let id = observerID {
            Task {
                await SettingsActor.shared.removeObserver(id: id)
            }
        }
    }
}

public struct SettingsView: View {
    @State private var config = StorytellerGlobalConfig()
    @State private var isLoaded = false
    @State private var saveError: String?
    @State private var showResetConfirmation = false
    @State private var persistTask: Task<Void, Never>?
    @State private var isReloadingFromActor = false
    @State private var lastPersistTime: Date = .distantPast
    @StateObject private var reloader = SettingsReloader()
    #if os(macOS)
    @State private var selectedTab: SettingsTab = .readerSettings
    #endif

    public init() {}

    public var body: some View {
        ZStack {
            settingsContent
                .opacity(isLoaded ? 1 : 0.5)

            if !isLoaded {
                ProgressView()
                    .controlSize(.large)
            }
        }
        .task(loadConfig)
        .onChange(of: config) { _, newValue in persistConfig(newValue: newValue) }
        .onChange(of: reloader.trigger) { _, _ in
            Task { await reloadConfig() }
        }
        #if os(macOS)
        .onReceive(SettingsTabRequest.shared.$requestedTab) { newValue in
            if let tab = newValue {
                switch tab {
                    case 1:
                        selectedTab = .readerSettings
                    case 3:
                        selectedTab = .bookSources
                    default:
                        break
                }
                DispatchQueue.main.async {
                    SettingsTabRequest.shared.requestedTab = nil
                }
            }
        }
        #endif
        .alert(
            "Unable to Save Settings",
            isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } },
            ),
        ) {
            Button("OK", role: .cancel) { saveError = nil }
        } message: {
            Text(saveError ?? "")
        }
        .alert(
            "Reset All Settings to Default?",
            isPresented: $showResetConfirmation,
        ) {
            Button("Cancel", role: .cancel) {}
            Button("Reset All", role: .destructive) {
                resetAllSettings()
            }
        } message: {
            Text(
                "This will reset all settings across all tabs to their default values. This action cannot be undone."
            )
        }
    }

    @ViewBuilder
    private var settingsContent: some View {
        #if os(macOS)
        macOSContent
        #else
        iosContent
        #endif
    }

    private func loadConfig() async {
        guard !isLoaded else { return }
        let loaded = await SettingsActor.shared.config
        await MainActor.run {
            isReloadingFromActor = true
            config = loaded
            isLoaded = true
            isReloadingFromActor = false
        }
    }

    private func reloadConfig() async {
        guard persistTask == nil else { return }
        let timeSinceLastPersist = Date().timeIntervalSince(lastPersistTime)
        guard timeSinceLastPersist > 1.0 else { return }
        let loaded = await SettingsActor.shared.config
        await MainActor.run {
            isReloadingFromActor = true
            config = loaded
            isReloadingFromActor = false
        }
    }

    private func persistConfig(newValue: StorytellerGlobalConfig) {
        guard isLoaded, !isReloadingFromActor else { return }

        lastPersistTime = Date()
        persistTask?.cancel()
        persistTask = Task {
            defer { persistTask = nil }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            do {
                try await SettingsActor.shared.updateConfig(
                    fontSize: newValue.reading.fontSize,
                    fontFamily: newValue.reading.fontFamily,
                    lineSpacing: newValue.reading.lineSpacing,
                    marginLeftRight: newValue.reading.marginLeftRight,
                    marginTop: newValue.reading.marginTop,
                    marginBottom: newValue.reading.marginBottom,
                    wordSpacing: newValue.reading.wordSpacing,
                    letterSpacing: newValue.reading.letterSpacing,
                    paragraphSpacing: newValue.reading.paragraphSpacing,
                    firstLineIndent: newValue.reading.firstLineIndent,
                    textAlignment: newValue.reading.textAlignment,
                    highlightColor: .some(newValue.reading.highlightColor),
                    highlightThickness: newValue.reading.highlightThickness,
                    backgroundColor: .some(newValue.reading.backgroundColor),
                    foregroundColor: .some(newValue.reading.foregroundColor),
                    customCSS: .some(newValue.reading.customCSS),
                    enableMarginClickNavigation: newValue.reading.enableMarginClickNavigation,
                    singleColumnMode: newValue.reading.singleColumnMode,
                    scrollingMode: newValue.reading.scrollingMode,
                    defaultPlaybackSpeed: newValue.playback.defaultPlaybackSpeed,
                    enableReadingBar: newValue.readingBar.enabled,
                    showPlayerControls: newValue.readingBar.showPlayerControls,
                    showProgressBar: newValue.readingBar.showProgressBar,
                    showProgress: newValue.readingBar.showProgress,
                    showTimeRemainingInBook: newValue.readingBar.showTimeRemainingInBook,
                    showTimeRemainingInChapter: newValue.readingBar.showTimeRemainingInChapter,
                    showPageNumber: newValue.readingBar.showPageNumber,
                    dockTransparency: newValue.readingBar.dockTransparency,
                    alwaysShowMiniPlayer: newValue.readingBar.alwaysShowMiniPlayer,
                    progressSyncIntervalSeconds: newValue.sync.progressSyncIntervalSeconds,
                    metadataRefreshIntervalSeconds: newValue.sync.metadataRefreshIntervalSeconds,
                    autoSyncToNewerServerPosition: newValue.sync.autoSyncToNewerServerPosition,
                    showAudioIndicator: newValue.library.showAudioIndicator,
                    tapToPlayPreferredPlayer: newValue.library.tapToPlayPreferredPlayer,
                    preferAudioOverEbook: newValue.library.preferAudioOverEbook,
                    accentColorHex: newValue.library.accentColorHex,
                    colorMode: newValue.library.colorMode,
                    colorIntensity: newValue.library.colorIntensity,
                    doubleCoverAlignment: newValue.library.doubleCoverAlignment,
                    experimentalSettings: newValue.library.experimentalSettings,
                    userHighlightColor1: newValue.reading.userHighlightColor1,
                    userHighlightColor2: newValue.reading.userHighlightColor2,
                    userHighlightColor3: newValue.reading.userHighlightColor3,
                    userHighlightColor4: newValue.reading.userHighlightColor4,
                    userHighlightColor5: newValue.reading.userHighlightColor5,
                    userHighlightColor6: newValue.reading.userHighlightColor6,
                    userHighlightLabel1: newValue.reading.userHighlightLabel1,
                    userHighlightLabel2: newValue.reading.userHighlightLabel2,
                    userHighlightLabel3: newValue.reading.userHighlightLabel3,
                    userHighlightLabel4: newValue.reading.userHighlightLabel4,
                    userHighlightLabel5: newValue.reading.userHighlightLabel5,
                    userHighlightLabel6: newValue.reading.userHighlightLabel6,
                    userHighlightMode: newValue.reading.userHighlightMode,
                    readaloudHighlightMode: newValue.reading.readaloudHighlightMode,
                    tabBarSlot1: newValue.library.tabBarSlot1,
                    tabBarSlot2: newValue.library.tabBarSlot2,
                    tvSubtitleFontSize: newValue.reading.tvSubtitleFontSize,
                    tvBackgroundStyle: newValue.reading.tvReaderAppearance.backgroundStyle,
                    selectedLightThemeId: newValue.themes.selectedLightThemeId,
                    selectedDarkThemeId: newValue.themes.selectedDarkThemeId,
                    customThemes: newValue.themes.customThemes,
                )
            } catch {
                await MainActor.run {
                    saveError = error.localizedDescription
                }
            }
        }
    }

    private func resetAllSettings() {
        config = StorytellerGlobalConfig()
    }
}

#if os(macOS)
extension SettingsView {
    fileprivate var macOSContent: some View {
        VStack(spacing: 0) {
            TabView(selection: $selectedTab) {
                MacGeneralSettingsView(sync: $config.sync, library: $config.library)
                    .tabItem {
                        Label("General", systemImage: "gear")
                    }
                    .tag(SettingsTab.general)

                MacReaderSettingsView(
                    reading: $config.reading,
                    playback: $config.playback,
                    themes: $config.themes,
                )
                .tabItem {
                    Label("Reader Settings", systemImage: "textformat")
                }
                .tag(SettingsTab.readerSettings)

                MacReadingBarSettingsView(readingBar: $config.readingBar)
                    .tabItem {
                        Label("Dock Stats", systemImage: "chart.bar")
                    }
                    .tag(SettingsTab.readingBar)

                MacBookSourcesSettingsView()
                    .tabItem {
                        Label("Book Sources", systemImage: "externaldrive")
                    }
                    .tag(SettingsTab.bookSources)
            }

            Divider()

            HStack {
                if selectedTab == .readerSettings {
                    Button {
                        resetReaderSettings()
                    } label: {
                        Label("Reset Reader Settings", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                Spacer()
                Button {
                    showResetConfirmation = true
                } label: {
                    Label("Reset All to Default", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(12)
        }
        .frame(width: 960, height: 600)
    }

    private func resetReaderSettings() {
        config.reading.fontSize = kDefaultFontSize
        config.reading.fontFamily = kDefaultFontFamily
        config.reading.lineSpacing = kDefaultLineSpacing
        config.reading.marginLeftRight = kDefaultMarginLeftRightMac
        config.reading.marginTop = kDefaultMarginTop
        config.reading.marginBottom = kDefaultMarginBottom
        config.reading.wordSpacing = kDefaultWordSpacing
        config.reading.letterSpacing = kDefaultLetterSpacing
        config.reading.paragraphSpacing = kDefaultParagraphSpacing
        config.reading.firstLineIndent = kDefaultFirstLineIndent
        config.reading.textAlignment = kDefaultTextAlignment
        config.reading.highlightColor = nil
        config.reading.highlightThickness = kDefaultHighlightThickness
        config.reading.userHighlightMode = kDefaultUserHighlightMode
        config.reading.readaloudHighlightMode = kDefaultReadaloudHighlightMode
        config.reading.userHighlightColor1 = kDefaultUserHighlightColor1
        config.reading.userHighlightColor2 = kDefaultUserHighlightColor2
        config.reading.userHighlightColor3 = kDefaultUserHighlightColor3
        config.reading.userHighlightColor4 = kDefaultUserHighlightColor4
        config.reading.userHighlightColor5 = kDefaultUserHighlightColor5
        config.reading.userHighlightColor6 = kDefaultUserHighlightColor6
        config.reading.userHighlightLabel1 = kDefaultUserHighlightLabel1
        config.reading.userHighlightLabel2 = kDefaultUserHighlightLabel2
        config.reading.userHighlightLabel3 = kDefaultUserHighlightLabel3
        config.reading.userHighlightLabel4 = kDefaultUserHighlightLabel4
        config.reading.userHighlightLabel5 = kDefaultUserHighlightLabel5
        config.reading.userHighlightLabel6 = kDefaultUserHighlightLabel6
        config.reading.backgroundColor = nil
        config.reading.foregroundColor = nil
        config.reading.enableMarginClickNavigation = kDefaultEnableMarginClickNavigation
        config.reading.singleColumnMode = false
        config.reading.scrollingMode = kDefaultScrollingMode
        config.reading.customCSS = nil
        config.playback.defaultPlaybackSpeed = kDefaultPlaybackSpeed
    }
}
#else
extension SettingsView {
    fileprivate var iosContent: some View {
        NavigationStack {
            Form {
                Section("General") {
                    GeneralSettingsFields(sync: $config.sync)
                }

                GeneralSettingsFields(sync: $config.sync).autoNavigateSection

                LiveReadingSyncSettingsSections()

                Section("Tab Bar") {
                    Picker("First Tab", selection: $config.library.tabBarSlot1) {
                        ForEach(ConfigurableTab.allCases) { tab in
                            Text(tab.label).tag(tab.rawValue)
                        }
                    }
                    Picker("Second Tab", selection: $config.library.tabBarSlot2) {
                        ForEach(ConfigurableTab.allCases) { tab in
                            Text(tab.label).tag(tab.rawValue)
                        }
                    }
                }

                Section {
                    Toggle("Tap Cover to Play", isOn: $config.library.tapToPlayPreferredPlayer)
                    if config.library.tapToPlayPreferredPlayer {
                        Picker(
                            "When Both Available",
                            selection: $config.library.preferAudioOverEbook,
                        ) {
                            Text("Prefer Ebook").tag(false)
                            Text("Prefer Audiobook").tag(true)
                        }
                    }
                } header: {
                    Text("Library")
                } footer: {
                    if config.library.tapToPlayPreferredPlayer {
                        Text(
                            "Tapping a book cover opens the preferred player if media is downloaded. Readaloud always takes priority. Long press to access book details via context menu."
                        )
                    } else {
                        Text(
                            "When enabled, tapping a book cover opens the preferred player instead of book details."
                        )
                    }
                }

                Section {
                    Picker("Color Level", selection: $config.library.colorMode) {
                        Text("Full").tag("full")
                        Text("Medium").tag("medium")
                        Text("Minimal").tag("minimal")
                    }
                    .pickerStyle(.segmented)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(
                            "Color Intensity: \(Int((config.library.colorIntensity * 100).rounded()))%"
                        )
                        Slider(value: $config.library.colorIntensity, in: 0...1, step: 0.05)
                            .disabled(config.library.colorMode == "minimal")
                    }
                    Toggle(
                        "Tilt Covers When Not Synced",
                        isOn: Binding(
                            get: { config.library.doubleCoverAlignment != "straight" },
                            set: {
                                config.library.doubleCoverAlignment = $0 ? "auto" : "straight"
                            },
                        ),
                    )
                } header: {
                    Text("Colorfulness")
                } footer: {
                    Text(
                        "Controls how strongly book covers tint backgrounds and controls, and whether double covers tilt apart until a book is synced."
                    )
                }

                Section("Book Sources") {
                    NavigationLink {
                        StorytellerServerSettingsView()
                    } label: {
                        Label("Book Sources", systemImage: "externaldrive")
                    }
                }

                Section {
                    NavigationLink {
                        IOSDebugLogView()
                    } label: {
                        Label("Debug Log", systemImage: "doc.text")
                    }
                }

                Section {
                    Toggle("Enable Experimental Settings", isOn: $config.library.experimentalSettings)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

private struct IOSDebugLogView: View {
    @State private var logText: String = ""
    @State private var messageCount: Int = 0
    @State private var verbose = DebugLogBuffer.shared.isVerbose

    var body: some View {
        List {
            Section {
                Toggle("Verbose logging", isOn: $verbose)
                    .onChange(of: verbose) { _, newValue in
                        DebugLogBuffer.shared.setVerbose(newValue)
                    }
            } footer: {
                Text(
                    "Includes high-volume performance diagnostics. Turn this on, reproduce the issue, then copy the log."
                )
            }

            Section {
                Text(logText)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
            } header: {
                Text("\(messageCount) messages")
            }
        }
        .navigationTitle("Debug Log")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    UIPasteboard.general.string = logText
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                Button {
                    DebugLogBuffer.shared.clear()
                    loadMessages()
                } label: {
                    Image(systemName: "trash")
                }
                Button {
                    loadMessages()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .onAppear {
            loadMessages()
        }
    }

    private func loadMessages() {
        let messages = DebugLogBuffer.shared.getMessages()
        messageCount = messages.count
        logText = messages.joined(separator: "\n")
    }
}
#endif

#if os(macOS)
private enum SettingsTab: Hashable {
    case general
    case readerSettings
    case readingBar
    case bookSources
}

private struct MacSettingsContainer<Content: View>: View {
    let tab: SettingsTab
    let content: Content

    init(tab: SettingsTab, @ViewBuilder content: () -> Content) {
        self.tab = tab
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                content
            }
            .padding(.horizontal, 36)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
    }
}

private struct MacGeneralSettingsView: View {
    @Binding var sync: StorytellerGlobalConfig.Sync
    @Binding var library: StorytellerGlobalConfig.Library
    @State private var showClearConfirmation = false
    private let labelWidth: CGFloat = 180

    private let syncIntervals: [Double] = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, -1]

    var body: some View {
        MacSettingsContainer(tab: .general) {
            VStack(alignment: .leading, spacing: 18) {
                Text("Storyteller Server Sync")
                    .font(.headline)

                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 18) {
                    GridRow {
                        label("Progress Sync Interval")
                        HStack(spacing: 12) {
                            Slider(
                                value: Binding(
                                    get: {
                                        let index = indexForInterval(
                                            sync.progressSyncIntervalSeconds
                                        )
                                        return index
                                    },
                                    set: { newIndex in
                                        let newValue = syncIntervals[Int(newIndex)]
                                        debugLog(
                                            "[SettingsView] Progress Sync SET - index: \(newIndex) -> value: \(newValue)s"
                                        )
                                        sync.progressSyncIntervalSeconds = newValue
                                    },
                                ),
                                in: 0...Double(syncIntervals.count - 1),
                                step: 1,
                            )
                            .frame(minWidth: 280, idealWidth: 320, maxWidth: 360)
                            Text(formatInterval(sync.progressSyncIntervalSeconds))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .trailing)
                        }
                    }

                    GridRow {
                        label("Metadata Refresh Interval")
                        HStack(spacing: 12) {
                            Slider(
                                value: Binding(
                                    get: {
                                        let index = indexForInterval(
                                            sync.metadataRefreshIntervalSeconds
                                        )
                                        return index
                                    },
                                    set: { newIndex in
                                        let newValue = syncIntervals[Int(newIndex)]
                                        debugLog(
                                            "[SettingsView] Metadata Refresh SET - index: \(newIndex) -> value: \(newValue)s"
                                        )
                                        sync.metadataRefreshIntervalSeconds = newValue
                                    },
                                ),
                                in: 0...Double(syncIntervals.count - 1),
                                step: 1,
                            )
                            .frame(minWidth: 280, idealWidth: 320, maxWidth: 360)
                            Text(formatInterval(sync.metadataRefreshIntervalSeconds))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .trailing)
                        }
                    }
                }

                Divider()
                    .padding(.vertical, 8)

                Toggle(
                    "Auto-navigate to server position",
                    isOn: $sync.autoSyncToNewerServerPosition,
                )
                .help(
                    "When the server has a newer reading position (from another device), automatically jump to that position."
                )

                Divider()
                    .padding(.vertical, 8)

                MacLiveReadingSyncSettings()

                Divider()
                    .padding(.vertical, 8)

                Text("Colorfulness")
                    .font(.headline)

                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 18) {
                    GridRow {
                        label("Color Level")
                        Picker("", selection: $library.colorMode) {
                            Text("Full").tag("full")
                            Text("Medium").tag("medium")
                            Text("Minimal").tag("minimal")
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        .frame(width: 280, alignment: .leading)
                    }

                    GridRow {
                        label("Color Intensity")
                        HStack(spacing: 12) {
                            Slider(value: $library.colorIntensity, in: 0...1, step: 0.05)
                                .frame(minWidth: 280, idealWidth: 320, maxWidth: 360)
                                .disabled(library.colorMode == "minimal")
                            Text("\(Int((library.colorIntensity * 100).rounded()))%")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .trailing)
                        }
                    }
                }
                .help(
                    "How strongly book covers tint backgrounds and controls in book views."
                )

                Toggle(
                    "Tilt covers when not synced",
                    isOn: Binding(
                        get: { library.doubleCoverAlignment != "straight" },
                        set: { library.doubleCoverAlignment = $0 ? "auto" : "straight" },
                    ),
                )
                .help(
                    "In the double-cover style, tilt the ebook and audiobook covers apart until the book has a synced readaloud alignment."
                )

            }

        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .frame(width: labelWidth, alignment: .trailing)
            .foregroundStyle(.secondary)
    }

    private func indexForInterval(_ seconds: Double) -> Double {
        if let index = syncIntervals.firstIndex(of: seconds) {
            return Double(index)
        }
        if seconds < 0 {
            return Double(syncIntervals.count - 1)
        }
        let closest = syncIntervals.enumerated().min(by: {
            abs($0.element - seconds) < abs($1.element - seconds)
        })
        return Double(closest?.offset ?? 0)
    }

    private func formatInterval(_ seconds: Double) -> String {
        if seconds < 0 {
            return "Never"
        }
        let s = Int(seconds)
        if s < 60 {
            return "\(s)s"
        } else if s < 3600 {
            return "\(s / 60)m"
        } else {
            return "\(s / 3600)h"
        }
    }
}

private struct MacBookSourcesSettingsView: View {
    var body: some View {
        StorytellerServerSettingsView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MacReaderSettingsView: View {
    @Binding var reading: StorytellerGlobalConfig.Reading
    @Binding var playback: StorytellerGlobalConfig.Playback
    @Binding var themes: StorytellerGlobalConfig.Themes
    private let labelWidth: CGFloat = 150
    @State private var customFamilies: [CustomFontFamily] = []
    @State private var showFontManager = false
    @State private var showManageThemes = false
    @Environment(\.colorScheme) private var colorScheme

    private func isCustomFont(_ fontFamily: String) -> Bool {
        !builtInFonts.contains(fontFamily)
    }

    private var builtInFonts: [String] {
        CustomFontsActor.bundledFamilies
    }

    var body: some View {
        MacSettingsContainer(tab: .readerSettings) {
            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 18) {
                GridRow {
                    label("Font Size")
                    Stepper(value: $reading.fontSize, in: 8...60, step: 1) {
                        Text("\(Int(reading.fontSize)) pt")
                    }
                    .frame(width: 200, alignment: .leading)
                }

                GridRow {
                    label("")
                    HStack(spacing: 48) {
                        Toggle("Single Column", isOn: singleColumnBinding)
                            .frame(width: 180, alignment: .leading)
                            .disabled(reading.scrollingMode)

                        Toggle("Scrolling Mode", isOn: $reading.scrollingMode)
                            .frame(width: 240, alignment: .leading)
                    }
                }

                GridRow {
                    label("Text Alignment")
                    Picker("", selection: $reading.textAlignment) {
                        Image(systemName: "text.alignleft").tag("left")
                        Image(systemName: "text.justify").tag("justify")
                        Image(systemName: "text.alignright").tag("right")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(width: 200, alignment: .leading)
                }

                GridRow {
                    label("Font")
                    HStack(spacing: 12) {
                        Picker("", selection: $reading.fontFamily) {
                            ForEach(CustomFontsActor.bundledFamilies, id: \.self) { family in
                                Text(family).tag(family)
                            }

                            if !customFamilies.isEmpty {
                                Divider()
                                ForEach(customFamilies) { family in
                                    Text(family.name).tag(family.name)
                                }
                            }

                            if isCustomFont(reading.fontFamily)
                                && !customFamilies.contains(where: { $0.name == reading.fontFamily }
                                )
                            {
                                Divider()
                                Text(reading.fontFamily).tag(reading.fontFamily)
                            }
                        }
                        .labelsHidden()
                        .frame(width: 180)

                        Button("Import...") {
                            importFont()
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.blue)

                        if !customFamilies.isEmpty {
                            Button("Manage...") {
                                showFontManager = true
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.blue)
                            .popover(isPresented: $showFontManager) {
                                CustomFontManagerView(
                                    customFamilies: $customFamilies,
                                    selectedFont: $reading.fontFamily,
                                )
                            }
                        }
                    }
                }

                GridRow {
                    label("Margin (Left/Right)")
                    MacSliderControl(
                        value: $reading.marginLeftRight,
                        range: 0...30,
                        step: 1,
                        formatter: { String(format: "%.0f%%", $0) },
                    )
                }

                GridRow {
                    label("Margin (Top)")
                    MacSliderControl(
                        value: $reading.marginTop,
                        range: 0...30,
                        step: 1,
                        formatter: { String(format: "%.0f%%", $0) },
                    )
                }

                GridRow {
                    label("Margin (Bottom)")
                    MacSliderControl(
                        value: $reading.marginBottom,
                        range: 0...30,
                        step: 1,
                        formatter: { String(format: "%.0f%%", $0) },
                    )
                }

                GridRow {
                    label("Line Spacing")
                    MacSliderControl(
                        value: $reading.lineSpacing,
                        range: 1.0...2.5,
                        step: 0.1,
                        formatter: { String(format: "%.1f", $0) },
                    )
                }

                GridRow {
                    label("Word Spacing")
                    MacSliderControl(
                        value: $reading.wordSpacing,
                        range: -0.5...2.0,
                        step: 0.1,
                        formatter: { String(format: "%.1fem", $0) },
                    )
                }

                GridRow {
                    label("Letter Spacing")
                    MacSliderControl(
                        value: $reading.letterSpacing,
                        range: -0.1...0.5,
                        step: 0.01,
                        formatter: { String(format: "%.2fem", $0) },
                    )
                }

                GridRow {
                    label("Playback Speed")
                    MacSliderControl(
                        value: $playback.defaultPlaybackSpeed,
                        range: 0.5...3.0,
                        step: 0.05,
                        formatter: { String(format: "%.2fx", $0) },
                    )
                }
            }

            Divider()
                .padding(.vertical, 8)

            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Themes")
                        .font(.headline)

                    Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 18) {
                        GridRow {
                            label("Light Mode Theme")
                            themePickerView(
                                selection: $themes.selectedLightThemeId,
                                themes: ReaderTheme.themesForLightMode(
                                    customThemes: themes.customThemes,
                                    builtInOverrides: themes.builtInThemeOverrides,
                                ),
                            )
                            .onChange(of: themes.selectedLightThemeId) { _, _ in
                                applyActiveThemeToReading()
                            }
                        }

                        GridRow {
                            label("Dark Mode Theme")
                            themePickerView(
                                selection: $themes.selectedDarkThemeId,
                                themes: ReaderTheme.themesForDarkMode(
                                    customThemes: themes.customThemes,
                                    builtInOverrides: themes.builtInThemeOverrides,
                                ),
                            )
                            .onChange(of: themes.selectedDarkThemeId) { _, _ in
                                applyActiveThemeToReading()
                            }
                        }
                    }

                    Button {
                        showManageThemes = true
                    } label: {
                        Label("Manage Themes...", systemImage: "paintpalette")
                    }
                    .buttonStyle(.bordered)
                }
                .sheet(isPresented: $showManageThemes) {
                    macManageThemesSheet
                }

                Divider()
                    .padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 18) {
                    Text("Navigation")
                        .font(.headline)

                    Toggle(
                        "Enable margin click to turn pages",
                        isOn: $reading.enableMarginClickNavigation,
                    )
                    .help(
                        "Click on the left or right margins of the page to navigate between pages"
                    )
                }
            }
        }
        .task {
            await loadCustomFonts()
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .frame(width: labelWidth, alignment: .trailing)
            .foregroundStyle(.secondary)
    }

    private var singleColumnBinding: Binding<Bool> {
        Binding(
            get: { reading.singleColumnMode || reading.scrollingMode },
            set: { reading.singleColumnMode = $0 },
        )
    }

    @ViewBuilder
    private func themePickerView(
        selection: Binding<String>,
        themes: [ReaderTheme],
    ) -> some View {
        Picker("", selection: selection) {
            ForEach(themes) { theme in
                Text(theme.name).tag(theme.id)
            }
        }
        .labelsHidden()
        .frame(width: 260)
    }

    private func applyActiveThemeToReading() {
        let activeId =
            colorScheme == .dark
            ? themes.selectedDarkThemeId
            : themes.selectedLightThemeId
        guard
            let theme = ReaderTheme.resolve(
                id: activeId,
                customThemes: themes.customThemes,
                builtInOverrides: themes.builtInThemeOverrides,
            )
        else {
            return
        }
        reading.apply(theme: theme)
    }

    private var macManageThemesSheet: some View {
        MacManageThemesView(themes: $themes, reading: $reading)
    }

    private func loadCustomFonts() async {
        await CustomFontsActor.shared.refreshFonts()
        customFamilies = await CustomFontsActor.shared.availableFamilies
    }

    private func importFont() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.font]

        if panel.runModal() == .OK {
            Task {
                for url in panel.urls {
                    try? await CustomFontsActor.shared.importFont(from: url)
                }
                await loadCustomFonts()
            }
        }
    }
}

private struct MacManageThemesView: View {
    @Binding var themes: StorytellerGlobalConfig.Themes
    @Binding var reading: StorytellerGlobalConfig.Reading
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var editingTheme: ReaderTheme? = nil
    @State private var renamingThemeId: String? = nil
    @State private var renameText: String = ""

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    ForEach(ReaderTheme.effectiveBuiltIn(overrides: themes.builtInThemeOverrides)) {
                        theme in
                        themeRow(theme)
                    }
                    if !themes.customThemes.isEmpty {
                        Divider()
                        ForEach(themes.customThemes) { theme in
                            themeRow(theme)
                        }
                    }
                }
            }
            .listStyle(.inset(alternatesRowBackgrounds: true))
            .frame(minWidth: 500, minHeight: 500)

            Divider()
            HStack {
                newThemeMenu
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(12)
        }
        .sheet(item: $editingTheme) { theme in
            MacThemeEditorSheet(theme: theme, themes: $themes, reading: $reading)
        }
    }

    private var newThemeMenu: some View {
        let allThemes =
            ReaderTheme.effectiveBuiltIn(overrides: themes.builtInThemeOverrides)
            + themes.customThemes
        return Menu {
            ForEach(allThemes) { theme in
                Button("From \"\(theme.name)\"") {
                    let newTheme = duplicateTheme(theme)
                    editingTheme = newTheme
                }
            }
        } label: {
            Label("New Theme", systemImage: "plus")
        }
    }

    @ViewBuilder
    private func themeRow(_ theme: ReaderTheme) -> some View {
        HStack(spacing: 12) {
            Button {
                editingTheme = theme
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(hex: theme.backgroundColor) ?? .white)
                            .frame(width: 32, height: 32)
                        Text("Aa")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color(hex: theme.foregroundColor) ?? .black)
                    }
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 1)
                    )

                    VStack(alignment: .leading, spacing: 2) {
                        if renamingThemeId == theme.id {
                            TextField("Theme Name", text: $renameText)
                                .textFieldStyle(.roundedBorder)
                                .onSubmit { commitRename(theme) }
                        } else {
                            Text(theme.name).fontWeight(.medium)
                        }
                        HStack(spacing: 4) {
                            Text(theme.readaloudHighlightMode.capitalized + " highlight")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if !theme.isBuiltIn {
                                Text(appearanceLabel(theme.appearance))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(3)
                            }
                            if theme.isBuiltIn, isBuiltInEdited(theme.id) {
                                Text("Edited")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(3)
                            }
                        }
                    }

                    Spacer()

                    if themes.selectedLightThemeId == theme.id {
                        Image(systemName: "sun.max.fill")
                            .font(.caption).foregroundStyle(.orange)
                    }
                    if themes.selectedDarkThemeId == theme.id {
                        Image(systemName: "moon.fill")
                            .font(.caption).foregroundStyle(.indigo)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Menu {
                if theme.availableFor(colorScheme: "light") {
                    Button {
                        themes.selectedLightThemeId = theme.id
                    } label: {
                        Label("Use for Light Mode", systemImage: "sun.max")
                    }
                }
                if theme.availableFor(colorScheme: "dark") {
                    Button {
                        themes.selectedDarkThemeId = theme.id
                    } label: {
                        Label("Use for Dark Mode", systemImage: "moon")
                    }
                }
                Divider()
                Button {
                    let dup = duplicateTheme(theme)
                    editingTheme = dup
                } label: {
                    Label("Duplicate", systemImage: "doc.on.doc")
                }
                if theme.isBuiltIn, isBuiltInEdited(theme.id) {
                    Button {
                        resetBuiltInTheme(theme.id)
                    } label: {
                        Label("Reset to Stock", systemImage: "arrow.counterclockwise")
                    }
                }
                if !theme.isBuiltIn {
                    Button {
                        renamingThemeId = theme.id
                        renameText = theme.name
                    } label: {
                        Label("Rename", systemImage: "pencil")
                    }
                    Divider()
                    Button(role: .destructive) {
                        deleteTheme(id: theme.id)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
        .padding(.vertical, 2)
    }

    private func duplicateTheme(_ source: ReaderTheme) -> ReaderTheme {
        let allNames = (ReaderTheme.allBuiltIn + themes.customThemes).map(\.name)
        let newTheme = ReaderTheme(
            name: uniqueCopyName(for: source.name, existing: allNames),
            isBuiltIn: false,
            appearance: source.appearance,
            backgroundColor: source.backgroundColor,
            foregroundColor: source.foregroundColor,
            highlightColor: source.highlightColor,
            highlightThickness: source.highlightThickness,
            readaloudHighlightMode: source.readaloudHighlightMode,
            readaloudHighlightFade: source.readaloudHighlightFade,
            readaloudTextItalic: source.readaloudTextItalic,
            readaloudTextBold: source.readaloudTextBold,
            readaloudUnderlineStyle: source.readaloudUnderlineStyle,
            userHighlightColor1: source.userHighlightColor1,
            userHighlightColor2: source.userHighlightColor2,
            userHighlightColor3: source.userHighlightColor3,
            userHighlightColor4: source.userHighlightColor4,
            userHighlightColor5: source.userHighlightColor5,
            userHighlightColor6: source.userHighlightColor6,
            userHighlightLabel1: source.userHighlightLabel1,
            userHighlightLabel2: source.userHighlightLabel2,
            userHighlightLabel3: source.userHighlightLabel3,
            userHighlightLabel4: source.userHighlightLabel4,
            userHighlightLabel5: source.userHighlightLabel5,
            userHighlightLabel6: source.userHighlightLabel6,
            userHighlightMode: source.userHighlightMode,
            customCSS: source.customCSS,
        )
        themes.customThemes.append(newTheme)
        return newTheme
    }

    private func uniqueCopyName(for baseName: String, existing: [String]) -> String {
        let candidate = "\(baseName) Copy"
        if !existing.contains(candidate) { return candidate }
        var n = 2
        while existing.contains("\(baseName) Copy \(n)") { n += 1 }
        return "\(baseName) Copy \(n)"
    }

    private func deleteTheme(id: String) {
        themes.customThemes.removeAll { $0.id == id }
        if themes.selectedLightThemeId == id {
            themes.selectedLightThemeId = "builtin-light"
        }
        if themes.selectedDarkThemeId == id {
            themes.selectedDarkThemeId = "builtin-dark"
        }
    }

    private func isBuiltInEdited(_ id: String) -> Bool {
        themes.builtInThemeOverrides.contains { $0.id == id }
    }

    private func resetBuiltInTheme(_ id: String) {
        themes.builtInThemeOverrides.removeAll { $0.id == id }
        let activeId =
            colorScheme == .dark
            ? themes.selectedDarkThemeId
            : themes.selectedLightThemeId
        if activeId == id, let stock = ReaderTheme.allBuiltIn.first(where: { $0.id == id }) {
            reading.apply(theme: stock)
        }
    }

    private func appearanceLabel(_ appearance: ThemeAppearance) -> String {
        switch appearance {
            case .light: return "Light only"
            case .dark: return "Dark only"
            case .any: return "Both"
        }
    }

    private func commitRename(_ theme: ReaderTheme) {
        let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !theme.isBuiltIn else {
            renamingThemeId = nil
            return
        }
        if let idx = themes.customThemes.firstIndex(where: { $0.id == theme.id }) {
            themes.customThemes[idx].name = trimmed
        }
        renamingThemeId = nil
    }
}

private struct MacThemeEditorSheet: View {
    let theme: ReaderTheme
    @Binding var themes: StorytellerGlobalConfig.Themes
    @Binding var reading: StorytellerGlobalConfig.Reading
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var draft: ReaderTheme
    @State private var tab: ThemeEditorTab = .theme
    @State private var previewUserIndex = 0

    init(
        theme: ReaderTheme,
        themes: Binding<StorytellerGlobalConfig.Themes>,
        reading: Binding<StorytellerGlobalConfig.Reading>,
    ) {
        self.theme = theme
        self._themes = themes
        self._reading = reading
        self._draft = State(initialValue: theme)
    }

    private var isBuiltInEdit: Bool { theme.isBuiltIn }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 12) {
                ThemePreviewCard(theme: draft, previewUserColor: previewUserColor)
                    .padding(.horizontal)
                    .padding(.top, 12)

                Picker("Section", selection: $tab) {
                    ForEach(ThemeEditorTab.allCases) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.horizontal)

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        switch tab {
                            case .theme: themeTab
                            case .readaloud: readaloudTab
                            case .highlights: highlightsTab
                            case .advanced: advancedTab
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                }
            }
            .frame(minWidth: 550, minHeight: 560)

            Divider()
            HStack {
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { saveTheme() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(12)
        }
    }

    @ViewBuilder
    private var themeTab: some View {
        if isBuiltInEdit {
            Text(
                "This built-in theme stays available in its appearance mode. "
                    + "Restore the stock look anytime with Reset to Stock in Manage Themes."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Theme Name").font(.headline)
                TextField("Theme Name", text: $draft.name)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 300)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Show In").font(.headline)
                Picker("Show In", selection: $draft.appearance) {
                    Text("Light & Dark").tag(ThemeAppearance.any)
                    Text("Light Only").tag(ThemeAppearance.light)
                    Text("Dark Only").tag(ThemeAppearance.dark)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 300)
                .labelsHidden()
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            Text("Reader Colors").font(.headline)
            macColorRow(label: "Background", hex: $draft.backgroundColor)
            macColorRow(label: "Text", hex: $draft.foregroundColor)
        }
    }

    private var readaloudTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Readaloud Highlight").font(.headline)
            Picker("Style", selection: $draft.readaloudHighlightMode) {
                Text("Background").tag("background")
                Text("Text").tag("text")
                Text("Underline").tag("underline")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 300)
            .labelsHidden()

            macColorRow(label: "Highlight Color", hex: $draft.highlightColor)

            if draft.readaloudHighlightMode == "background" {
                HStack(spacing: 8) {
                    Text("Highlight Height")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Slider(value: $draft.highlightThickness, in: 0.6...4.0)
                        .frame(width: 120)
                    Text(String(format: "%.1fx", draft.highlightThickness))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var highlightsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("User Highlight Colors").font(.headline)
            Picker("Style", selection: $draft.userHighlightMode) {
                Text("Background").tag("background")
                Text("Text").tag("text")
                Text("Underline").tag("underline")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 300)
            .labelsHidden()

            macLabeledColorRow(
                label: $draft.userHighlightLabel1,
                hex: $draft.userHighlightColor1,
            )
            macLabeledColorRow(
                label: $draft.userHighlightLabel2,
                hex: $draft.userHighlightColor2,
            )
            macLabeledColorRow(
                label: $draft.userHighlightLabel3,
                hex: $draft.userHighlightColor3,
            )
            macLabeledColorRow(
                label: $draft.userHighlightLabel4,
                hex: $draft.userHighlightColor4,
            )
            macLabeledColorRow(
                label: $draft.userHighlightLabel5,
                hex: $draft.userHighlightColor5,
            )
            macLabeledColorRow(
                label: $draft.userHighlightLabel6,
                hex: $draft.userHighlightColor6,
            )
        }
        .onChange(of: draft.userHighlightColor1) { _, _ in previewUserIndex = 0 }
        .onChange(of: draft.userHighlightColor2) { _, _ in previewUserIndex = 1 }
        .onChange(of: draft.userHighlightColor3) { _, _ in previewUserIndex = 2 }
        .onChange(of: draft.userHighlightColor4) { _, _ in previewUserIndex = 3 }
        .onChange(of: draft.userHighlightColor5) { _, _ in previewUserIndex = 4 }
        .onChange(of: draft.userHighlightColor6) { _, _ in previewUserIndex = 5 }
    }

    private var advancedTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Custom CSS").font(.headline)
            TextEditor(
                text: Binding(
                    get: { draft.customCSS ?? "" },
                    set: { draft.customCSS = $0.isEmpty ? nil : $0 },
                )
            )
            .font(.system(.body, design: .monospaced))
            .frame(height: 100)
            .border(Color.secondary.opacity(0.3), width: 1)
        }
    }

    private var previewUserColor: String {
        switch previewUserIndex {
            case 1: return draft.userHighlightColor2
            case 2: return draft.userHighlightColor3
            case 3: return draft.userHighlightColor4
            case 4: return draft.userHighlightColor5
            case 5: return draft.userHighlightColor6
            default: return draft.userHighlightColor1
        }
    }

    @ViewBuilder
    private func macColorRow(label: String, hex: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .trailing)

            ColorPicker(
                "",
                selection: Binding(
                    get: { Color(hex: hex.wrappedValue) ?? .gray },
                    set: { newColor in
                        if let newHex = newColor.hexString() {
                            hex.wrappedValue = newHex
                        }
                    },
                ),
                supportsOpacity: false,
            )
            .labelsHidden()
            .frame(width: 48, height: 28)

            TextField("#RRGGBB", text: hex)
                .textFieldStyle(.roundedBorder)
                .font(.system(.body, design: .monospaced))
                .frame(maxWidth: 100)
        }
    }

    @ViewBuilder
    private func macLabeledColorRow(label: Binding<String>, hex: Binding<String>) -> some View {
        HStack(spacing: 12) {
            TextField("Label", text: label)
                .textFieldStyle(.roundedBorder)
                .frame(width: 120)

            ColorPicker(
                "",
                selection: Binding(
                    get: { Color(hex: hex.wrappedValue) ?? .gray },
                    set: { newColor in
                        if let newHex = newColor.hexString() {
                            hex.wrappedValue = newHex
                        }
                    },
                ),
                supportsOpacity: false,
            )
            .labelsHidden()
            .frame(width: 48, height: 28)

            TextField("#RRGGBB", text: hex)
                .textFieldStyle(.roundedBorder)
                .font(.system(.body, design: .monospaced))
                .frame(maxWidth: 100)
        }
    }

    private func saveTheme() {
        if isBuiltInEdit {
            // Overrides keep the stock name and appearance so Reset to Stock
            // can always restore the theme without identity changes.
            if let stock = ReaderTheme.allBuiltIn.first(where: { $0.id == draft.id }) {
                draft.name = stock.name
                draft.appearance = stock.appearance
                if let idx = themes.builtInThemeOverrides.firstIndex(where: { $0.id == draft.id }
                ) {
                    themes.builtInThemeOverrides[idx] = draft
                } else {
                    themes.builtInThemeOverrides.append(draft)
                }
            }
        } else {
            if let idx = themes.customThemes.firstIndex(where: { $0.id == draft.id }) {
                themes.customThemes[idx] = draft
            }
            if !draft.availableFor(colorScheme: "light")
                && themes.selectedLightThemeId == draft.id
            {
                themes.selectedLightThemeId = "builtin-light"
            }
            if !draft.availableFor(colorScheme: "dark") && themes.selectedDarkThemeId == draft.id {
                themes.selectedDarkThemeId = "builtin-dark"
            }
        }
        let activeId =
            colorScheme == .dark
            ? themes.selectedDarkThemeId
            : themes.selectedLightThemeId
        if activeId == draft.id {
            reading.apply(theme: draft)
        }
        dismiss()
    }

}

extension StorytellerGlobalConfig.Reading {
    fileprivate mutating func apply(theme: ReaderTheme) {
        backgroundColor = theme.backgroundColor
        foregroundColor = theme.foregroundColor
        highlightColor = theme.highlightColor
        highlightThickness = theme.highlightThickness
        readaloudHighlightMode = theme.readaloudHighlightMode
        userHighlightColor1 = theme.userHighlightColor1
        userHighlightColor2 = theme.userHighlightColor2
        userHighlightColor3 = theme.userHighlightColor3
        userHighlightColor4 = theme.userHighlightColor4
        userHighlightColor5 = theme.userHighlightColor5
        userHighlightColor6 = theme.userHighlightColor6
        userHighlightLabel1 = theme.userHighlightLabel1
        userHighlightLabel2 = theme.userHighlightLabel2
        userHighlightLabel3 = theme.userHighlightLabel3
        userHighlightLabel4 = theme.userHighlightLabel4
        userHighlightLabel5 = theme.userHighlightLabel5
        userHighlightLabel6 = theme.userHighlightLabel6
        userHighlightMode = theme.userHighlightMode
        customCSS = theme.customCSS
    }
}

private struct CustomFontManagerView: View {
    @Binding var customFamilies: [CustomFontFamily]
    @Binding var selectedFont: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Custom Fonts")
                .font(.headline)

            if customFamilies.isEmpty {
                Text("No custom fonts imported")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(customFamilies) { family in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(family.name)
                                .fontWeight(.medium)
                            Text(
                                "(\(family.variants.count) variant\(family.variants.count == 1 ? "" : "s"))"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            Spacer()
                            Button {
                                deleteFamily(family)
                            } label: {
                                Image(systemName: "trash")
                                    .foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                            .help("Delete all variants of \(family.name)")
                        }

                        ForEach(family.variants) { variant in
                            HStack {
                                Text(variant.styleDescription)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(.leading, 16)
                                Spacer()
                                Button {
                                    deleteVariant(variant, from: family)
                                } label: {
                                    Image(systemName: "xmark.circle")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                                .help("Delete \(variant.styleDescription)")
                            }
                        }
                    }

                    if family.id != customFamilies.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .frame(minWidth: 300)
    }

    private func deleteFamily(_ family: CustomFontFamily) {
        Task {
            if selectedFont == family.name {
                selectedFont = kDefaultFontFamily
            }
            try? await CustomFontsActor.shared.deleteFamily(family)
            await MainActor.run {
                customFamilies.removeAll { $0.id == family.id }
            }
        }
    }

    private func deleteVariant(_ variant: CustomFontVariant, from family: CustomFontFamily) {
        Task {
            try? await CustomFontsActor.shared.deleteVariant(variant)
            await MainActor.run {
                if let familyIndex = customFamilies.firstIndex(where: { $0.id == family.id }) {
                    customFamilies[familyIndex].variants.removeAll { $0.id == variant.id }
                    if customFamilies[familyIndex].variants.isEmpty {
                        if selectedFont == family.name {
                            selectedFont = kDefaultFontFamily
                        }
                        customFamilies.remove(at: familyIndex)
                    }
                }
            }
        }
    }
}

private struct MacReadingBarSettingsView: View {
    @Binding var readingBar: StorytellerGlobalConfig.ReadingBar

    var body: some View {
        MacSettingsContainer(tab: .readingBar) {
            VStack(alignment: .leading, spacing: 18) {
                Toggle("Enable Dock Stats", isOn: $readingBar.enabled)
                    .font(.headline)

                Divider()

                Group {
                    DebouncedOpacitySlider(value: $readingBar.dockTransparency)

                    Toggle("Show Player Controls", isOn: $readingBar.showPlayerControls)
                    Toggle("Show Progress Bar", isOn: $readingBar.showProgressBar)
                    Toggle("Show Page Number in Chapter", isOn: $readingBar.showPageNumber)
                    Toggle("Show Book Progress (%)", isOn: $readingBar.showProgress)
                    Toggle(
                        "Show Time Remaining in Chapter",
                        isOn: $readingBar.showTimeRemainingInChapter,
                    )
                    Toggle(
                        "Show Time Remaining in Book",
                        isOn: $readingBar.showTimeRemainingInBook,
                    )
                }
                .disabled(!readingBar.enabled)
                .opacity(readingBar.enabled ? 1.0 : 0.5)
            }
        }
    }
}

private struct MacSliderControl: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let formatter: (Double) -> String
    @State private var localValue: Double = 0
    @State private var debounceTask: Task<Void, Never>?
    @State private var isUpdatingFromSlider = false

    var body: some View {
        HStack(spacing: 12) {
            Slider(value: $localValue, in: range, step: step)
                .frame(minWidth: 280, idealWidth: 320, maxWidth: 360)
                .onAppear {
                    localValue = value
                }
                .onChange(of: localValue) { _, newValue in
                    debounceTask?.cancel()
                    debounceTask = Task {
                        try? await Task.sleep(for: .milliseconds(300))
                        guard !Task.isCancelled else { return }
                        await MainActor.run {
                            isUpdatingFromSlider = true
                            value = newValue
                            isUpdatingFromSlider = false
                        }
                    }
                }
                .onChange(of: value) { _, newValue in
                    guard !isUpdatingFromSlider else { return }
                    localValue = newValue
                }
            Text(formatter(localValue))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .trailing)
        }
    }
}

#endif

private struct DebouncedOpacitySlider: View {
    @Binding var value: Double
    @State private var localValue: Double = 0
    @State private var debounceTask: Task<Void, Never>?
    @State private var isUpdatingFromSlider = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Opacity: \(Int(localValue * 100))%")
                .font(.subheadline)
            Slider(value: $localValue, in: 0.1...1.0, step: 0.01)
                .onAppear {
                    localValue = value
                }
                .onChange(of: localValue) { _, newValue in
                    debounceTask?.cancel()
                    debounceTask = Task {
                        try? await Task.sleep(for: .milliseconds(150))
                        guard !Task.isCancelled else { return }
                        await MainActor.run {
                            isUpdatingFromSlider = true
                            value = newValue
                            isUpdatingFromSlider = false
                        }
                    }
                }
                .onChange(of: value) { _, newValue in
                    guard !isUpdatingFromSlider else { return }
                    localValue = newValue
                }
        }
    }
}

private struct GeneralSettingsFields: View {
    @Binding var sync: StorytellerGlobalConfig.Sync
    @State private var showClearConfirmation = false

    private let syncIntervals: [Double] = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, -1]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Progress Sync Interval")
                .font(.subheadline)
                .foregroundStyle(.primary)
            HStack(spacing: 12) {
                Picker(
                    "",
                    selection: Binding(
                        get: { sync.progressSyncIntervalSeconds },
                        set: { sync.progressSyncIntervalSeconds = $0 },
                    ),
                ) {
                    ForEach(syncIntervals, id: \.self) { interval in
                        Text(formatInterval(interval)).tag(interval)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
        }

        VStack(alignment: .leading, spacing: 8) {
            Text("Metadata Refresh Interval")
                .font(.subheadline)
                .foregroundStyle(.primary)
            HStack(spacing: 12) {
                Picker(
                    "",
                    selection: Binding(
                        get: { sync.metadataRefreshIntervalSeconds },
                        set: { sync.metadataRefreshIntervalSeconds = $0 },
                    ),
                ) {
                    ForEach(syncIntervals, id: \.self) { interval in
                        Text(formatInterval(interval)).tag(interval)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
        }

    }

    var autoNavigateSection: some View {
        Section {
            Toggle(
                "Auto-navigate to server position",
                isOn: $sync.autoSyncToNewerServerPosition,
            )
        } footer: {
            Text(
                "When the server has a newer reading position (from another device), automatically jump to that position."
            )
        }
    }

    private func formatInterval(_ seconds: Double) -> String {
        if seconds < 0 {
            return "Never"
        }
        let s = Int(seconds)
        if s < 60 {
            return "\(s) seconds"
        } else if s < 3600 {
            let m = s / 60
            return "\(m) minute\(m == 1 ? "" : "s")"
        } else {
            let h = s / 3600
            return "\(h) hour\(h == 1 ? "" : "s")"
        }
    }
}

extension Color {
    init?(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard cleaned.count == 6 else { return nil }

        var value: UInt64 = 0
        guard Scanner(string: cleaned).scanHexInt64(&value) else { return nil }

        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0

        self = Color(red: r, green: g, blue: b)
    }

    #if os(macOS)
    func hexString() -> String? {
        let nsColor = NSColor(self)
        if let converted = nsColor.usingColorSpace(.sRGB) {
            let r = Int(round(converted.redComponent * 255))
            let g = Int(round(converted.greenComponent * 255))
            let b = Int(round(converted.blueComponent * 255))
            return String(format: "#%02X%02X%02X", r, g, b)
        }
        if let converted = nsColor.usingColorSpace(.deviceRGB) {
            let r = Int(round(converted.redComponent * 255))
            let g = Int(round(converted.greenComponent * 255))
            let b = Int(round(converted.blueComponent * 255))
            return String(format: "#%02X%02X%02X", r, g, b)
        }
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        nsColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
    #else
    func hexString() -> String? {
        let uiColor = UIColor(self)
        guard
            let converted = uiColor.cgColor.converted(
                to: CGColorSpace(name: CGColorSpace.sRGB)!,
                intent: .defaultIntent,
                options: nil,
            ),
            let components = converted.components
        else {
            return nil
        }
        let r = components.count > 0 ? components[0] : 0
        let g = components.count > 1 ? components[1] : 0
        let b = components.count > 2 ? components[2] : 0
        return String(
            format: "#%02X%02X%02X",
            Int(round(r * 255)),
            Int(round(g * 255)),
            Int(round(b * 255)),
        )
    }
    #endif
}

#endif
