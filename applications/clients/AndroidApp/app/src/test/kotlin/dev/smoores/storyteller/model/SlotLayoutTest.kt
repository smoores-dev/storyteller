package dev.smoores.storyteller.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlotLayoutTest {
    @Test
    fun slotCountsMatchIos() {
        assertEquals(5, SlotLayout.slotCount(SlotRegion.MINI_CONTENT_ROW))
        assertEquals(4, SlotLayout.slotCount(SlotRegion.MINI_STAT_BAND))
        assertEquals(4, SlotLayout.slotCount(SlotRegion.MINI_SCRUB_ROW))
        assertEquals(4, SlotLayout.slotCount(SlotRegion.MINI_EXTRA_ROW))
        assertEquals(2, SlotLayout.slotCount(SlotRegion.DOCK_LEADING))
        assertEquals(2, SlotLayout.slotCount(SlotRegion.DOCK_TRAILING))
        assertEquals(3, SlotLayout.slotCount(SlotRegion.DOCK_CENTER))
        assertEquals(6, SlotLayout.slotCount(SlotRegion.MENU_BAR))
    }

    @Test
    fun paddedTruncatesAndFillsWithNone() {
        val short = listOf(PlayerComplication.STAT_PAGE)
        assertEquals(
            listOf(PlayerComplication.STAT_PAGE, PlayerComplication.NONE),
            SlotLayout.padded(short, SlotRegion.DOCK_LEADING),
        )
        val long = List(5) { PlayerComplication.STAT_PAGE }
        assertEquals(2, SlotLayout.padded(long, SlotRegion.DOCK_TRAILING).size)
        assertEquals(6, SlotLayout.padded(emptyList(), SlotRegion.MENU_BAR).size)
    }

    @Test
    fun sanitizedBlanksDisallowedComplications() {
        val result = SlotLayout.sanitized(
            listOf(PlayerComplication.TITLE_BLOCK, PlayerComplication.STAT_CLOCK),
            SlotRegion.DOCK_LEADING,
        )
        assertEquals(
            listOf(PlayerComplication.NONE, PlayerComplication.STAT_CLOCK),
            result,
        )
    }

    @Test
    fun dockOnlyStatsAreDisallowedOutsideDockSides() {
        for (region in listOf(
            SlotRegion.MINI_CONTENT_ROW,
            SlotRegion.MINI_STAT_BAND,
            SlotRegion.MINI_SCRUB_ROW,
            SlotRegion.MINI_EXTRA_ROW,
            SlotRegion.DOCK_CENTER,
            SlotRegion.MENU_BAR,
        )) {
            val allowed = SlotLayout.allowedComplications(region)
            assertFalse("$region", PlayerComplication.STAT_CLOCK in allowed)
            assertFalse("$region", PlayerComplication.STAT_BATTERY in allowed)
        }
        for (region in listOf(SlotRegion.DOCK_LEADING, SlotRegion.DOCK_TRAILING)) {
            val allowed = SlotLayout.allowedComplications(region)
            assertTrue(PlayerComplication.STAT_CLOCK in allowed)
            assertTrue(PlayerComplication.STAT_BATTERY in allowed)
        }
    }

    @Test
    fun statBandIsTextOnly() {
        val allowed = SlotLayout.allowedComplications(SlotRegion.MINI_STAT_BAND)
        assertEquals(
            (listOf(PlayerComplication.NONE) + SlotLayout.stats).toSet(),
            allowed.toSet(),
        )
        val result = SlotLayout.sanitized(
            listOf(
                PlayerComplication.PLAY_PAUSE,
                PlayerComplication.CHAPTERS,
                PlayerComplication.STAT_PERCENT,
            ),
            SlotRegion.MINI_STAT_BAND,
        )
        assertEquals(
            listOf(
                PlayerComplication.NONE,
                PlayerComplication.NONE,
                PlayerComplication.STAT_PERCENT,
                PlayerComplication.NONE,
            ),
            result,
        )
    }

    @Test
    fun titleBlockAndScrubBarAreMiniRowOnly() {
        for (region in SlotRegion.entries) {
            val allowed = SlotLayout.allowedComplications(region)
            val expected = SlotLayout.isMiniRow(region) && !SlotLayout.isTextOnly(region)
            assertEquals("$region", expected, PlayerComplication.TITLE_BLOCK in allowed)
            assertEquals("$region", expected, PlayerComplication.SCRUB_BAR in allowed)
        }
    }

    @Test
    fun dockSidesCarryNoControls() {
        for (region in listOf(SlotRegion.DOCK_LEADING, SlotRegion.DOCK_TRAILING)) {
            assertTrue(SlotLayout.playbackControls(region).isEmpty())
            assertFalse(SlotLayout.readerControls(region).isEmpty())
        }
    }

    @Test
    fun dockCenterAndMenuBarShareTransportControls() {
        val expected = listOf(
            PlayerComplication.PLAY_PAUSE,
            PlayerComplication.SKIP_BACKWARD,
            PlayerComplication.SKIP_FORWARD,
            PlayerComplication.PLAYBACK_SPEED,
        )
        assertEquals(expected, SlotLayout.playbackControls(SlotRegion.DOCK_CENTER))
        assertEquals(expected, SlotLayout.playbackControls(SlotRegion.MENU_BAR))
    }
}
