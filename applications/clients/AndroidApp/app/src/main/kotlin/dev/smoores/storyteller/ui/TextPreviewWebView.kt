package dev.smoores.storyteller.ui

import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import dev.smoores.storyteller.model.ReaderDisplaySettings

private data class BundledFont(
    val file: String,
    val family: String,
    val weight: String,
    val italic: Boolean,
)

private val bundledReaderFonts = listOf(
    BundledFont("Literata.ttf", "Literata", "200 900", false),
    BundledFont("Literata-Italic.ttf", "Literata", "200 900", true),
    BundledFont("Charis-Regular.ttf", "Charis", "400", false),
    BundledFont("Charis-Bold.ttf", "Charis", "700", false),
    BundledFont("Charis-Italic.ttf", "Charis", "400", true),
    BundledFont("Charis-BoldItalic.ttf", "Charis", "700", true),
    BundledFont("YsabeauInfant.ttf", "Ysabeau Infant", "1 1000", false),
    BundledFont("YsabeauInfant-Italic.ttf", "Ysabeau Infant", "1 1000", true),
    BundledFont("OpenSans.ttf", "Open Sans", "300 800", false),
    BundledFont("OpenSans-Italic.ttf", "Open Sans", "300 800", true),
    BundledFont("AtkinsonHyperlegible-Regular.ttf", "Atkinson Hyperlegible", "400", false),
    BundledFont("AtkinsonHyperlegible-Bold.ttf", "Atkinson Hyperlegible", "700", false),
    BundledFont("AtkinsonHyperlegible-Italic.ttf", "Atkinson Hyperlegible", "400", true),
    BundledFont("AtkinsonHyperlegible-BoldItalic.ttf", "Atkinson Hyperlegible", "700", true),
    BundledFont("OpenDyslexic-Regular.otf", "OpenDyslexic", "400", false),
    BundledFont("OpenDyslexic-Bold.otf", "OpenDyslexic", "700", false),
    BundledFont("OpenDyslexic-Italic.otf", "OpenDyslexic", "400", true),
    BundledFont("OpenDyslexic-Bold-Italic.otf", "OpenDyslexic", "700", true),
)

private fun cssColor(color: Color): String =
    String.format("#%06X", color.toArgb() and 0xFFFFFF)

private fun fontFaceCSS(family: String): String =
    bundledReaderFonts.filter { it.family == family }.joinToString("\n") { font ->
        """
        @font-face {
            font-family: '${font.family}';
            src: url('/fonts/${font.file}');
            font-weight: ${font.weight};
            font-style: ${if (font.italic) "italic" else "normal"};
        }
        """.trimIndent()
    }

private fun previewHtml(
    settings: ReaderDisplaySettings,
    background: Color,
    foreground: Color,
    samples: List<String>,
): String {
    val resolvedFamily =
        if (settings.fontFamily == "System Default") "serif" else settings.fontFamily
    val generics = listOf("serif", "sans-serif", "monospace")
    val fontFamilyCSS = if (resolvedFamily in generics) {
        "font-family: $resolvedFamily;"
    } else {
        "font-family: \"$resolvedFamily\", serif;"
    }
    val paragraphGap = if (settings.paragraphSpacing > 0) settings.paragraphSpacing else 1.0
    val firstLineIndentCSS =
        if (settings.firstLineIndent) "p { text-indent: 1.4em; }" else ""
    return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
        <style>
        ${fontFaceCSS(settings.fontFamily)}
        html, body {
            margin: 0;
            overflow-x: hidden;
            background-color: ${cssColor(background)};
            -webkit-user-select: none;
            user-select: none;
        }
        body {
            padding-left: ${settings.marginLeftRight}%;
            padding-right: ${settings.marginLeftRight}%;
            padding-top: calc(10px + ${settings.marginTop}vh);
            padding-bottom: ${settings.marginBottom}vh;
        }
        p {
            margin-top: 0;
            margin-bottom: ${paragraphGap}em;
            font-size: ${settings.fontSize}px;
            $fontFamilyCSS
            line-height: ${settings.lineSpacing};
            text-align: ${settings.textAlignment};
            -webkit-hyphens: manual;
            hyphens: manual;
            hanging-punctuation: allow-end last;
            word-spacing: ${settings.wordSpacing}em;
            letter-spacing: ${settings.letterSpacing}em;
            color: ${cssColor(foreground)};
        }
        $firstLineIndentCSS
        </style>
        </head>
        <body>
        ${samples.joinToString("\n") { "<p>$it</p>" }}
        </body>
        </html>
    """.trimIndent()
}

@Composable
internal fun TextSettingsPreviewWebView(
    settings: ReaderDisplaySettings,
    background: Color,
    foreground: Color,
    samples: List<String>,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        factory = { context ->
            val assets = WebViewAssetLoader.AssetsPathHandler(context)
            val assetLoader = WebViewAssetLoader.Builder()
                .addPathHandler("/fonts/") { path -> assets.handle("reader-fonts/$path") }
                .build()
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                this.settings.allowFileAccess = false
                this.settings.allowContentAccess = false
                isHorizontalScrollBarEnabled = false
                webViewClient = object : WebViewClientCompat() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest,
                    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
                }
            }
        },
        update = { webView ->
            val html = previewHtml(settings, background, foreground, samples)
            if (webView.tag != html) {
                webView.tag = html
                webView.loadDataWithBaseURL(
                    "https://appassets.androidplatform.net/",
                    html,
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        },
        modifier = modifier,
    )
}
