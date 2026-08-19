package dev.smoores.storyteller.model

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
class CustomizationJsonTest {
    @Test
    fun miniPlayerRoundTripsThroughJson() {
        val custom = MiniPlayerCustomization(
            size = MiniPlayerSize.LARGE,
            leadingStyle = MiniPlayerLeadingStyle.CYCLE,
            cycleFirst = MiniPlayerCycleBlock(
                showCover = false,
                line1 = MiniPlayerCycleComponent.AUTHOR,
                line2 = MiniPlayerCycleComponent.STAT_PERCENT,
            ),
            cycleShowingSecond = true,
            progressScope = MiniPlayerProgressScope.BOOK,
            mirrored = true,
            contentRowSlots = listOf(
                PlayerComplication.TITLE_BLOCK,
                PlayerComplication.CHAPTERS,
                PlayerComplication.NONE,
                PlayerComplication.SLEEP_TIMER,
                PlayerComplication.PLAY_PAUSE,
            ),
            statSlots = listOf(
                PlayerComplication.STAT_PERCENT,
                PlayerComplication.STAT_PAGE,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
            ),
            progressIndicator = false,
            progressThickness = 6.0,
        )
        val parsed = MiniPlayerCustomization.parse(JSONObject(custom.toUpdateJson()))
        assertEquals(custom, parsed)
    }

    @Test
    fun miniPlayerParseIsLenientAndSanitizes() {
        val parsed = MiniPlayerCustomization.parse(
            JSONObject(
                """
                {"size":"enormous","leadingStyle":"cycleStats",
                 "contentRowSlots":["statClock","playPause"],
                 "statSlots":["playPause","statPage","statPercent","statPage","statPage"]}
                """.trimIndent(),
            ),
        )
        val defaults = MiniPlayerCustomization()
        assertEquals(MiniPlayerSize.COMPACT, parsed.size)
        assertEquals(MiniPlayerLeadingStyle.CYCLE, parsed.leadingStyle)
        assertEquals(defaults.cycleFirst, parsed.cycleFirst)
        assertEquals(defaults.cycleSecond, parsed.cycleSecond)
        assertEquals(
            listOf(
                PlayerComplication.NONE,
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
            ),
            parsed.contentRowSlots,
        )
        assertEquals(
            listOf(
                PlayerComplication.NONE,
                PlayerComplication.STAT_PAGE,
                PlayerComplication.STAT_PERCENT,
                PlayerComplication.STAT_PAGE,
            ),
            parsed.statSlots,
        )
        assertEquals(defaults.progressThickness, parsed.progressThickness, 0.0)
    }

    @Test
    fun emptyObjectParsesToSanitizedDefaults() {
        val defaults = MiniPlayerCustomization()
        val parsed = MiniPlayerCustomization.parse(JSONObject())
        assertEquals(defaults.contentRowSlots, parsed.contentRowSlots)
        assertEquals(List(4) { PlayerComplication.NONE }, parsed.statSlots)
        assertEquals(defaults.scrubRowSlots, parsed.scrubRowSlots)
        assertEquals(defaults.extraSlots, parsed.extraSlots)
    }

    @Test
    fun dockRoundTripsThroughJson() {
        val custom = DockCustomization(
            leadingSlots = listOf(PlayerComplication.STAT_CLOCK, PlayerComplication.STAT_BATTERY),
            trailingSlots = listOf(
                PlayerComplication.STAT_FINISH_TIME,
                PlayerComplication.NONE,
            ),
            centerSlots = listOf(
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.SKIP_FORWARD,
                PlayerComplication.PLAYBACK_SPEED,
            ),
            transparency = 0.45,
            progressIndicator = false,
            progressThickness = 5.0,
            progressScope = MiniPlayerProgressScope.BOOK,
        )
        assertEquals(custom, DockCustomization.parse(JSONObject(custom.toUpdateJson())))
    }

    @Test
    fun dockParseSanitizesMiniOnlyComplications() {
        val parsed = DockCustomization.parse(
            JSONObject("""{"centerSlots":["scrubBar","playPause","titleBlock"]}"""),
        )
        assertEquals(
            listOf(
                PlayerComplication.NONE,
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.NONE,
            ),
            parsed.centerSlots,
        )
    }

