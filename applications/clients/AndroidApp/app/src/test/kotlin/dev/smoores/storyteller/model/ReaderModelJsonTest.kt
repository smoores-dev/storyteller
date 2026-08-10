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
class ReaderModelJsonTest {
    @Test
    fun displaySettingsUpdateJsonCarriesSplitMarginsAndReadaloudKeys() {
        val json = JSONObject(
            ReaderDisplaySettings(
                marginTop = 12.0,
                marginBottom = 8.0,
                readaloudDimOthers = true,
                readaloudDimAmount = 0.7,
            ).toUpdateJson(),
        )
        assertEquals(12.0, json.getDouble("marginTop"), 0.0)
        assertEquals(8.0, json.getDouble("marginBottom"), 0.0)
        assertTrue(json.getBoolean("readaloudDimOthers"))
        assertEquals(0.7, json.getDouble("readaloudDimAmount"), 0.0)
        assertTrue(json.has("marginTopBottom"))
    }

    @Test
    fun themeEditJsonCarriesReadaloudStyleFields() {
        val theme = ReaderTheme(
            id = "t1",
            name = "Test",
            isBuiltIn = false,
            isEdited = false,
            appearance = "any",
            backgroundColor = "#FFFFFF",
            foregroundColor = "#000000",
            highlightColor = "#FFFF00",
            highlightThickness = 1.0,
            readaloudHighlightMode = "underline",
            userHighlightMode = "underline",
            userHighlightColors = emptyList(),
            userHighlightLabels = emptyList(),
            customCSS = null,
            readaloudHighlightFade = 0.3,
            readaloudTextItalic = true,
            readaloudTextBold = false,
            readaloudUnderlineStyle = "squiggle",
        )
        val json = JSONObject(theme.toEditJson(includeId = true))
        assertEquals(0.3, json.getDouble("readaloudHighlightFade"), 0.0)
        assertTrue(json.getBoolean("readaloudTextItalic"))
        assertFalse(json.getBoolean("readaloudTextBold"))
        assertEquals("squiggle", json.getString("readaloudUnderlineStyle"))
    }
}
