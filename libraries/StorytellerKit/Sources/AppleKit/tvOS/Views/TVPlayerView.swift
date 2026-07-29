#if os(tvOS)
import StorytellerKit
import SwiftUI
import UIKit

struct TVPlayerView: View {
    let book: BookMetadata
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var viewModel = TVPlayerViewModel()
    @State private var showControls = true
    @State private var showChapterList = false
    @State private var showSpeedPicker = false
    @State private var showDisplaySettings = false
    @State private var controlsHideTask: Task<Void, Never>?
    @State private var isScrubbing = false
    @State private var scrubProgress: Double = 0
    @State private var isScrubSettling = false
    @State private var scrubTargetProgress: Double = 0
    @State private var scrubSettleTask: Task<Void, Never>?
    @State private var cachedCoverImage: Image?
    @FocusState private var focusedControl: FocusedControl?
    @FocusState private var isBackgroundFocused: Bool
    @State private var lastFocusedControl: FocusedControl = .progressBar
    @State private var fontFamily: String = kDefaultTVFontFamily
    @State private var subtitleFontSize: Double = kDefaultTVSubtitleFontSize
    @State private var tvReaderAppearance = StorytellerGlobalConfig.Reading.TVReaderAppearance()
    @State private var forceInstantScroll = false
    @State private var scrollDebounceTask: Task<Void, Never>?
    @State private var paragraphHeights: [Int: CGFloat] = [:]
    @State private var paragraphTops: [Int: CGFloat] = [:]
    @State private var viewportHeight: CGFloat = 0

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        playerContent
            .ignoresSafeArea()
            .onAppear {
                viewModel.usesFullChapterCache = true
                Task {
                    let config = await SettingsActor.shared.config
                    subtitleFontSize = config.reading.tvSubtitleFontSize
                    tvReaderAppearance = config.reading.tvReaderAppearance
                    fontFamily = tvReaderAppearance.fontFamily
                    await viewModel.loadBook(book)
                }
                resetControlsTimer()
                loadCoverImage()
                focusedControl = .progressBar
            }
            .onChange(of: focusedControl) { _, newValue in
                guard showControls else { return }
                if let newValue {
                    lastFocusedControl = newValue
                    showControlsTemporarily()
                } else {
                    DispatchQueue.main.async {
                        if showControls, focusedControl == nil {
                            focusedControl = lastFocusedControl
                        }
                    }
                }
            }
            .onChange(of: showControls) { _, visible in
                if visible {
                    isBackgroundFocused = false
                    focusedControl = .progressBar
                    lastFocusedControl = .progressBar
                } else {
                    focusedControl = nil
                    isBackgroundFocused = true
                }
            }
            .onChange(
                of: mediaViewModel.coverState(
                    for: book,
                    variant: mediaViewModel.coverVariant(for: book),
                ).image
            ) { _, newImage in
                if let newImage, cachedCoverImage == nil {
                    cachedCoverImage = newImage
                }
            }
            .onChange(of: viewModel.chapterProgress) { _, newValue in
                clearScrubSettlingIfNeeded(for: newValue)
            }
            .onDisappear {
                viewModel.cleanup()
            }
            .onPlayPauseCommand {
                viewModel.playPause()
                showControlsTemporarily()
            }
            .onChange(of: viewModel.isPlaying) { _, _ in
                showControlsTemporarily()
            }
            .onExitCommand {
                if showChapterList || showSpeedPicker || showDisplaySettings {
                    showChapterList = false
                    showSpeedPicker = false
                    showDisplaySettings = false
                } else {
                    dismiss()
                }
            }
            .toolbar(.hidden, for: .navigationBar, .tabBar)
            .sheet(isPresented: $showChapterList) {
                TVChapterListView(viewModel: viewModel)
            }
            .sheet(isPresented: $showSpeedPicker) {
                TVSpeedPickerView(viewModel: viewModel)
            }
            .sheet(isPresented: $showDisplaySettings) {
                TVReaderDisplayView(
                    fontFamily: $fontFamily,
                    subtitleFontSize: $subtitleFontSize,
                    tvReaderAppearance: $tvReaderAppearance,
                )
            }
            .alert(
                "Server Has Newer Position",
                isPresented: $viewModel.showServerPositionDialog,
            ) {
                Button("Go to New Position") {
                    viewModel.acceptServerPosition()
                }
                Button("Stay Here", role: .cancel) {
                    viewModel.declineServerPosition()
                }
            } message: {
                Text(viewModel.serverPositionDescription)
            }
    }

    private var playerContent: some View {
        GeometryReader { geometry in
            ZStack {
                backgroundView

                subtitleView
                    .padding(.horizontal, 60)
                    .frame(
                        width: geometry.size.width,
                        height: geometry.size.height,
                        alignment: .center,
                    )

                if viewModel.isLoadingPosition || viewModel.chapterParagraphs.isEmpty {
                    ProgressView()
                        .scaleEffect(2)
                        .tint(readerTextColor)
                }

                statsOverlay
                    .opacity(showControls ? 0 : 1)
                    .animation(.easeInOut(duration: 0.3), value: showControls)

                VStack(spacing: 0) {
                    LinearGradient(
                        colors: [
                            .black,
                            .black.opacity(0.86),
                            .clear,
                        ],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
                    .frame(height: 350)
                    .allowsHitTesting(false)

                    Spacer()

                    LinearGradient(
                        colors: [
                            .clear,
                            .black.opacity(0.86),
                            .black,
                        ],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
                    .frame(height: 300)
                    .allowsHitTesting(false)
                }
                .ignoresSafeArea()
                .opacity(showControls ? 1 : 0)
                .animation(.easeInOut(duration: 0.3), value: showControls)

                if !showControls {
                    DirectionalPressButton(
                        onSelect: {
                            viewModel.playPause()
                            showControlsTemporarily()
                        },
                        onMove: { direction in
                            handleBackgroundMove(direction)
                        },
                    ) {
                        Color.clear
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .focused($isBackgroundFocused)
                }

                headerOverlay
                controlsOverlay
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }

    private var headerOverlay: some View {
        ZStack {
            headerView
                .padding(60)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .allowsHitTesting(false)

            VStack(spacing: 28) {
                coverView
                    .allowsHitTesting(false)

                navigationControlsView
            }
            .padding(.trailing, 60)
            .offset(y: -22)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
        .opacity(showControls ? 1 : 0)
        .animation(.easeInOut(duration: 0.3), value: showControls)
    }

    private var controlsOverlay: some View {
        controlsView
            .padding(60)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .opacity(showControls ? 1 : 0)
            .disabled(!showControls)
            .animation(.easeInOut(duration: 0.3), value: showControls)
    }

    private var backgroundView: some View {
        ZStack {
            backgroundColor

            if tvReaderAppearance.backgroundStyle == "cover", let image = cachedCoverImage {
                GeometryReader { geometry in
                    image
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fill)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .clipped()
                        .blur(radius: 80)
                        .saturation(0.8)
                        .opacity(0.6)
                        .drawingGroup()
                }
            }
        }
        .ignoresSafeArea()
    }

    private var backgroundColor: Color {
        switch tvReaderAppearance.backgroundStyle {
            case "white":
                return .white
            case "paper":
                return Color(red: 0.94, green: 0.91, blue: 0.84)
            case "warmGray":
                return Color(red: 0.12, green: 0.11, blue: 0.10)
            case "sepia":
                return Color(red: 0.16, green: 0.13, blue: 0.09)
            case "highContrast", "oledBlack":
                return .black
            case "dimBlue":
                return Color(red: 0.04, green: 0.07, blue: 0.12)
            default:
                return .black
        }
    }

    private var isLightBackground: Bool {
        switch tvReaderAppearance.backgroundStyle {
            case "white", "paper":
                return true
            default:
                return false
        }
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(viewModel.bookTitle)
                .font(.title)
                .fontWeight(.bold)
                .foregroundStyle(chromeTextColor)

            Text(viewModel.chapterTitle)
                .font(.title3)
                .foregroundStyle(chromeTextColor.opacity(0.8))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.opacity)
    }

    private var subtitleView: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                // Non-lazy on purpose: scroll targeting needs real geometry for every
                // paragraph. Lazy estimation made scrollTo land screens away from tall
                // paragraphs and thrash without ever materializing the target.
                VStack(alignment: .leading, spacing: paragraphSpacing) {
                    ForEach(viewModel.chapterParagraphs) { paragraph in
                        ParagraphCell(
                            paragraphIndex: paragraph.index,
                            paragraphText: paragraph.text,
                            activeEntryIndex: activeEntryIndex(in: paragraph),
                            appearance: tvReaderAppearance,
                            fontFamily: fontFamily,
                            fontSize: subtitleFontSize,
                        ) {
                            AnyView(paragraphView(paragraph))
                        }
                        .equatable()
                        .onGeometryChange(for: CGRect.self) { geometryProxy in
                            geometryProxy.frame(in: .named("TVScrollViewport"))
                        } action: { frame in
                            paragraphHeights[paragraph.index] = frame.height
                            paragraphTops[paragraph.index] = frame.minY
                        }
                        .id(paragraph.index)
                    }
                }
                .padding(.vertical, 600)
                .id("chapter-\(viewModel.currentSectionIndex)")
            }
            .scrollDisabled(true)
            .coordinateSpace(name: "TVScrollViewport")
            .onGeometryChange(for: CGFloat.self) { geometryProxy in
                geometryProxy.size.height
            } action: { height in
                viewportHeight = height
            }
            .onChange(of: viewModel.currentEntryIndex) { _, _ in
                let hadMeasuredGeometry = scrollToCurrent(proxy, animated: true)
                scrollDebounceTask?.cancel()
                guard !hadMeasuredGeometry else { return }
                scrollDebounceTask = Task {
                    try? await Task.sleep(for: .milliseconds(500))
                    guard !Task.isCancelled else { return }
                    scrollToCurrent(proxy, animated: true)
                }
            }
            .onChange(of: viewModel.chapterParagraphs.count) { _, _ in
                forceInstantScroll = true
                DispatchQueue.main.async {
                    scrollToCurrent(proxy, animated: false, consumeForce: false)
                }
            }
            .onChange(of: tvReaderAppearance.scrollMode) { _, _ in
                scrollToCurrent(proxy, animated: true)
            }
            .onChange(of: viewModel.currentSectionIndex) { _, _ in
                paragraphHeights.removeAll()
                paragraphTops.removeAll()
            }
        }
        .frame(maxWidth: textMaxWidth)
        .padding(.horizontal, 80)
        .offset(x: showControls ? -160 : 0)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.3), value: showControls)
    }

    private func activeEntryIndex(
        in paragraph: SMILTextPlaybackViewModel.ChapterParagraph
    ) -> Int {
        viewModel.scrollTargetIndex(for: viewModel.currentEntryIndex) == paragraph.index
            ? viewModel.currentEntryIndex
            : -1
    }

    @ViewBuilder
    private func paragraphView(
        _ paragraph: SMILTextPlaybackViewModel.ChapterParagraph
    ) -> some View {
        if tvReaderAppearance.textAlignment == "justified" {
            JustifiedTVParagraphView(
                attributedText: attributedParagraph(paragraph),
                font: uiFont,
                lineSpacing: lineSpacing,
            )
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            paragraphText(paragraph)
                .font(.system(size: subtitleFontSize))
                .fontDesign(fontDesign)
                .lineSpacing(lineSpacing)
                .multilineTextAlignment(multilineTextAlignment)
                .frame(maxWidth: .infinity, alignment: textFrameAlignment)
        }
    }

    private func paragraphText(_ paragraph: SMILTextPlaybackViewModel.ChapterParagraph) -> Text {
        var text = Text("")
        for segment in paragraph.segments {
            let isActive = segment.entryIndex == viewModel.currentEntryIndex
            text = text + Text(styledSegment(segment, isActive: isActive))
        }
        return text
    }

    private func attributedParagraph(
        _ paragraph: SMILTextPlaybackViewModel.ChapterParagraph
    ) -> NSAttributedString {
        let result = NSMutableAttributedString()
        for segment in paragraph.segments {
            let isActive = segment.entryIndex == viewModel.currentEntryIndex
            result.append(nsStyledSegment(segment, isActive: isActive))
        }
        return result
    }

    private func nsStyledSegment(
        _ segment: SMILTextPlaybackViewModel.ChapterSegment,
        isActive: Bool,
    ) -> NSAttributedString {
        var attributes: [NSAttributedString.Key: Any] = [:]
        if isActive {
            switch tvReaderAppearance.activeSentenceStyle {
                case "highlightBackground":
                    attributes[.foregroundColor] = readerTextUIColor
                    attributes[.backgroundColor] = highlightUIColor
                case "underline":
                    attributes[.foregroundColor] = readerTextUIColor
                    attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
                case "colorText":
                    attributes[.foregroundColor] = highlightUIColor
                default:
                    attributes[.foregroundColor] = readerTextUIColor
            }
        } else {
            attributes[.foregroundColor] = readerTextUIColor.withAlphaComponent(
                inactiveTextOpacity
            )
        }
        return NSAttributedString(
            string: segment.text + segment.separator,
            attributes: attributes,
        )
    }

    private func styledSegment(
        _ segment: SMILTextPlaybackViewModel.ChapterSegment,
        isActive: Bool,
    ) -> AttributedString {
        var attributed = AttributedString(segment.text + segment.separator)
        if isActive {
            switch tvReaderAppearance.activeSentenceStyle {
                case "highlightBackground":
                    attributed.foregroundColor = readerTextColor
                    attributed.backgroundColor = highlightColor
                case "underline":
                    attributed.foregroundColor = readerTextColor
                    attributed.underlineStyle = .single
                case "colorText":
                    attributed.foregroundColor = highlightColor
                default:
                    attributed.foregroundColor = readerTextColor
            }
        } else {
            attributed.foregroundColor = readerTextColor.opacity(inactiveTextOpacity)
        }
        return attributed
    }

    private var readerTextColor: Color {
        isLightBackground ? .black : .white
    }

    private var chromeTextColor: Color {
        .white
    }

    private var controlBackgroundColor: Color {
        isLightBackground ? .black.opacity(0.34) : .white.opacity(0.2)
    }

    private var readerTextUIColor: UIColor {
        isLightBackground ? .black : .white
    }

    private var highlightColor: Color {
        if tvReaderAppearance.activeSentenceStyle == "highlightBackground" {
            return highlightBackgroundColor
        }
        return highlightTextColor
    }

    private var highlightTextColor: Color {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return Color(red: 1.0, green: 0.64, blue: 0.18)
            case "blue":
                return Color(red: 0.38, green: 0.68, blue: 1.0)
            case "green":
                return Color(red: 0.42, green: 0.86, blue: 0.48)
            case "pink":
                return Color(red: 1.0, green: 0.46, blue: 0.72)
            case "gray":
                return isLightBackground
                    ? Color(red: 0.22, green: 0.22, blue: 0.24)
                    : Color(red: 0.78, green: 0.78, blue: 0.82)
            case "white":
                return .white
            default:
                return Color(red: 1.0, green: 0.86, blue: 0.25)
        }
    }

    private var highlightBackgroundColor: Color {
        if isLightBackground {
            return lightHighlightBackgroundColor
        }
        return darkHighlightBackgroundColor
    }

    private var darkHighlightBackgroundColor: Color {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return Color(red: 0.52, green: 0.27, blue: 0.05)
            case "blue":
                return Color(red: 0.05, green: 0.20, blue: 0.42)
            case "green":
                return Color(red: 0.07, green: 0.30, blue: 0.13)
            case "pink":
                return Color(red: 0.46, green: 0.10, blue: 0.28)
            case "gray", "white":
                return Color(red: 0.18, green: 0.18, blue: 0.20)
            default:
                return Color(red: 0.48, green: 0.38, blue: 0.04)
        }
    }

    private var lightHighlightBackgroundColor: Color {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return Color(red: 0.98, green: 0.79, blue: 0.50)
            case "blue":
                return Color(red: 0.72, green: 0.84, blue: 1.0)
            case "green":
                return Color(red: 0.70, green: 0.89, blue: 0.72)
            case "pink":
                return Color(red: 1.0, green: 0.74, blue: 0.86)
            case "gray", "white":
                return Color(red: 0.78, green: 0.78, blue: 0.72)
            default:
                return Color(red: 0.95, green: 0.86, blue: 0.42)
        }
    }

    private var highlightUIColor: UIColor {
        if tvReaderAppearance.activeSentenceStyle == "highlightBackground" {
            return highlightBackgroundUIColor
        }
        return highlightTextUIColor
    }

    private var highlightTextUIColor: UIColor {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return UIColor(red: 1.0, green: 0.64, blue: 0.18, alpha: 1)
            case "blue":
                return UIColor(red: 0.38, green: 0.68, blue: 1.0, alpha: 1)
            case "green":
                return UIColor(red: 0.42, green: 0.86, blue: 0.48, alpha: 1)
            case "pink":
                return UIColor(red: 1.0, green: 0.46, blue: 0.72, alpha: 1)
            case "gray":
                if isLightBackground {
                    return UIColor(red: 0.22, green: 0.22, blue: 0.24, alpha: 1)
                }
                return UIColor(red: 0.78, green: 0.78, blue: 0.82, alpha: 1)
            case "white":
                return .white
            default:
                return UIColor(red: 1.0, green: 0.86, blue: 0.25, alpha: 1)
        }
    }

    private var highlightBackgroundUIColor: UIColor {
        if isLightBackground {
            return lightHighlightBackgroundUIColor
        }
        return darkHighlightBackgroundUIColor
    }

    private var darkHighlightBackgroundUIColor: UIColor {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return UIColor(red: 0.52, green: 0.27, blue: 0.05, alpha: 1)
            case "blue":
                return UIColor(red: 0.05, green: 0.20, blue: 0.42, alpha: 1)
            case "green":
                return UIColor(red: 0.07, green: 0.30, blue: 0.13, alpha: 1)
            case "pink":
                return UIColor(red: 0.46, green: 0.10, blue: 0.28, alpha: 1)
            case "gray", "white":
                return UIColor(red: 0.18, green: 0.18, blue: 0.20, alpha: 1)
            default:
                return UIColor(red: 0.48, green: 0.38, blue: 0.04, alpha: 1)
        }
    }

    private var lightHighlightBackgroundUIColor: UIColor {
        switch tvReaderAppearance.highlightColor {
            case "amber":
                return UIColor(red: 0.98, green: 0.79, blue: 0.50, alpha: 1)
            case "blue":
                return UIColor(red: 0.72, green: 0.84, blue: 1.0, alpha: 1)
            case "green":
                return UIColor(red: 0.70, green: 0.89, blue: 0.72, alpha: 1)
            case "pink":
                return UIColor(red: 1.0, green: 0.74, blue: 0.86, alpha: 1)
            case "gray", "white":
                return UIColor(red: 0.78, green: 0.78, blue: 0.72, alpha: 1)
            default:
                return UIColor(red: 0.95, green: 0.86, blue: 0.42, alpha: 1)
        }
    }

    private var inactiveTextOpacity: Double {
        if isLightBackground {
            switch tvReaderAppearance.inactiveTextIntensity {
                case "medium":
                    return 0.68
                case "bright":
                    return 0.82
                default:
                    return 0.55
            }
        } else {
            switch tvReaderAppearance.inactiveTextIntensity {
                case "medium":
                    return 0.52
                case "bright":
                    return 0.72
                default:
                    return 0.35
            }
        }
    }

    private var textMaxWidth: CGFloat {
        switch tvReaderAppearance.textWidth {
            case "narrow":
                return 980
            case "wide":
                return 1420
            default:
                return 1200
        }
    }

    private var paragraphSpacing: CGFloat {
        switch tvReaderAppearance.lineSpacing {
            case "compact":
                return 18
            case "relaxed":
                return 34
            default:
                return 24
        }
    }

    private var lineSpacing: CGFloat {
        switch tvReaderAppearance.lineSpacing {
            case "compact":
                return 4
            case "relaxed":
                return 16
            default:
                return 10
        }
    }

    private var multilineTextAlignment: TextAlignment {
        tvReaderAppearance.textAlignment == "center" ? .center : .leading
    }

    private var textFrameAlignment: Alignment {
        tvReaderAppearance.textAlignment == "center" ? .center : .leading
    }

    private var uiFont: UIFont {
        let baseDescriptor = UIFont.systemFont(ofSize: subtitleFontSize, weight: .regular)
            .fontDescriptor
        let descriptor: UIFontDescriptor
        switch fontFamily {
            case "serif":
                descriptor = baseDescriptor.withDesign(.serif) ?? baseDescriptor
            case "monospace":
                descriptor = baseDescriptor.withDesign(.monospaced) ?? baseDescriptor
            default:
                descriptor = baseDescriptor
        }
        return UIFont(descriptor: descriptor, size: subtitleFontSize)
    }

    private var fontDesign: Font.Design? {
        switch fontFamily {
            case "System Default", "sans-serif":
                return .default
            case "serif":
                return .serif
            case "monospace":
                return .monospaced
            default:
                return nil
        }
    }

    private var statsOverlay: some View {
        VStack {
            Spacer()
            HStack(alignment: .bottom) {
                HStack(spacing: 8) {
                    Image(systemName: "bookmark.fill")
                        .font(.title3)
                    Text(
                        formatTimeMinutesSeconds(viewModel.chapterDuration - viewModel.currentTime)
                    )
                    .font(.title3)
                }
                .foregroundStyle(chromeTextColor.opacity(0.7))

                Spacer()

                HStack(spacing: 8) {
                    Text(formatTimeHoursMinutes(viewModel.bookDuration - viewModel.bookElapsed))
                        .font(.title3)
                    Image(systemName: "book.fill")
                        .font(.title3)
                }
                .foregroundStyle(chromeTextColor.opacity(0.7))
            }
            .padding(.horizontal, 80)
            .padding(.bottom, 60)
        }
        .allowsHitTesting(false)
    }

    private var coverView: some View {
        Group {
            if let image = cachedCoverImage {
                image
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(chromeTextColor.opacity(0.1))
                    .overlay {
                        Image(systemName: "book.closed")
                            .font(.system(size: 60))
                            .foregroundStyle(chromeTextColor.opacity(0.3))
                    }
            }
        }
        .frame(width: 300, height: 450)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 20)
    }

    private var controlsView: some View {
        VStack(spacing: 12) {
            menuControlsView

            progressBar
        }
        .transition(.opacity)
    }

    private var menuControlsView: some View {
        HStack {
            Spacer()

            HStack(spacing: 20) {
                controlButton(
                    systemName: "list.bullet",
                    caption: nil,
                    focused: .chapterList,
                ) {
                    showChapterList = true
                    showControlsTemporarily()
                }

                controlButton(
                    systemName: "textformat.size",
                    caption: nil,
                    focused: .display,
                ) {
                    showDisplaySettings = true
                    showControlsTemporarily()
                }

                controlButton(
                    systemName: "speedometer",
                    caption: nil,
                    focused: .speed,
                ) {
                    showSpeedPicker = true
                    showControlsTemporarily()
                }
            }
            .padding(.horizontal, 24)
        }
        .offset(x: -92, y: 14)
    }

    private var navigationControlsView: some View {
        HStack(spacing: 14) {
            controlButton(
                systemName: "backward.end.fill",
                caption: nil,
                focused: .previousChapter,
            ) {
                viewModel.previousChapter()
                showControlsTemporarily()
            }

            controlButton(
                systemName: "gobackward",
                caption: nil,
                focused: .previousSentence,
            ) {
                viewModel.previousSentence()
                showControlsTemporarily()
            }

            controlButton(
                systemName: "goforward",
                caption: nil,
                focused: .nextSentence,
            ) {
                viewModel.nextSentence()
                showControlsTemporarily()
            }

            controlButton(
                systemName: "forward.end.fill",
                caption: nil,
                focused: .nextChapter,
            ) {
                viewModel.nextChapter()
                showControlsTemporarily()
            }
        }
    }

    private var progressBar: some View {
        let isFocused = focusedControl == .progressBar
        let displayProgress =
            (isScrubbing || isScrubSettling)
            ? scrubProgress
            : viewModel.chapterProgress
        return DirectionalPressButton(
            onSelect: {
                viewModel.playPause()
                showControlsTemporarily()
            },
            onMove: { direction in
                handleProgressBarMove(direction)
            },
            onScrub: { progress, state in
                handleProgressBarScrub(progress, state: state)
            },
            currentProgress: displayProgress,
            scrubScale: 0.52,
            scrubActivationProgress: 0.10,
        ) {
            ProgressBarContent(
                progress: displayProgress,
                currentTime: viewModel.currentTimeFormatted,
                duration: viewModel.chapterDurationFormatted,
                isFocused: isFocused,
                tintColor: chromeTextColor,
            )
        }
        .focused($focusedControl, equals: .progressBar)
    }

    private func seekToChapterProgress(_ progress: Double) {
        let targetTime = progress * viewModel.chapterDuration
        let currentTime = viewModel.chapterProgress * viewModel.chapterDuration
        let delta = targetTime - currentTime
        if delta > 0 {
            viewModel.skipForward(seconds: delta)
        } else {
            viewModel.skipBackward(seconds: -delta)
        }
    }

    private func handleBackgroundMove(_ direction: MoveCommandDirection) {
        switch direction {
            case .left:
                viewModel.previousSentence()
            case .right:
                viewModel.nextSentence()
            case .up, .down:
                showControlsTemporarily()
                focusedControl = .progressBar
            @unknown default:
                break
        }
    }

    private func handleProgressBarMove(_ direction: MoveCommandDirection) {
        switch direction {
            case .left:
                viewModel.previousSentence()
                showControlsTemporarily()
            case .right:
                viewModel.nextSentence()
                showControlsTemporarily()
            case .up, .down:
                break
            @unknown default:
                break
        }
    }

    private func handleProgressBarScrub(
        _ progress: Double,
        state: UIGestureRecognizer.State,
    ) {
        let clamped = min(max(progress, 0), 1)
        switch state {
            case .began, .changed:
                scrubSettleTask?.cancel()
                scrubSettleTask = nil
                isScrubSettling = false
                if !isScrubbing {
                    scrubProgress = viewModel.chapterProgress
                }
                isScrubbing = true
                scrubProgress = clamped
                showControlsTemporarily()
            case .ended, .cancelled, .failed:
                if isScrubbing {
                    let target = scrubProgress
                    isScrubbing = false
                    isScrubSettling = true
                    scrubTargetProgress = target
                    seekToChapterProgress(target)
                    scheduleScrubSettleTimeout()
                }
            default:
                break
        }
    }

    private func scheduleScrubSettleTimeout() {
        scrubSettleTask?.cancel()
        scrubSettleTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            isScrubSettling = false
        }
    }

    private func clearScrubSettlingIfNeeded(for progress: Double) {
        guard isScrubSettling else { return }
        let delta = abs(progress - scrubTargetProgress)
        if delta < 0.002 {
            scrubSettleTask?.cancel()
            scrubSettleTask = nil
            isScrubSettling = false
        }
    }

    private func showControlsTemporarily() {
        if !showControls {
            showControls = true
        } else if focusedControl == nil {
            focusedControl = lastFocusedControl
        }
        resetControlsTimer()
    }

    private func resetControlsTimer() {
        controlsHideTask?.cancel()
        controlsHideTask = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            if viewModel.isPlaying && !isScrubbing && !isScrubSettling {
                showControls = false
            }
        }
    }

    private func loadCoverImage() {
        let variant = mediaViewModel.coverVariant(for: book)
        mediaViewModel.ensureCoverLoaded(for: book, variant: variant)
        let coverState = mediaViewModel.coverState(for: book, variant: variant)
        if let image = coverState.image {
            cachedCoverImage = image
        }
    }

    // Returns whether the target paragraph had measured geometry, so callers can
    // schedule a one-shot corrective scroll for the fresh-chapter case where the
    // first scroll had to fall back to a centered anchor.
    @discardableResult
    private func scrollToCurrent(
        _ proxy: ScrollViewProxy,
        animated: Bool = true,
        consumeForce: Bool = true,
    ) -> Bool {
        guard
            let targetIndex = viewModel.scrollTargetIndex(
                for: viewModel.currentEntryIndex
            )
        else {
            return true
        }
        let hadMeasuredGeometry =
            paragraphHeights[targetIndex] != nil && viewportHeight > 0
        guard let anchor = resolvedScrollAnchor(for: targetIndex) else {
            return hadMeasuredGeometry
        }
        let shouldAnimate = animated && !forceInstantScroll
        let action = { proxy.scrollTo(targetIndex, anchor: anchor) }
        if shouldAnimate {
            withAnimation(.smooth(duration: 0.5)) {
                action()
            }
        } else {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                action()
            }
        }
        if forceInstantScroll && consumeForce {
            forceInstantScroll = false
        }
        return hadMeasuredGeometry
    }

    // scrollTo(id, anchor: UnitPoint(0.5, a)) aligns the point a*paragraphHeight inside the
    // paragraph with the point a*viewportHeight in the viewport, so the content offset lands at
    // paragraphTop + a*(paragraphHeight - viewportHeight). Solving for a places the estimated
    // sentence position at a chosen fraction of the viewport. Returns nil when the current
    // measured position is already comfortably visible, so word-cadence overlays step
    // occasionally instead of animating on every entry.
    private func resolvedScrollAnchor(for paragraphIndex: Int) -> UnitPoint? {
        guard
            paragraphIndex >= 0,
            paragraphIndex < viewModel.chapterParagraphs.count,
            let paragraphHeight = paragraphHeights[paragraphIndex],
            viewportHeight > 0
        else {
            return .center
        }
        let paragraph = viewModel.chapterParagraphs[paragraphIndex]
        let measuredTop = paragraphTops[paragraphIndex]

        if tvReaderAppearance.scrollMode == "sentence" {
            guard let fraction = activeSentenceFraction(in: paragraph) else { return .center }
            if let measuredTop {
                let screenY = measuredTop + fraction * paragraphHeight
                if screenY >= viewportHeight * 0.34 && screenY <= viewportHeight * 0.62 {
                    return nil
                }
            }
            return centeredSentenceAnchor(
                sentenceCenter: fraction * paragraphHeight,
                paragraphHeight: paragraphHeight,
            )
        }

        if paragraphHeight <= viewportHeight {
            if let measuredTop,
                measuredTop >= viewportHeight * 0.10,
                measuredTop + paragraphHeight <= viewportHeight * 0.90
            {
                return nil
            }
            return .center
        }

        guard let fraction = activeSentenceFraction(in: paragraph) else { return .center }
        if let measuredTop {
            let screenY = measuredTop + fraction * paragraphHeight
            if screenY >= viewportHeight * 0.36 && screenY <= viewportHeight * 0.70 {
                return nil
            }
        }
        return UnitPoint(
            x: 0.5,
            y: jumpAnchorY(
                sentenceCenter: fraction * paragraphHeight,
                paragraphHeight: paragraphHeight,
            ),
        )
    }

    // Estimates where the active sentence sits vertically in its paragraph by character
    // position, since segments are inline Text runs with no frames of their own.
    private func activeSentenceFraction(
        in paragraph: SMILTextPlaybackViewModel.ChapterParagraph
    ) -> CGFloat? {
        var totalLength = 0
        var activeStart: Int?
        var activeLength = 0
        for segment in paragraph.segments {
            let length = segment.text.count + segment.separator.count
            if segment.entryIndex == viewModel.currentEntryIndex {
                activeStart = totalLength
                activeLength = length
            }
            totalLength += length
        }
        guard totalLength > 0, let activeStart else { return nil }
        return (CGFloat(activeStart) + CGFloat(activeLength) / 2) / CGFloat(totalLength)
    }

    // Anchor values outside 0...1 are intentional: they are the solutions that put the sentence
    // at the desired viewport fraction when the sentence sits near a paragraph edge, showing
    // neighboring paragraphs above or below. The scroll view clamps at real content bounds.
    private func centeredSentenceAnchor(
        sentenceCenter: CGFloat,
        paragraphHeight: CGFloat,
    ) -> UnitPoint {
        let denominator = paragraphHeight - viewportHeight
        guard abs(denominator) > 10 else { return .center }
        return UnitPoint(x: 0.5, y: (sentenceCenter - viewportHeight / 2) / denominator)
    }

    private func jumpAnchorY(
        sentenceCenter: CGFloat,
        paragraphHeight: CGFloat,
    ) -> CGFloat {
        let denominator = paragraphHeight - viewportHeight
        guard abs(denominator) > 10 else { return 0.5 }
        return (sentenceCenter - viewportHeight * 0.42) / denominator
    }

    private func controlButton(
        systemName: String,
        caption: String?,
        focused: FocusedControl,
        action: @escaping () -> Void,
    ) -> some View {
        let isFocused = focusedControl == focused
        return VStack(spacing: 6) {
            Button(action: action) {
                Image(systemName: systemName)
                    .font(.system(size: 20))
            }
            .buttonStyle(
                PlayerControlButtonStyle(
                    tintColor: chromeTextColor,
                    unfocusedBackgroundColor: controlBackgroundColor,
                    focusedForegroundColor: .black,
                )
            )
            .focused($focusedControl, equals: focused)

            Text(caption ?? " ")
                .font(.caption2)
                .foregroundStyle(
                    caption == nil
                        ? Color.clear
                        : chromeTextColor.opacity(isFocused ? 0.9 : 0.7)
                )
        }
    }

}

