package dev.smoores.storyteller.model

import org.json.JSONArray
import org.json.JSONObject

// Kotlin mirror of Kit/Models/PlayerComplication.swift; raw values are the wire format.
enum class PlayerComplication(val rawValue: String) {
    NONE("none"),
    PLAY_PAUSE("playPause"),
    SKIP_BACKWARD("skipBackward"),
    SKIP_FORWARD("skipForward"),
    PLAYBACK_SPEED("playbackSpeed"),
    SCRUB_BAR("scrubBar"),
    STAT_PERCENT("statPercent"),
    STAT_PAGE("statPage"),
    STAT_TIME_IN_BOOK("statTimeInBook"),
    STAT_TIME_IN_CHAPTER("statTimeInChapter"),
    STAT_PAGES_LEFT("statPagesLeft"),
    STAT_CHAPTER_OF("statChapterOf"),
    STAT_CHAPTER_PERCENT("statChapterPercent"),
    STAT_CHAPTER_ELAPSED("statChapterElapsed"),
    STAT_CHAPTER_LENGTH("statChapterLength"),
    STAT_SLEEP_TIMER("statSleepTimer"),
    STAT_FINISH_TIME("statFinishTime"),
    STAT_SESSION_TIME("statSessionTime"),
    STAT_CLOCK("statClock"),
    STAT_BATTERY("statBattery"),
    CHAPTERS("chapters"),
    BOOKMARKS("bookmarks"),
    SEARCH("search"),
    TEXT_SETTINGS("textSettings"),
    SLEEP_TIMER("sleepTimer"),
    TITLE_BLOCK("titleBlock"),
    MIRROR("mirror"),
    SCROLL_MODE("scrollMode"),
    FREE_BROWSE_LOCK("freeBrowseLock"),
    ORIENTATION_LOCK("orientationLock");

    val requiresAudio: Boolean
        get() = when (this) {
            PLAY_PAUSE, SKIP_BACKWARD, SKIP_FORWARD, PLAYBACK_SPEED, SCRUB_BAR,
            STAT_TIME_IN_BOOK, STAT_TIME_IN_CHAPTER, STAT_CHAPTER_ELAPSED,
            STAT_CHAPTER_LENGTH, STAT_SLEEP_TIMER, STAT_FINISH_TIME,
            SLEEP_TIMER, FREE_BROWSE_LOCK -> true
            else -> false
        }

    // Takes whatever width is left in its row and pushes the fixed-size
    // complications out to the edges.
    val isExpanding: Boolean
        get() = this == SCRUB_BAR || this == TITLE_BLOCK

    val displayName: String
        get() = when (this) {
            NONE -> "Empty"
            PLAY_PAUSE -> "Play/Pause"
            SKIP_BACKWARD -> "Skip Back"
            SKIP_FORWARD -> "Skip Forward"
            PLAYBACK_SPEED -> "Playback Speed"
            SCRUB_BAR -> "Scrub Bar"
            STAT_PERCENT -> "Book Progress"
            STAT_PAGE -> "Page Number"
            STAT_TIME_IN_BOOK -> "Time in Book"
            STAT_TIME_IN_CHAPTER -> "Time in Chapter"
            STAT_PAGES_LEFT -> "Pages Left in Chapter"
            STAT_CHAPTER_OF -> "Chapter Number"
            STAT_CHAPTER_PERCENT -> "Chapter Progress"
            STAT_CHAPTER_ELAPSED -> "Elapsed in Chapter"
            STAT_CHAPTER_LENGTH -> "Chapter Length"
            STAT_SLEEP_TIMER -> "Sleep Timer"
            STAT_FINISH_TIME -> "Finish Time"
            STAT_SESSION_TIME -> "Session Time"
            STAT_CLOCK -> "Clock"
            STAT_BATTERY -> "Battery"
            CHAPTERS -> "Chapters"
            BOOKMARKS -> "Bookmarks"
            SEARCH -> "Search"
            TEXT_SETTINGS -> "Text Settings"
            SLEEP_TIMER -> "Sleep Timer Button"
            TITLE_BLOCK -> "Title Block"
            MIRROR -> "Swap Hands"
            SCROLL_MODE -> "Page/Scroll"
            FREE_BROWSE_LOCK -> "Free Browse Lock"
            ORIENTATION_LOCK -> "Orientation Lock"
        }

