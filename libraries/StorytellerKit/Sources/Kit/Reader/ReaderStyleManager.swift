import Foundation
import Observation

@StorytellerUIActor
@Observable
public final class ReaderStyleManager {
    private weak var bridge: ReaderBridge?
    private var settingsVM: any ReaderSettingsReading
    private var isDarkMode = false
    private var styleUpdateTask: Task<Void, Never>?
    private var hasAudioNarration = false
    private var coverTone: CoverHSB?
    @ObservationIgnored private var fontObserverID: UUID?

    public init(settingsVM: any ReaderSettingsReading, bridge: ReaderBridge) {
        self.settingsVM = settingsVM
        self.bridge = bridge
        setupSettingsObserver()
        Task {
            await refreshFontFaceCSS()
            await registerFontObserver()
        }
    }

    private func registerFontObserver() async {
        fontObserverID = await CustomFontsActor.shared.addObserver {
            @StorytellerUIActor [weak self] in
            guard let self else { return }
            Task { @StorytellerUIActor in
                await self.sendStyleUpdate()
            }
        }
    }

    public func refreshFontFaceCSS() async {
        await CustomFontsActor.shared.refreshFonts()
        await sendStyleUpdate()
    }

    public func updateBridge(_ bridge: ReaderBridge) {
        self.bridge = bridge
    }

    public func setCoverTone(_ tone: CoverHSB?) {
        guard coverTone != tone else { return }
        coverTone = tone
        scheduleStyleUpdate()
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
            _ = settingsVM.marginTop
            _ = settingsVM.marginBottom
            _ = settingsVM.wordSpacing
            _ = settingsVM.letterSpacing
            _ = settingsVM.paragraphSpacing
            _ = settingsVM.firstLineIndent
            _ = settingsVM.textAlignment
            _ = settingsVM.highlightColor
            _ = settingsVM.highlightThickness
            _ = settingsVM.backgroundColor
            _ = settingsVM.foregroundColor
            _ = settingsVM.customCSS
            _ = settingsVM.singleColumnMode
            _ = settingsVM.scrollingMode
            _ = settingsVM.disableReaderAnimations
            _ = settingsVM.enableMarginClickNavigation
            _ = settingsVM.userHighlightMode
            _ = settingsVM.readaloudHighlightMode
            _ = settingsVM.readaloudDimOthers
            _ = settingsVM.readaloudDimAmount
            _ = settingsVM.readaloudHighlightFade
            _ = settingsVM.readaloudTextItalic
            _ = settingsVM.readaloudTextBold
            _ = settingsVM.readaloudUnderlineStyle
            _ = settingsVM.coverStrengthBackground
            _ = settingsVM.coverStrengthForeground
            _ = settingsVM.coverStrengthHighlight
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

        let resolvedHighlight = CoverReaderChrome.resolvedHex(
            highlightColorRaw,
            role: .highlight,
            tone: coverTone,
            dark: isDarkMode,
            strength: settingsVM.coverStrengthHighlight,
        )
        let effectiveHighlightColor =
            (resolvedHighlight?.isEmpty == false ? resolvedHighlight : nil)
            ?? (isDarkMode ? "#333333" : "#CCCCCC")
        let resolvedBackground = CoverReaderChrome.resolvedHex(
            backgroundColorRaw,
            role: .background,
            tone: coverTone,
            dark: isDarkMode,
            strength: settingsVM.coverStrengthBackground,
        )
        let resolvedForeground = CoverReaderChrome.resolvedHex(
            foregroundColorRaw,
            role: .foreground,
            tone: coverTone,
            dark: isDarkMode,
            strength: settingsVM.coverStrengthForeground,
        )
        let effectiveBackgroundColor =
            (resolvedBackground?.isEmpty == false ? resolvedBackground : nil)
            ?? (isDarkMode ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
        let effectiveForegroundColor =
            (resolvedForeground?.isEmpty == false ? resolvedForeground : nil)
            ?? (isDarkMode ? kDefaultForegroundColorDark : kDefaultForegroundColorLight)

        var effectiveCustomCSS = await CustomFontsActor.shared.fontFaceCSS(
            bundledFamily: settingsVM.fontFamily
        )
        if let userCSS = settingsVM.customCSS, !userCSS.isEmpty {
            effectiveCustomCSS += "\n" + userCSS
        }

        try? await bridge.sendJsUpdateStyles(
            fontSize: settingsVM.fontSize,
            fontFamily: settingsVM.fontFamily,
            lineSpacing: settingsVM.lineSpacing,
            isDarkMode: isDarkMode,
            marginLeftRight: settingsVM.marginLeftRight,
            marginTop: settingsVM.marginTop,
            marginBottom: settingsVM.marginBottom,
            wordSpacing: settingsVM.wordSpacing,
            letterSpacing: settingsVM.letterSpacing,
            paragraphSpacing: settingsVM.paragraphSpacing,
            firstLineIndent: settingsVM.firstLineIndent,
            textAlignment: settingsVM.textAlignment,
            highlightColor: effectiveHighlightColor,
            highlightThickness: settingsVM.highlightThickness,
            backgroundColor: effectiveBackgroundColor,
            foregroundColor: effectiveForegroundColor,
            customCSS: effectiveCustomCSS.isEmpty ? nil : effectiveCustomCSS,
            singleColumnMode: settingsVM.singleColumnMode,
            scrollingMode: settingsVM.scrollingMode,
            disableReaderAnimations: settingsVM.disableReaderAnimations,
            hasAudioNarration: hasAudioNarration,
            enableMarginClickNavigation: settingsVM.enableMarginClickNavigation,
            userHighlightMode: settingsVM.userHighlightMode,
            readaloudHighlightMode: settingsVM.readaloudHighlightMode,
            readaloudDimOthers: settingsVM.readaloudDimOthers,
            readaloudDimAmount: settingsVM.readaloudDimAmount,
            readaloudHighlightFade: settingsVM.readaloudHighlightFade,
            readaloudTextItalic: settingsVM.readaloudTextItalic,
            readaloudTextBold: settingsVM.readaloudTextBold,
            readaloudUnderlineStyle: settingsVM.readaloudUnderlineStyle,
        )
    }
}
