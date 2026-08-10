#if os(iOS)
import CarPlay
import StorytellerKit
import UIKit

private struct ChapterButtonAvailability: Equatable {
    let hasPrevious: Bool
    let hasNext: Bool
}

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?
    private var lastChapterButtonAvailability: ChapterButtonAvailability?
    private var isLoadingBook = false
    private var readaloudListTemplate: CPListTemplate?
    private var audiobookListTemplate: CPListTemplate?
    private var lastKnownBookId: BookID?
    private var lastKnownIsPlaying: Bool = false

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController,
    ) {
        debugLog("[CarPlay] Connected to CarPlay")
        self.interfaceController = interfaceController

        Task { @MainActor in
            guard await StorytellerRuntime.start() else { return }
            CarPlayCoordinator.shared.isCarPlayConnected = true
            await setupAndShowRootTemplate()
        }

        Task { @MainActor in
            self.configureNowPlayingTemplate()
        }

        Task {
            guard await StorytellerRuntime.start() else { return }
            await BookServiceActor.shared.setActive(true, source: .carPlay)
        }
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController,
    ) {
        debugLog("[CarPlay] Disconnected from CarPlay")
        self.interfaceController = nil
        Task { @MainActor in
            CarPlayCoordinator.shared.isCarPlayConnected = false
            CarPlayCoordinator.shared.onLibraryUpdated = nil
            CarPlayCoordinator.shared.onChaptersUpdated = nil
            CarPlayCoordinator.shared.onPlaybackStateChanged = nil
        }
        Task {
            guard await StorytellerRuntime.start() else { return }
            await BookServiceActor.shared.setActive(false, source: .carPlay)
        }
    }

    @MainActor
    private func setupAndShowRootTemplate() async {
        let coordinator = CarPlayCoordinator.shared

        coordinator.onLibraryUpdated = { [weak self] in
            debugLog("[CarPlay] Library updated, refreshing list contents")
            Task { @MainActor in
                await self?.refreshListTemplates()
            }
        }

        coordinator.onPlaybackStateChanged = { [weak self] in
            Task { @MainActor in
                await self?.refreshListTemplatesIfNeeded()
                self?.refreshNowPlayingButtonsIfNeeded()
            }
        }

        coordinator.onChaptersUpdated = { [weak self] in
            Task { @MainActor in
                self?.refreshNowPlayingButtonsIfNeeded()
            }
        }

        let tabBar = await buildTabBarTemplate()
        interfaceController?.setRootTemplate(tabBar, animated: false, completion: nil)
    }

    @MainActor
    private func refreshListTemplatesIfNeeded() async {
        let coordinator = CarPlayCoordinator.shared
        let currentBookId = coordinator.activeBookId
        let currentIsPlaying = coordinator.isPlaying

        guard currentBookId != lastKnownBookId || currentIsPlaying != lastKnownIsPlaying else {
            return
        }

        lastKnownBookId = currentBookId
        lastKnownIsPlaying = currentIsPlaying
        await refreshListTemplates()
    }

    @MainActor
    private func refreshListTemplates() async {
        if let readaloudTemplate = readaloudListTemplate {
            let sections = await buildListSections(category: .synced)
            readaloudTemplate.updateSections(sections)
        }
        if let audiobookTemplate = audiobookListTemplate {
            let sections = await buildListSections(category: .audio)
            audiobookTemplate.updateSections(sections)
        }
    }

    @MainActor
    private func refreshNowPlayingButtonsIfNeeded() {
        let coordinator = CarPlayCoordinator.shared
        let availability = ChapterButtonAvailability(
            hasPrevious: coordinator.hasPreviousChapter,
            hasNext: coordinator.hasNextChapter,
        )
        guard availability != lastChapterButtonAvailability else { return }
        configureNowPlayingTemplate()
    }

    @MainActor
    private func configureNowPlayingTemplate() {
        let nowPlaying = CPNowPlayingTemplate.shared
        let coordinator = CarPlayCoordinator.shared

        let availability = ChapterButtonAvailability(
            hasPrevious: coordinator.hasPreviousChapter,
            hasNext: coordinator.hasNextChapter,
        )
        lastChapterButtonAvailability = availability

        var buttons: [CPNowPlayingButton] = []

        if availability.hasPrevious, let previousImage = UIImage(systemName: "backward.end.fill") {
            let previousButton = CPNowPlayingImageButton(image: previousImage) { _ in
                Task { @MainActor in
                    CarPlayCoordinator.shared.goToPreviousChapter()
                }
            }
            buttons.append(previousButton)
        }

        if let listImage = UIImage(systemName: "list.bullet") {
            let chaptersButton = CPNowPlayingImageButton(image: listImage) { [weak self] _ in
                self?.showChaptersList()
            }
            buttons.append(chaptersButton)
        }

        if let speedImage = UIImage(systemName: "speedometer") {
            let speedButton = CPNowPlayingImageButton(image: speedImage) { [weak self] _ in
                self?.showSpeedList()
            }
            buttons.append(speedButton)
        }

        if availability.hasNext, let nextImage = UIImage(systemName: "forward.end.fill") {
            let nextButton = CPNowPlayingImageButton(image: nextImage) { _ in
                Task { @MainActor in
                    CarPlayCoordinator.shared.goToNextChapter()
                }
            }
            buttons.append(nextButton)
        }

        nowPlaying.updateNowPlayingButtons(buttons)
    }

    private func showChaptersList() {
        Task { @MainActor in
            let chapters = CarPlayCoordinator.shared.chapters
            let currentChapterID = CarPlayCoordinator.shared.currentChapterID

            guard !chapters.isEmpty else {
                debugLog("[CarPlay] No chapters available")
                return
            }

            let activePosition =
                chapters.firstIndex { $0.chapterID == currentChapterID } ?? 0
            let folderCount = max(activePosition - 1, 0)
            let previousChapters = Array(chapters.prefix(folderCount))
            let visibleChapters = Array(chapters.dropFirst(folderCount))

            var items: [CPListItem] = []
            if !previousChapters.isEmpty {
                let folderItem = CPListItem(
                    text: "Previous Chapters",
                    detailText: previousChapters.count == 1
                        ? "1 chapter" : "\(previousChapters.count) chapters",
                )
                folderItem.accessoryType = .disclosureIndicator
                folderItem.handler = { [weak self] _, completion in
                    guard let self else {
                        completion()
                        return
                    }
                    let section = CPListSection(
                        items: previousChapters.map {
                            self.chapterListItem(for: $0, currentChapterID: currentChapterID)
                        }
                    )
                    let template = CPListTemplate(title: "Previous Chapters", sections: [section])
                    self.interfaceController?.pushTemplate(
                        template,
                        animated: true,
                        completion: nil,
                    )
                    completion()
                }
                items.append(folderItem)
            }
            items.append(
                contentsOf: visibleChapters.map {
                    chapterListItem(for: $0, currentChapterID: currentChapterID)
                }
            )

            let section = CPListSection(items: items)
            let template = CPListTemplate(title: "Chapters", sections: [section])
            interfaceController?.pushTemplate(template, animated: true, completion: nil)
        }
    }

    private func chapterListItem(
        for chapter: CarPlayChapter,
        currentChapterID: String?,
    ) -> CPListItem {
        let isCurrent = chapter.chapterID == currentChapterID
        let item = CPListItem(
            text: chapter.label,
            detailText: isCurrent ? "Now Playing" : nil,
        )
        item.isPlaying = isCurrent
        item.handler = { [weak self] _, completion in
            debugLog(
                "[CarPlay] Chapter selected: \(chapter.label) (\(chapter.chapterID))"
            )
            Task { @MainActor in
                CarPlayCoordinator.shared.selectChapter(id: chapter.chapterID)
            }
            self?.interfaceController?.pop(
                to: CPNowPlayingTemplate.shared,
                animated: true,
                completion: nil,
            )
            completion()
        }
        return item
    }

    private func showSpeedList() {
        Task { @MainActor in
            let speeds: [Double] = [
                0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0,
            ]
            let currentRate = CarPlayCoordinator.shared.currentPlaybackRate

            let items: [CPListItem] = speeds.map { speed in
                let isCurrent = abs(speed - currentRate) < 0.01
                let label = formatSpeedPickerLabel(speed)
                let item = CPListItem(
                    text: label,
                    detailText: isCurrent ? "Current" : nil,
                )
                item.isPlaying = isCurrent
                item.handler = { [weak self] _, completion in
                    debugLog("[CarPlay] Speed selected: \(speed)x")
                    Task { @MainActor in
                        await CarPlayCoordinator.shared.setPlaybackRate(speed)
                    }
                    self?.interfaceController?.popTemplate(animated: true, completion: nil)
                    completion()
                }
                return item
            }

            let section = CPListSection(items: items)
            let template = CPListTemplate(title: "Playback Speed", sections: [section])
            interfaceController?.pushTemplate(template, animated: true, completion: nil)
        }
    }

    @MainActor
    private func buildTabBarTemplate() async -> CPTabBarTemplate {
        let readaloudTab = await buildListTemplate(
            title: "Readalouds",
            category: .synced,
            systemImage: "book.and.wrench",
        )
        readaloudListTemplate = readaloudTab

        let audiobooksTab = await buildListTemplate(
            title: "Audiobooks",
            category: .audio,
            systemImage: "headphones",
        )
        audiobookListTemplate = audiobooksTab

        return CPTabBarTemplate(templates: [readaloudTab, audiobooksTab])
    }

    @MainActor
    private func buildListSections(category: LocalMediaCategory) async -> [CPListSection] {
        let coordinator = CarPlayCoordinator.shared
        let downloadedBooks = await coordinator.getDownloadedBooks(category: category)

        var items: [CPListItem] = []
        for book in downloadedBooks {
            let coverImage = await coordinator.getCoverImage(for: book.id)
            let resizedCover =
                coverImage.map { resizeCoverImage($0) } ?? UIImage(systemName: "book.closed.fill")

            let isCurrentBook = coordinator.isBookCurrentlyLoaded(book.id)
            let isPlaying = coordinator.isBookCurrentlyPlaying(book.id)

            let item = CPListItem(
                text: book.title,
                detailText: isCurrentBook
                    ? (isPlaying ? "Now Playing" : "Paused") : book.authors?.first?.name,
                image: resizedCover,
            )
            item.handler = { [weak self] _, completion in
                self?.handleBookSelection(book, category: category, completion: completion)
            }
            item.isPlaying = isPlaying
            item.accessoryType = .disclosureIndicator
            items.append(item)
        }

        return [CPListSection(items: items)]
    }

    @MainActor
    private func buildListTemplate(
        title: String,
        category: LocalMediaCategory,
        systemImage: String,
    ) async -> CPListTemplate {
        let sections = await buildListSections(category: category)
        let template = CPListTemplate(title: title, sections: sections)
        template.tabImage = UIImage(systemName: systemImage)

        if sections.first?.items.isEmpty == true {
            template.emptyViewTitleVariants = ["No Downloaded \(title)"]
            template.emptyViewSubtitleVariants = ["Download books on your iPhone first"]
        }

        return template
    }

    private func resizeCoverImage(_ image: UIImage) -> UIImage {
        let targetSize = CGSize(width: 80, height: 80)
        let renderer = UIGraphicsImageRenderer(size: targetSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }

    private func handleBookSelection(
        _ book: BookMetadata,
        category: LocalMediaCategory,
        completion: @escaping () -> Void,
    ) {
        let coordinator = CarPlayCoordinator.shared

        Task { @MainActor in
            // Only skip reload if actively playing this book - otherwise reload fresh
            if coordinator.isBookCurrentlyPlaying(book.id) {
                debugLog("[CarPlay] Book already playing, navigating to NowPlaying: \(book.title)")
                let nowPlayingTemplate = CPNowPlayingTemplate.shared
                self.interfaceController?.pushTemplate(nowPlayingTemplate, animated: true) {
                    success,
                    error in
                    if let error = error {
                        debugLog("[CarPlay] Failed to push NowPlayingTemplate: \(error)")
                    } else {
                        debugLog("[CarPlay] NowPlayingTemplate pushed: \(success)")
                    }
                }
                completion()
                return
            }

            await self.loadNewBook(book, category: category, completion: completion)
        }
    }

    @MainActor
    private func loadNewBook(
        _ book: BookMetadata,
        category: LocalMediaCategory,
        completion: @escaping () -> Void,
    ) async {
        guard !isLoadingBook else {
            debugLog("[CarPlay] Already loading a book, ignoring selection")
            completion()
            return
        }

        debugLog("[CarPlay] Loading new book: \(book.title), category: \(category)")
        isLoadingBook = true
        defer { isLoadingBook = false }

        do {
            try await CarPlayCoordinator.shared.loadAndPlayBook(book, category: category)
            debugLog("[CarPlay] Book loaded successfully, pushing NowPlayingTemplate")

            let nowPlayingTemplate = CPNowPlayingTemplate.shared
            interfaceController?.pushTemplate(nowPlayingTemplate, animated: true) {
                success,
                error in
                if let error = error {
                    debugLog("[CarPlay] Failed to push NowPlayingTemplate: \(error)")
                } else {
                    debugLog("[CarPlay] NowPlayingTemplate pushed: \(success)")
                }
            }
        } catch {
            debugLog("[CarPlay] Failed to load book: \(error)")
        }

        completion()
    }
}
#endif