    companion object {
        fun fromRaw(raw: String?): PlayerComplication =
            entries.firstOrNull { it.rawValue == raw } ?: NONE
    }
}

val List<PlayerComplication>.hasActiveComplication: Boolean
    get() = any { it != PlayerComplication.NONE }

enum class MiniPlayerSize(val rawValue: String) {
    COMPACT("compact"),
    REGULAR("regular"),
    LARGE("large");

    companion object {
        fun fromRaw(raw: String?): MiniPlayerSize =
            entries.firstOrNull { it.rawValue == raw } ?: COMPACT
    }
}

enum class MiniPlayerLeadingStyle(val rawValue: String) {
    SINGLE("single"),
    CYCLE("cycle");

    companion object {
        fun fromRaw(raw: String?): MiniPlayerLeadingStyle = when (raw) {
            "coverTitle" -> SINGLE
            "cycleStats" -> CYCLE
            else -> entries.firstOrNull { it.rawValue == raw } ?: SINGLE
        }
    }
}

enum class MiniPlayerCycleComponent(val rawValue: String) {
    NONE("none"),
    BOOK_TITLE("bookTitle"),
    CHAPTER_TITLE("chapterTitle"),
    AUTHOR("author"),
    STAT_PAGE("statPage"),
    STAT_PERCENT("statPercent"),
    STAT_TIME_IN_CHAPTER("statTimeInChapter"),
    STAT_TIME_IN_BOOK("statTimeInBook");

    val requiresAudio: Boolean
        get() = this == STAT_TIME_IN_CHAPTER || this == STAT_TIME_IN_BOOK

    val displayName: String
        get() = when (this) {
            NONE -> "Empty"
            BOOK_TITLE -> "Book Title"
            CHAPTER_TITLE -> "Chapter Title"
            AUTHOR -> "Author"
            STAT_PAGE -> "Page Numbers"
            STAT_PERCENT -> "Book Progress"
            STAT_TIME_IN_CHAPTER -> "Time Left in Chapter"
            STAT_TIME_IN_BOOK -> "Time Left in Book"
        }

    companion object {
        fun fromRaw(raw: String?): MiniPlayerCycleComponent =
            entries.firstOrNull { it.rawValue == raw } ?: NONE
    }
}

data class MiniPlayerCycleBlock(
    val showCover: Boolean = true,
    val line1: MiniPlayerCycleComponent = MiniPlayerCycleComponent.BOOK_TITLE,
    val line2: MiniPlayerCycleComponent = MiniPlayerCycleComponent.CHAPTER_TITLE,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("showCover", showCover)
        put("line1", line1.rawValue)
        put("line2", line2.rawValue)
    }

    companion object {
        fun parse(obj: JSONObject?): MiniPlayerCycleBlock {
            val defaults = MiniPlayerCycleBlock()
            if (obj == null) return defaults
            return MiniPlayerCycleBlock(
                showCover = obj.optBoolean("showCover", defaults.showCover),
                line1 = if (obj.has("line1")) {
                    MiniPlayerCycleComponent.fromRaw(obj.optString("line1"))
                } else {
                    defaults.line1
                },
                line2 = if (obj.has("line2")) {
                    MiniPlayerCycleComponent.fromRaw(obj.optString("line2"))
                } else {
                    defaults.line2
                },
            )
        }
    }
}

enum class MiniPlayerProgressScope(val rawValue: String) {
    CHAPTER("chapter"),
    BOOK("book");

    companion object {
        fun fromRaw(raw: String?): MiniPlayerProgressScope =
            entries.firstOrNull { it.rawValue == raw } ?: CHAPTER
    }
}

enum class SlotRegion {
    MINI_CONTENT_ROW,
    MINI_STAT_BAND,
    MINI_SCRUB_ROW,
    MINI_EXTRA_ROW,
    DOCK_LEADING,
    DOCK_TRAILING,
    DOCK_CENTER,
    MENU_BAR,
}

