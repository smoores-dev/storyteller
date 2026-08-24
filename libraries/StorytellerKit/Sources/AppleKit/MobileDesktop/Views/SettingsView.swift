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
    @State private var selectedTab: SettingsTab = .general
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
                #if os(macOS)
                try await SettingsActor.shared.updateConfig(
                    progressSyncIntervalSeconds: newValue.sync.progressSyncIntervalSeconds,
                    metadataRefreshIntervalSeconds: newValue.sync.metadataRefreshIntervalSeconds,
                    autoSyncToNewerServerPosition: newValue.sync.autoSyncToNewerServerPosition,
                    colorMode: newValue.library.colorMode,
                    colorIntensity: newValue.library.colorIntensity,
                    doubleCoverAlignment: newValue.library.doubleCoverAlignment,
                    experimentalSettings: newValue.library.experimentalSettings,
                    progressBadgeBackground: newValue.library.progressBadgeBackground,
                )
                #else
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
                    readaloudHighlightFade: newValue.reading.readaloudHighlightFade,
                    coverStrengthBackground: newValue.reading.coverStrengthBackground,
                    coverStrengthForeground: newValue.reading.coverStrengthForeground,
                    coverStrengthHighlight: newValue.reading.coverStrengthHighlight,
                    readaloudTextItalic: newValue.reading.readaloudTextItalic,
                    readaloudTextBold: newValue.reading.readaloudTextBold,
                    readaloudUnderlineStyle: newValue.reading.readaloudUnderlineStyle,
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
                    progressBadgeBackground: newValue.library.progressBadgeBackground,
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
                    builtInThemeOverrides: newValue.themes.builtInThemeOverrides,
                )
                #endif
            } catch {
                await MainActor.run {
                    saveError = error.localizedDescription
                }
            }
        }
    }

    private func resetAllSettings() {
        #if os(macOS)
        persistTask?.cancel()
        persistTask = nil
        Task {
            do {
                try await SettingsActor.shared.resetConfig()
                await reloadConfigNow()
            } catch {
                await MainActor.run {
                    saveError = error.localizedDescription
                }
            }
        }
        #else
        config = StorytellerGlobalConfig()
        #endif
    }

    #if os(macOS)
    private func reloadConfigNow() async {
        let loaded = await SettingsActor.shared.config
        await MainActor.run {
            isReloadingFromActor = true
            config = loaded
            isReloadingFromActor = false
        }
    }
    #endif
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

                MacBookSourcesSettingsView()
                    .tabItem {
                        Label("Book Sources", systemImage: "externaldrive")
                    }
                    .tag(SettingsTab.bookSources)
            }

            Divider()

            HStack {
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

                    if config.library.experimentalSettings {
                        Toggle(
                            "Progress Badge Backdrop",
                            isOn: $config.library.progressBadgeBackground,
                        )
                    }
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

                Divider()

                Toggle(
                    "Enable Experimental Settings",
                    isOn: $library.experimentalSettings,
                )

                if library.experimentalSettings {
                    Toggle(
                        "Progress Badge Backdrop",
                        isOn: $library.progressBadgeBackground,
                    )
                    .help(
                        "Draw a shaded disc behind the circular progress badge on library covers."
                    )
                }

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

#endif

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