// Skips re-rendering paragraphs untouched by an entry change. With a non-lazy stack every
// paragraph exists at once, so without this every word tick would rebuild the whole chapter.
private struct ParagraphCell: View, Equatable {
    let paragraphIndex: Int
    let paragraphText: String
    let activeEntryIndex: Int
    let appearance: StorytellerGlobalConfig.Reading.TVReaderAppearance
    let fontFamily: String
    let fontSize: Double
    let content: () -> AnyView

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.paragraphIndex == rhs.paragraphIndex
            && lhs.paragraphText == rhs.paragraphText
            && lhs.activeEntryIndex == rhs.activeEntryIndex
            && lhs.appearance == rhs.appearance
            && lhs.fontFamily == rhs.fontFamily
            && lhs.fontSize == rhs.fontSize
    }

    var body: some View {
        content()
    }
}

private enum FocusedControl: Hashable {
    case progressBar
    case chapterList
    case previousChapter
    case nextChapter
    case previousSentence
    case nextSentence
    case display
    case speed
}

private struct PlayerControlButtonStyle: ButtonStyle {
    @Environment(\.isFocused) private var isFocused
    let tintColor: Color
    let unfocusedBackgroundColor: Color
    let focusedForegroundColor: Color
    var isLarge = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isFocused ? focusedForegroundColor : tintColor)
            .frame(width: isLarge ? 86 : 60, height: isLarge ? 86 : 60)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isFocused ? tintColor : unfocusedBackgroundColor)
            )
            .scaleEffect(isFocused ? 1.1 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isFocused)
    }
}

