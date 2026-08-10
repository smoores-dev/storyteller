package dev.smoores.storyteller.platform

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
class AndroidNowPlayingBridgeTest {
    @Test
    fun parsesTheChapterPayloadSwiftEncodes() {
        val state = AndroidNowPlayingBridge.parseChapters(
            """
            {"currentChapterID":"c2","currentChapterIndex":1,"chapters":[
              {"id":"c1","title":"One","duration":100.0},
              {"id":"c2","title":"Two","duration":120.5}
            ]}
            """.trimIndent(),
        )

        assertEquals("c2", state?.currentChapterID)
        assertEquals(1, state?.currentChapterIndex)
        assertEquals(2, state?.chapters?.size)
        assertEquals("One", state?.chapters?.get(0)?.title)
        assertEquals(120.5, state?.chapters?.get(1)?.durationSeconds)
    }

    // JSONEncoder omits nil optionals rather than emitting null, so the keys are
    // absent instead of null when there is no current chapter.
    @Test
    fun toleratesTheOmittedKeysSwiftProducesForNilOptionals() {
        val state = AndroidNowPlayingBridge.parseChapters(
            """{"chapters":[{"id":"c1","title":"One","duration":100.0}]}""",
        )

        assertEquals(1, state?.chapters?.size)
        assertNull(state?.currentChapterID)
        assertNull(state?.currentChapterIndex)
    }

    @Test
    fun treatsExplicitNullsAsAbsentRatherThanTheStringNull() {
        val state = AndroidNowPlayingBridge.parseChapters(
            """
            {"currentChapterID":null,"currentChapterIndex":null,
             "chapters":[{"id":"c1","title":"One","duration":100.0}]}
            """.trimIndent(),
        )

        assertNull(state?.currentChapterID)
        assertNull(state?.currentChapterIndex)
    }

    @Test
    fun treatsANullChapterTitleAsBlankAndANullChapterIdAsUnusable() {
        val titled = AndroidNowPlayingBridge.parseChapters(
            """{"chapters":[{"id":"c1","title":null,"duration":100.0}]}""",
        )
        assertEquals("", titled?.chapters?.get(0)?.title)

        assertNull(
            AndroidNowPlayingBridge.parseChapters(
                """{"chapters":[{"id":null,"title":"One","duration":100.0}]}""",
            ),
        )
    }

    // A literal "null" string is a real value, not a missing one.
    @Test
    fun keepsTheLiteralStringNullAsAValue() {
        val state = AndroidNowPlayingBridge.parseChapters(
            """{"currentChapterID":"null","chapters":[{"id":"null","title":"null","duration":1.0}]}""",
        )

        assertEquals("null", state?.currentChapterID)
        assertEquals("null", state?.chapters?.get(0)?.id)
        assertEquals("null", state?.chapters?.get(0)?.title)
    }

    // Dropping one entry would shift every later index out of step with the
    // currentChapterIndex the sender computed.
    @Test
    fun rejectsTheWholePayloadWhenAnEntryIsUnusable() {
        val state = AndroidNowPlayingBridge.parseChapters(
            """
            {"currentChapterIndex":2,"chapters":[
              {"id":"c1","title":"One","duration":100.0},
              {"title":"Missing an id","duration":100.0},
              {"id":"c3","title":"Three","duration":100.0}
            ]}
            """.trimIndent(),
        )

        assertNull(state)
    }

    @Test
    fun rejectsEmptyMalformedAndChapterlessPayloads() {
        assertNull(AndroidNowPlayingBridge.parseChapters(""))
        assertNull(AndroidNowPlayingBridge.parseChapters("not json"))
        assertNull(AndroidNowPlayingBridge.parseChapters("""{"chapters":[]}"""))
        assertNull(AndroidNowPlayingBridge.parseChapters("""{"currentChapterIndex":0}"""))
    }
}
