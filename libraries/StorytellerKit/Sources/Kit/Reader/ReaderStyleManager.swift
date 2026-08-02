import Foundation
import Observation

@StorytellerUIActor
@Observable
public final class ReaderStyleManager {
    private weak var bridge: ReaderCommsBridge?
    private var settingsVM: any ReaderSettingsReading
    private var isDarkMode = false
    private var styleUpdateTask: Task<Void, Never>?
    private var fontFaceCSS: String = ""
    private var hasAudioNarration = false
    @ObservationIgnored private var fontObserverID: UUID?

    public init(settingsVM: any ReaderSettingsReading, bridge: ReaderCommsBridge) {
        self.settingsVM = settingsVM
        self.bridge = bridge
        setupSettingsObserver()
        Task {
            await refreshFontFaceCSS()
            await registerFontObserver()
        }
    }

    private func registerFontObserver() async {
        fontObserverID = await CustomFontsActor.shared.addObserver { @StorytellerUIActor [weak self] in
            guard let self else { return }
            Task { @StorytellerUIActor in
                self.fontFaceCSS = await CustomFontsActor.shared.fontFaceCSS
                await self.sendStyleUpdate()
            }
        }
    }

    public func refreshFontFaceCSS() async {
        await CustomFontsActor.shared.refreshFonts()
        fontFaceCSS = await CustomFontsActor.shared.fontFaceCSS
        await sendStyleUpdate()
    }

    public func updateBridge(_ bridge: ReaderCommsBridge) {
        self.bridge = bridge
    }

    public func setReadaloudModeAvailable(_ available: Bool) {
        guard hasAudioNarration != available else { return }
        hasAudioNarration = available
        scheduleStyleUpdate()
    }

    public func sendInitialStyles(isDarkMode initialIsDarkMode: Bool) {
        isDarkMode = initialIsDarkMode
        Task { @StorytellerUIActor in
            await sendStyleUpdate()
        }
    }

    private func setupSettingsObserver() {
        withObservationTracking {
            _ = settingsVM.fontSize
            _ = settingsVM.fontFamily
            _ = settingsVM.lineSpacing
            _ = settingsVM.marginLeftRight
            _ = settingsVM.marginTopBottom
            _ = settingsVM.wordSpacing
            _ = settingsVM.letterSpacing
            _ = settingsVM.textAlignment
            _ = settingsVM.highlightColor
            _ = settingsVM.highlightThickness
            _ = settingsVM.backgroundColor
            _ = settingsVM.foregroundColor
            _ = settingsVM.customCSS
            _ = settingsVM.singleColumnMode
            _ = settingsVM.scrollingMode
            _ = settingsVM.enableMarginClickNavigation
            _ = settingsVM.userHighlightMode
            _ = settingsVM.readaloudHighlightMode
        } onChange: {
            Task { @StorytellerUIActor in
                self.scheduleStyleUpdate()
                self.setupSettingsObserver()
            }
        }
    }

    private func scheduleStyleUpdate() {
        styleUpdateTask?.cancel()
        styleUpdateTask = Task {
            try? await Task.sleep(for: .milliseconds(50))
            guard !Task.isCancelled else { return }
            await sendStyleUpdate()
        }
    }

    public func handleDarkModeChange(_ newIsDarkMode: Bool) {
        isDarkMode = newIsDarkMode
        Task { @StorytellerUIActor in
            await sendStyleUpdate()
        }
    }

    private func sendStyleUpdate() async {
        guard let bridge = bridge else { return }

        let highlightColorRaw = settingsVM.highlightColor
        let backgroundColorRaw = settingsVM.backgroundColor
        let foregroundColorRaw = settingsVM.foregroundColor

        let effectiveHighlightColor =
            (highlightColorRaw?.isEmpty == false ? highlightColorRaw : nil)
            ?? (isDarkMode ? "#333333" : "#CCCCCC")
        let effectiveBackgroundColor =
            (backgroundColorRaw?.isEmpty == false ? backgroundColorRaw : nil)
            ?? (isDarkMode ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
        let effectiveForegroundColor =
            (foregroundColorRaw?.isEmpty == false ? foregroundColorRaw : nil)
            ?? (isDarkMode ? kDefaultForegroundColorDark : kDefaultForegroundColorLight)

        var effectiveCustomCSS = fontFaceCSS
        if let userCSS = settingsVM.customCSS, !userCSS.isEmpty {
            effectiveCustomCSS += "\n" + userCSS
        }

        try? await bridge.sendJsUpdateStyles(
            fontSize: settingsVM.fontSize,
            fontFamily: settingsVM.fontFamily,
            lineSpacing: settingsVM.lineSpacing,
            isDarkMode: isDarkMode,
            marginLeftRight: settingsVM.marginLeftRight,
            marginTopBottom: settingsVM.marginTopBottom,
            wordSpacing: settingsVM.wordSpacing,
            letterSpacing: settingsVM.letterSpacing,
            textAlignment: settingsVM.textAlignment,
            highlightColor: effectiveHighlightColor,
            highlightThickness: settingsVM.highlightThickness,
            backgroundColor: effectiveBackgroundColor,
            foregroundColor: effectiveForegroundColor,
            customCSS: effectiveCustomCSS.isEmpty ? nil : effectiveCustomCSS,
            singleColumnMode: settingsVM.singleColumnMode,
            scrollingMode: settingsVM.scrollingMode,
            hasAudioNarration: hasAudioNarration,
            enableMarginClickNavigation: settingsVM.enableMarginClickNavigation,
            userHighlightMode: settingsVM.userHighlightMode,
            readaloudHighlightMode: settingsVM.readaloudHighlightMode,
        )
    }
}