private struct ProgressBarContent: View {
    let progress: Double
    let currentTime: String
    let duration: String
    let isFocused: Bool
    let tintColor: Color

    var body: some View {
        let barHeight: CGFloat = isFocused ? 12 : 8
        let handleSize: CGFloat = isFocused ? 18 : 0

        VStack(spacing: 8) {
            Capsule()
                .fill(tintColor.opacity(0.3))
                .frame(height: barHeight)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(tintColor)
                        .scaleEffect(x: max(0.001, progress), y: 1, anchor: .leading)
                }
                .clipShape(Capsule())
                .overlay {
                    GeometryReader { proxy in
                        let clampedProgress = min(max(progress, 0), 1)
                        let xPosition = max(
                            handleSize / 2,
                            min(
                                proxy.size.width - handleSize / 2,
                                proxy.size.width * clampedProgress,
                            ),
                        )
                        Circle()
                            .fill(tintColor)
                            .frame(width: handleSize, height: handleSize)
                            .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
                            .position(x: xPosition, y: proxy.size.height / 2)
                            .opacity(isFocused ? 1 : 0)
                    }
                }
                .frame(height: 18, alignment: .center)
                .animation(.easeInOut(duration: 0.15), value: isFocused)

            HStack {
                Text(currentTime)
                Spacer()
                Text(duration)
            }
            .font(.caption)
            .foregroundStyle(tintColor.opacity(0.7))
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 24)
    }
}