data class SlotRef(
    val region: SlotRegion,
    val index: Int,
) {
    val id: String get() = "$region-$index"
}

// Kotlin mirror of SlotLayout in ComplicationPickerSheet.swift.
object SlotLayout {
    fun slotCount(region: SlotRegion): Int = when (region) {
        SlotRegion.MINI_CONTENT_ROW -> 5
        SlotRegion.MINI_STAT_BAND -> 4
        SlotRegion.MINI_SCRUB_ROW -> 4
        SlotRegion.MINI_EXTRA_ROW -> 4
        SlotRegion.DOCK_LEADING -> 2
        SlotRegion.DOCK_TRAILING -> 2
        SlotRegion.DOCK_CENTER -> 3
        SlotRegion.MENU_BAR -> 6
    }

    fun isMiniRow(region: SlotRegion): Boolean = when (region) {
        SlotRegion.MINI_CONTENT_ROW, SlotRegion.MINI_STAT_BAND,
        SlotRegion.MINI_SCRUB_ROW, SlotRegion.MINI_EXTRA_ROW -> true
        else -> false
    }

    val stats: List<PlayerComplication> = listOf(
        PlayerComplication.STAT_PERCENT,
        PlayerComplication.STAT_PAGE,
        PlayerComplication.STAT_PAGES_LEFT,
        PlayerComplication.STAT_CHAPTER_OF,
        PlayerComplication.STAT_CHAPTER_PERCENT,
        PlayerComplication.STAT_TIME_IN_BOOK,
        PlayerComplication.STAT_TIME_IN_CHAPTER,
        PlayerComplication.STAT_CHAPTER_ELAPSED,
        PlayerComplication.STAT_CHAPTER_LENGTH,
        PlayerComplication.STAT_FINISH_TIME,
        PlayerComplication.STAT_SESSION_TIME,
        PlayerComplication.STAT_SLEEP_TIMER,
    )

    // The dock stands in for the hidden status bar, so it alone carries the
    // stats the system would otherwise be showing.
    val dockOnlyStats: List<PlayerComplication> = listOf(
        PlayerComplication.STAT_CLOCK,
        PlayerComplication.STAT_BATTERY,
    )

    // The stat band sits in the home-indicator strip, too close to the edge of
    // the screen to aim at, so it carries readouts only.
    fun isTextOnly(region: SlotRegion): Boolean = region == SlotRegion.MINI_STAT_BAND

    fun readerControls(region: SlotRegion): List<PlayerComplication> {
        if (isTextOnly(region)) return emptyList()
        return listOf(
            PlayerComplication.CHAPTERS,
            PlayerComplication.BOOKMARKS,
            PlayerComplication.SEARCH,
            PlayerComplication.TEXT_SETTINGS,
            PlayerComplication.SLEEP_TIMER,
            PlayerComplication.MIRROR,
            PlayerComplication.SCROLL_MODE,
            PlayerComplication.FREE_BROWSE_LOCK,
            PlayerComplication.ORIENTATION_LOCK,
        )
    }

    fun playbackControls(region: SlotRegion): List<PlayerComplication> {
        if (isTextOnly(region)) return emptyList()
        if (isMiniRow(region)) {
            return listOf(
                PlayerComplication.TITLE_BLOCK,
                PlayerComplication.SCRUB_BAR,
                PlayerComplication.SKIP_BACKWARD,
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.SKIP_FORWARD,
                PlayerComplication.PLAYBACK_SPEED,
            )
        }
        return when (region) {
            SlotRegion.DOCK_CENTER, SlotRegion.MENU_BAR -> listOf(
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.SKIP_BACKWARD,
                PlayerComplication.SKIP_FORWARD,
                PlayerComplication.PLAYBACK_SPEED,
            )
            else -> emptyList()
        }
    }

    fun statComplications(region: SlotRegion): List<PlayerComplication> = when (region) {
        SlotRegion.DOCK_LEADING, SlotRegion.DOCK_TRAILING -> stats + dockOnlyStats
        else -> stats
    }

