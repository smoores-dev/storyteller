package dev.smoores.storyteller.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerComplicationTest {
    @Test
    fun rawValuesRoundTripThroughFromRaw() {
        for (comp in PlayerComplication.entries) {
            assertEquals(comp, PlayerComplication.fromRaw(comp.rawValue))
        }
    }

    @Test
    fun unknownAndNullRawFallBackToNone() {
        assertEquals(PlayerComplication.NONE, PlayerComplication.fromRaw("someFutureWidget"))
        assertEquals(PlayerComplication.NONE, PlayerComplication.fromRaw(null))
        assertEquals(PlayerComplication.NONE, PlayerComplication.fromRaw(""))
    }

    @Test
    fun requiresAudioMatchesTheSwiftSet() {
        val expected = setOf(
            PlayerComplication.PLAY_PAUSE,
            PlayerComplication.SKIP_BACKWARD,
            PlayerComplication.SKIP_FORWARD,
            PlayerComplication.PLAYBACK_SPEED,
            PlayerComplication.SCRUB_BAR,
            PlayerComplication.STAT_TIME_IN_BOOK,
            PlayerComplication.STAT_TIME_IN_CHAPTER,
            PlayerComplication.STAT_CHAPTER_ELAPSED,
            PlayerComplication.STAT_CHAPTER_LENGTH,
            PlayerComplication.STAT_SLEEP_TIMER,
            PlayerComplication.STAT_FINISH_TIME,
            PlayerComplication.SLEEP_TIMER,
            PlayerComplication.FREE_BROWSE_LOCK,
        )
        assertEquals(expected, PlayerComplication.entries.filter { it.requiresAudio }.toSet())
    }

    @Test
    fun onlyScrubBarAndTitleBlockExpand() {
        assertEquals(
            setOf(PlayerComplication.SCRUB_BAR, PlayerComplication.TITLE_BLOCK),
            PlayerComplication.entries.filter { it.isExpanding }.toSet(),
        )
    }

    @Test
    fun hasActiveComplicationIgnoresNone() {
        assertFalse(emptyList<PlayerComplication>().hasActiveComplication)
        assertFalse(listOf(PlayerComplication.NONE, PlayerComplication.NONE).hasActiveComplication)
        assertTrue(
            listOf(PlayerComplication.NONE, PlayerComplication.STAT_PAGE).hasActiveComplication,
        )
    }

    @Test
    fun lenientEnumsFallBackToTheirDefaults() {
        assertEquals(MiniPlayerSize.COMPACT, MiniPlayerSize.fromRaw("gigantic"))
        assertEquals(MiniPlayerSize.LARGE, MiniPlayerSize.fromRaw("large"))
        assertEquals(MiniPlayerProgressScope.CHAPTER, MiniPlayerProgressScope.fromRaw(null))
        assertEquals(MiniPlayerProgressScope.BOOK, MiniPlayerProgressScope.fromRaw("book"))
        assertEquals(MiniPlayerCycleComponent.NONE, MiniPlayerCycleComponent.fromRaw("bogus"))
        assertEquals(MiniPlayerCycleComponent.AUTHOR, MiniPlayerCycleComponent.fromRaw("author"))
    }

    @Test
    fun leadingStyleRemapsLegacyRawValues() {
        assertEquals(MiniPlayerLeadingStyle.SINGLE, MiniPlayerLeadingStyle.fromRaw("coverTitle"))
        assertEquals(MiniPlayerLeadingStyle.CYCLE, MiniPlayerLeadingStyle.fromRaw("cycleStats"))
        assertEquals(MiniPlayerLeadingStyle.SINGLE, MiniPlayerLeadingStyle.fromRaw("unknown"))
        assertEquals(MiniPlayerLeadingStyle.CYCLE, MiniPlayerLeadingStyle.fromRaw("cycle"))
    }

    @Test
    fun cycleComponentRequiresAudioOnlyForTimeStats() {
        assertEquals(
            setOf(
                MiniPlayerCycleComponent.STAT_TIME_IN_CHAPTER,
                MiniPlayerCycleComponent.STAT_TIME_IN_BOOK,
            ),
            MiniPlayerCycleComponent.entries.filter { it.requiresAudio }.toSet(),
        )
    }
}