private struct JustifiedTVParagraphView: UIViewRepresentable {
    let attributedText: NSAttributedString
    let font: UIFont
    let lineSpacing: CGFloat

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = 0
        label.backgroundColor = .clear
        label.adjustsFontForContentSizeCategory = false
        return label
    }

    func updateUIView(_ uiView: UILabel, context: Context) {
        let text = NSMutableAttributedString(attributedString: attributedText)
        let fullRange = NSRange(location: 0, length: text.length)
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .justified
        paragraphStyle.lineSpacing = lineSpacing
        text.addAttributes(
            [
                .font: font,
                .paragraphStyle: paragraphStyle,
            ],
            range: fullRange,
        )
        uiView.attributedText = text
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: UILabel,
        context: Context,
    ) -> CGSize? {
        guard let width = proposal.width else { return nil }
        let size = uiView.sizeThatFits(
            CGSize(width: width, height: .greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: size.height)
    }
}

// Workaround: tvOS 18 drops the first directional press on onMoveCommand for the
// silver Siri Remote, so we intercept arrow presses in UIKit instead.
// https://developer.apple.com/forums/thread/764582
private struct DirectionalPressButton<Label: View>: UIViewRepresentable {
    var onSelect: () -> Void
    var onMove: (MoveCommandDirection) -> Void
    var onPlayPause: (() -> Void)?
    var onScrub: ((Double, UIGestureRecognizer.State) -> Void)?
    var currentProgress: Double
    var scrubScale: CGFloat
    var scrubActivationProgress: Double
    var label: Label