    fun allowedComplications(region: SlotRegion): List<PlayerComplication> =
        listOf(PlayerComplication.NONE) + playbackControls(region) +
            readerControls(region) + statComplications(region)

    fun padded(
        slots: List<PlayerComplication>,
        region: SlotRegion,
    ): List<PlayerComplication> {
        val count = slotCount(region)
        val result = slots.take(count).toMutableList()
        while (result.size < count) result.add(PlayerComplication.NONE)
        return result
    }

    fun sanitized(
        slots: List<PlayerComplication>,
        region: SlotRegion,
    ): List<PlayerComplication> {
        val allowed = allowedComplications(region)
        return padded(slots, region).map { if (it in allowed) it else PlayerComplication.NONE }
    }
}

private fun complicationList(array: JSONArray?): List<PlayerComplication>? {
    if (array == null) return null
    return buildList {
        for (index in 0 until array.length()) {
            add(PlayerComplication.fromRaw(array.optString(index)))
        }
    }
}

private fun complicationArray(slots: List<PlayerComplication>): JSONArray =
    JSONArray(slots.map(PlayerComplication::rawValue))

// Defaults mirror StorytellerGlobalConfig.MiniPlayer.
data class MiniPlayerCustomization(
    val size: MiniPlayerSize = MiniPlayerSize.COMPACT,
    val leadingStyle: MiniPlayerLeadingStyle = MiniPlayerLeadingStyle.SINGLE,
    val cycleFirst: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
        showCover = true,
        line1 = MiniPlayerCycleComponent.BOOK_TITLE,
        line2 = MiniPlayerCycleComponent.CHAPTER_TITLE,
    ),
    val cycleSecond: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
        showCover = true,
        line1 = MiniPlayerCycleComponent.STAT_PAGE,
        line2 = MiniPlayerCycleComponent.STAT_PERCENT,
    ),
    val cycleShowingSecond: Boolean = false,
    val progressScope: MiniPlayerProgressScope = MiniPlayerProgressScope.CHAPTER,
    val mirrored: Boolean = false,
    val contentRowSlots: List<PlayerComplication> = listOf(
        PlayerComplication.TITLE_BLOCK,
        PlayerComplication.PLAYBACK_SPEED,
        PlayerComplication.NONE,
        PlayerComplication.NONE,
        PlayerComplication.PLAY_PAUSE,
    ),
    val statSlots: List<PlayerComplication> = emptyList(),
    val scrubRowSlots: List<PlayerComplication> = listOf(
        PlayerComplication.SCRUB_BAR,
        PlayerComplication.SKIP_BACKWARD,
        PlayerComplication.PLAY_PAUSE,
        PlayerComplication.SKIP_FORWARD,
    ),
    val extraSlots: List<PlayerComplication> = listOf(
        PlayerComplication.STAT_PERCENT,
        PlayerComplication.STAT_PAGE,
        PlayerComplication.STAT_TIME_IN_BOOK,
        PlayerComplication.STAT_TIME_IN_CHAPTER,
    ),
    val progressIndicator: Boolean = true,
    val progressThickness: Double = 3.0,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("size", size.rawValue)
        put("leadingStyle", leadingStyle.rawValue)
        put("cycleFirst", cycleFirst.toJson())
        put("cycleSecond", cycleSecond.toJson())
        put("cycleShowingSecond", cycleShowingSecond)
        put("progressScope", progressScope.rawValue)
        put("mirrored", mirrored)
        put(
            "contentRowSlots",
            complicationArray(SlotLayout.sanitized(contentRowSlots, SlotRegion.MINI_CONTENT_ROW)),
        )
        put(
            "statSlots",
            complicationArray(SlotLayout.sanitized(statSlots, SlotRegion.MINI_STAT_BAND)),
        )
        put(
            "scrubRowSlots",
            complicationArray(SlotLayout.sanitized(scrubRowSlots, SlotRegion.MINI_SCRUB_ROW)),
        )
        put(
            "extraSlots",
            complicationArray(SlotLayout.sanitized(extraSlots, SlotRegion.MINI_EXTRA_ROW)),
        )
        put("progressIndicator", progressIndicator)
        put("progressThickness", progressThickness)
    }

    fun toUpdateJson(): String = toJson().toString()

    companion object {
        fun parse(obj: JSONObject): MiniPlayerCustomization {
            val defaults = MiniPlayerCustomization()
            return MiniPlayerCustomization(
                size = if (obj.has("size")) {
                    MiniPlayerSize.fromRaw(obj.optString("size"))
                } else {
                    defaults.size
                },
                leadingStyle = if (obj.has("leadingStyle")) {
                    MiniPlayerLeadingStyle.fromRaw(obj.optString("leadingStyle"))
                } else {
                    defaults.leadingStyle
                },
                cycleFirst = obj.optJSONObject("cycleFirst")
                    ?.let(MiniPlayerCycleBlock::parse) ?: defaults.cycleFirst,
                cycleSecond = obj.optJSONObject("cycleSecond")
                    ?.let(MiniPlayerCycleBlock::parse) ?: defaults.cycleSecond,
                cycleShowingSecond = obj.optBoolean(
                    "cycleShowingSecond",
                    defaults.cycleShowingSecond,
                ),
                progressScope = if (obj.has("progressScope")) {
                    MiniPlayerProgressScope.fromRaw(obj.optString("progressScope"))
                } else {
                    defaults.progressScope
                },
                mirrored = obj.optBoolean("mirrored", defaults.mirrored),
                contentRowSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("contentRowSlots"))
                        ?: defaults.contentRowSlots,
                    SlotRegion.MINI_CONTENT_ROW,
                ),
                statSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("statSlots")) ?: defaults.statSlots,
                    SlotRegion.MINI_STAT_BAND,
                ),
                scrubRowSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("scrubRowSlots")) ?: defaults.scrubRowSlots,
                    SlotRegion.MINI_SCRUB_ROW,
                ),
                extraSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("extraSlots")) ?: defaults.extraSlots,
                    SlotRegion.MINI_EXTRA_ROW,
                ),
                progressIndicator = obj.optBoolean(
                    "progressIndicator",
                    defaults.progressIndicator,
                ),
                progressThickness = obj.optDouble(
                    "progressThickness",
                    defaults.progressThickness,
                ),
            )
        }
    }
}