    @Test
    fun menuBarRoundTripsAndSanitizes() {
        val custom = MenuBarCustomization(
            slots = listOf(
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.STAT_PERCENT,
                PlayerComplication.NONE,
                PlayerComplication.SEARCH,
                PlayerComplication.MIRROR,
                PlayerComplication.NONE,
            ),
        )
        assertEquals(custom, MenuBarCustomization.parse(JSONObject(custom.toUpdateJson())))

        val parsed = MenuBarCustomization.parse(
            JSONObject("""{"slots":["statClock","chapters"]}"""),
        )
        assertEquals(
            listOf(
                PlayerComplication.NONE,
                PlayerComplication.CHAPTERS,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
                PlayerComplication.NONE,
            ),
            parsed.slots,
        )
    }

    @Test
    fun playbackModesParseClampsUnknownValues() {
        val parsed = PlaybackModes.parse(
            JSONObject(
                """{"freeBrowseMode":"sometimes","readaloudHighlightVisibility":"always",
                    "doubleTapPlay":"triple"}""",
            ),
        )
        assertEquals("never", parsed.freeBrowseMode)
        assertEquals("always", parsed.readaloudHighlightVisibility)
        assertEquals("headphones", parsed.doubleTapPlay)

        val custom = PlaybackModes("always", "playing", "never")
        assertEquals(custom, PlaybackModes.parse(JSONObject(custom.toUpdateJson())))
    }

    @Test
    fun playbackModesParseHandlesAutomaticRewind() {
        val defaults = PlaybackModes.parse(JSONObject("{}"))
        assertEquals(true, defaults.automaticRewindEnabled)
        assertEquals(3.0, defaults.automaticRewindAfterInterruption, 0.0)
        assertEquals(10.0, defaults.automaticRewindAfterBreak, 0.0)

        val parsed = PlaybackModes.parse(
            JSONObject(
                """{"automaticRewindEnabled":false,"automaticRewindAfterInterruption":-5,
                    "automaticRewindAfterBreak":900}""",
            ),
        )
        assertEquals(false, parsed.automaticRewindEnabled)
        assertEquals(0.0, parsed.automaticRewindAfterInterruption, 0.0)
        assertEquals(60.0, parsed.automaticRewindAfterBreak, 0.0)
    }

    @Test
    fun customizationUpdateJsonIsSparse() {
        val empty = JSONObject(customizationUpdateJson())
        assertEquals(0, empty.length())

        val dockOnly = JSONObject(customizationUpdateJson(dock = DockCustomization()))
        assertTrue(dockOnly.has("dock"))
        assertFalse(dockOnly.has("miniPlayer"))
        assertFalse(dockOnly.has("menuBar"))
        assertFalse(dockOnly.has("playbackModes"))
        assertEquals(0.8, dockOnly.getJSONObject("dock").getDouble("transparency"), 0.0)

        val menuBarOnly = JSONObject(customizationUpdateJson(menuBar = MenuBarCustomization()))
        assertTrue(menuBarOnly.has("menuBar"))
        assertFalse(menuBarOnly.has("topBar"))

        val both = JSONObject(
            customizationUpdateJson(
                miniPlayer = MiniPlayerCustomization(size = MiniPlayerSize.REGULAR),
                playbackModes = PlaybackModes(freeBrowseMode = "paused"),
            ),
        )
        assertEquals("regular", both.getJSONObject("miniPlayer").getString("size"))
        assertEquals("paused", both.getJSONObject("playbackModes").getString("freeBrowseMode"))
        assertFalse(both.has("dock"))
    }

    @Test
    fun miniPlayerJsonUsesPinnedKeysAndRawValues() {
        val json = JSONObject(MiniPlayerCustomization().toUpdateJson())
        assertEquals("compact", json.getString("size"))
        assertEquals("single", json.getString("leadingStyle"))
        assertEquals("chapter", json.getString("progressScope"))
        assertEquals("bookTitle", json.getJSONObject("cycleFirst").getString("line1"))
        assertEquals("statPage", json.getJSONObject("cycleSecond").getString("line1"))
        val content = json.getJSONArray("contentRowSlots")
        assertEquals(5, content.length())
        assertEquals("titleBlock", content.getString(0))
        assertEquals("playPause", content.getString(4))
        assertEquals(4, json.getJSONArray("statSlots").length())
        assertTrue(json.getBoolean("progressIndicator"))
        assertEquals(3.0, json.getDouble("progressThickness"), 0.0)
    }
}