    init(
        onSelect: @escaping () -> Void,
        onMove: @escaping (MoveCommandDirection) -> Void,
        onPlayPause: (() -> Void)? = nil,
        onScrub: ((Double, UIGestureRecognizer.State) -> Void)? = nil,
        currentProgress: Double = 0,
        scrubScale: CGFloat = 0.4,
        scrubActivationProgress: Double = 0.1,
        @ViewBuilder label: () -> Label,
    ) {
        self.onSelect = onSelect
        self.onMove = onMove
        self.onPlayPause = onPlayPause
        self.onScrub = onScrub
        self.currentProgress = currentProgress
        self.scrubScale = scrubScale
        self.scrubActivationProgress = scrubActivationProgress
        self.label = label()
    }

    func makeUIView(context: Context) -> PressButton {
        let button = PressButton()
        button.onSelect = onSelect
        button.onMove = onMove
        button.onPlayPause = onPlayPause
        button.onScrub = onScrub
        button.currentProgress = currentProgress
        button.scrubScale = scrubScale
        button.scrubActivationProgress = scrubActivationProgress
        button.scrubbingEnabled = onScrub != nil
        button.backgroundColor = .clear
        button.contentHorizontalAlignment = .fill
        button.contentVerticalAlignment = .fill
        button.addTarget(
            button,
            action: #selector(PressButton.handlePrimaryAction),
            for: .primaryActionTriggered,
        )

        let host = UIHostingController(rootView: label)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.backgroundColor = .clear
        button.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: button.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: button.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: button.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: button.bottomAnchor),
        ])
        context.coordinator.host = host

        return button
    }

    func updateUIView(_ uiView: PressButton, context: Context) {
        uiView.onSelect = onSelect
        uiView.onMove = onMove
        uiView.onPlayPause = onPlayPause
        uiView.onScrub = onScrub
        uiView.currentProgress = currentProgress
        uiView.scrubScale = scrubScale
        uiView.scrubActivationProgress = scrubActivationProgress
        uiView.scrubbingEnabled = onScrub != nil
        uiView.updateScrubbingEnabled()
        context.coordinator.host?.rootView = label
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView _: PressButton,
        context: Context,
    ) -> CGSize? {
        guard let host = context.coordinator.host else { return nil }
        let targetWidth = proposal.width ?? UIScreen.main.bounds.width
        let size = host.sizeThatFits(
            in: CGSize(width: targetWidth, height: .greatestFiniteMagnitude)
        )
        return CGSize(width: proposal.width ?? size.width, height: size.height)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator {
        var host: UIHostingController<Label>?
    }
}