// Defaults mirror StorytellerGlobalConfig.ReadingBar derived overlay slot defaults.
data class DockCustomization(
    val leadingSlots: List<PlayerComplication> = listOf(
        PlayerComplication.STAT_PERCENT,
        PlayerComplication.STAT_PAGE,
    ),
    val trailingSlots: List<PlayerComplication> = listOf(
        PlayerComplication.STAT_TIME_IN_BOOK,
        PlayerComplication.STAT_TIME_IN_CHAPTER,
    ),
    val centerSlots: List<PlayerComplication> = listOf(
        PlayerComplication.SKIP_BACKWARD,
        PlayerComplication.PLAY_PAUSE,
        PlayerComplication.SKIP_FORWARD,
    ),
    val transparency: Double = 0.8,
    val progressIndicator: Boolean = true,
    val progressThickness: Double = 3.0,
    val progressScope: MiniPlayerProgressScope = MiniPlayerProgressScope.CHAPTER,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put(
            "leadingSlots",
            complicationArray(SlotLayout.sanitized(leadingSlots, SlotRegion.DOCK_LEADING)),
        )
        put(
            "trailingSlots",
            complicationArray(SlotLayout.sanitized(trailingSlots, SlotRegion.DOCK_TRAILING)),
        )
        put(
            "centerSlots",
            complicationArray(SlotLayout.sanitized(centerSlots, SlotRegion.DOCK_CENTER)),
        )
        put("transparency", transparency)
        put("progressIndicator", progressIndicator)
        put("progressThickness", progressThickness)
        put("progressScope", progressScope.rawValue)
    }

    fun toUpdateJson(): String = toJson().toString()

    companion object {
        fun parse(obj: JSONObject): DockCustomization {
            val defaults = DockCustomization()
            return DockCustomization(
                leadingSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("leadingSlots")) ?: defaults.leadingSlots,
                    SlotRegion.DOCK_LEADING,
                ),
                trailingSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("trailingSlots")) ?: defaults.trailingSlots,
                    SlotRegion.DOCK_TRAILING,
                ),
                centerSlots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("centerSlots")) ?: defaults.centerSlots,
                    SlotRegion.DOCK_CENTER,
                ),
                transparency = obj.optDouble("transparency", defaults.transparency),
                progressIndicator = obj.optBoolean(
                    "progressIndicator",
                    defaults.progressIndicator,
                ),
                progressThickness = obj.optDouble(
                    "progressThickness",
                    defaults.progressThickness,
                ),
                progressScope = if (obj.has("progressScope")) {
                    MiniPlayerProgressScope.fromRaw(obj.optString("progressScope"))
                } else {
                    defaults.progressScope
                },
            )
        }
    }
}