private final class PressButton: UIButton {
    var onSelect: (() -> Void)?
    var onMove: ((MoveCommandDirection) -> Void)?
    var onPlayPause: (() -> Void)?
    var onScrub: ((Double, UIGestureRecognizer.State) -> Void)?
    var currentProgress: Double = 0
    var scrubScale: CGFloat = 0.4
    var scrubActivationProgress: Double = 0.1
    var scrubbingEnabled = false
    private var panStartProgress: CGFloat = 0
    private var panActivationOffset: CGFloat = 0
    private var scrubActivated = false
    private var verticalSwipeTriggered = false
    private let panRecognizer = UIPanGestureRecognizer()

    override var canBecomeFocused: Bool {
        true
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureGestures()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureGestures()
    }

    private func configureGestures() {
        panRecognizer.addTarget(self, action: #selector(handlePan(_:)))
        panRecognizer.cancelsTouchesInView = false
        if #available(tvOS 14.0, *) {
            panRecognizer.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirect.rawValue)]
        }
        panRecognizer.isEnabled = true
        addGestureRecognizer(panRecognizer)
    }

    func updateScrubbingEnabled() {
    }

    @objc func handlePrimaryAction() {
        onSelect?()
    }

    @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
        guard bounds.width > 0 else { return }
        switch recognizer.state {
            case .began:
                panStartProgress = CGFloat(currentProgress)
                panActivationOffset = 0
                scrubActivated = false
                verticalSwipeTriggered = false
            case .changed, .ended, .cancelled, .failed:
                let translation = recognizer.translation(in: self)

                if !scrubActivated && !verticalSwipeTriggered {
                    let verticalThreshold: CGFloat = 30
                    if abs(translation.y) > verticalThreshold
                        && abs(translation.y) > abs(translation.x)
                    {
                        verticalSwipeTriggered = true
                        let direction: MoveCommandDirection = translation.y < 0 ? .up : .down
                        onMove?(direction)
                        return
                    }
                }

                guard scrubbingEnabled else { return }

                if !scrubActivated {
                    let requiredTranslation =
                        CGFloat(scrubActivationProgress)
                        * bounds.width
                        / max(scrubScale, 0.01)
                    if abs(translation.x) < requiredTranslation {
                        if recognizer.state != .ended {
                            return
                        }
                    } else {
                        scrubActivated = true
                        panActivationOffset =
                            translation.x > 0
                            ? requiredTranslation
                            : -requiredTranslation
                    }
                }
                guard scrubActivated else { return }
                let adjustedTranslation = translation.x - panActivationOffset
                let delta = (adjustedTranslation / bounds.width) * scrubScale
                let progress = min(max(panStartProgress + delta, 0), 1)
                onScrub?(progress, recognizer.state)
                if recognizer.state == .ended || recognizer.state == .cancelled
                    || recognizer.state == .failed
                {
                    scrubActivated = false
                }
            default:
                break
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            switch press.type {
                case .leftArrow:
                    onMove?(.left)
                    return
                case .rightArrow:
                    onMove?(.right)
                    return
                case .playPause:
                    if let onPlayPause {
                        onPlayPause()
                        return
                    }
                case .select:
                    break
                case .upArrow:
                    onMove?(.up)
                    return
                case .downArrow:
                    onMove?(.down)
                    return
                default:
                    break
            }
        }
        super.pressesBegan(presses, with: event)
    }
}
#endif