data class MenuBarCustomization(
    val slots: List<PlayerComplication> = listOf(
        PlayerComplication.SLEEP_TIMER,
        PlayerComplication.CHAPTERS,
        PlayerComplication.BOOKMARKS,
        PlayerComplication.SEARCH,
        PlayerComplication.NONE,
        PlayerComplication.NONE,
    ),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("slots", complicationArray(SlotLayout.sanitized(slots, SlotRegion.MENU_BAR)))
    }

    fun toUpdateJson(): String = toJson().toString()

    companion object {
        fun parse(obj: JSONObject): MenuBarCustomization {
            val defaults = MenuBarCustomization()
            return MenuBarCustomization(
                slots = SlotLayout.sanitized(
                    complicationList(obj.optJSONArray("slots")) ?: defaults.slots,
                    SlotRegion.MENU_BAR,
                ),
            )
        }
    }
}

// Defaults mirror kDefaultFreeBrowseMode / kDefaultReadaloudHighlightVisibility / kDefaultDoubleTapPlay.
data class PlaybackModes(
    val freeBrowseMode: String = "never",
    val readaloudHighlightVisibility: String = "paused",
    val doubleTapPlay: String = "headphones",
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("freeBrowseMode", freeBrowseMode)
        put("readaloudHighlightVisibility", readaloudHighlightVisibility)
        put("doubleTapPlay", doubleTapPlay)
    }

    fun toUpdateJson(): String = toJson().toString()

    companion object {
        private val freeBrowseValues = setOf("never", "paused", "always")
        private val highlightVisibilityValues = setOf("playing", "paused", "always")
        private val doubleTapPlayValues = setOf("never", "always", "headphones")

        fun parse(obj: JSONObject): PlaybackModes {
            val defaults = PlaybackModes()
            return PlaybackModes(
                freeBrowseMode = obj.optString("freeBrowseMode", defaults.freeBrowseMode)
                    .takeIf { it in freeBrowseValues } ?: defaults.freeBrowseMode,
                readaloudHighlightVisibility = obj.optString(
                    "readaloudHighlightVisibility",
                    defaults.readaloudHighlightVisibility,
                ).takeIf { it in highlightVisibilityValues }
                    ?: defaults.readaloudHighlightVisibility,
                doubleTapPlay = obj.optString("doubleTapPlay", defaults.doubleTapPlay)
                    .takeIf { it in doubleTapPlayValues } ?: defaults.doubleTapPlay,
            )
        }
    }
}

// Sparse payload for readerControl("updateCustomization", 0.0, json).
fun customizationUpdateJson(
    miniPlayer: MiniPlayerCustomization? = null,
    dock: DockCustomization? = null,
    menuBar: MenuBarCustomization? = null,
    playbackModes: PlaybackModes? = null,
): String = JSONObject().apply {
    miniPlayer?.let { put("miniPlayer", it.toJson()) }
    dock?.let { put("dock", it.toJson()) }
    menuBar?.let { put("menuBar", it.toJson()) }
    playbackModes?.let { put("playbackModes", it.toJson()) }
}.toString()
