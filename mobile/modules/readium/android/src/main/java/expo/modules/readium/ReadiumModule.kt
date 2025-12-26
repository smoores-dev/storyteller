@file:OptIn(InternalReadiumApi::class)

package expo.modules.readium

import android.graphics.Color
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URI
import java.net.URL
import java.util.Base64
import org.json.JSONObject
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.TextAlign
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.data.decodeString
import org.readium.r2.shared.util.data.readDecodeOrNull
import androidx.core.graphics.toColorInt

class ReadiumModule : Module() {
    // Each module class must implement the definition function. The definition consists of
    // components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    @RequiresApi(Build.VERSION_CODES.O)
    @OptIn(ExperimentalReadiumApi::class)
    override fun definition() = ModuleDefinition {
        val bookService = BookService()

        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a
        // string as an argument.
        // Can be inferred from module's class name, but it's recommended to set it explicitly for
        // clarity.
        // The module will be accessible from `requireNativeModule('Readium')` in JavaScript.
        Name("Readium")

        AsyncFunction("extractArchive") Coroutine
                { archiveUrl: URL, extractedUrl: URL ->
                    bookService.extractArchive(archiveUrl, extractedUrl)
                }

        // Defines a JavaScript function that always returns a Promise and whose native code
        // is by default dispatched on the different thread than the JavaScript runtime runs on.
        AsyncFunction("openPublication") Coroutine
                { bookUuid: String, publicationUri: URL ->
                    return@Coroutine bookService.openPublication(bookUuid, publicationUri)
                        .manifest.toJSON().toMap()
                }

        AsyncFunction("buildAudiobookManifest") Coroutine
                { bookUuid: String ->
                    bookService.buildAudiobookManifest(bookUuid).toJSON().toMap()
                }

        AsyncFunction("getResource") Coroutine
                { bookUuid: String, linkMap: Map<String, Any> ->
                    val linkJson = JSONObject(linkMap)
                    val link = Link.fromJSON(linkJson) ?: return@Coroutine null
                    val resource = bookService.getResource(bookUuid, link)
                    if (link.mediaType?.isBitmap == true) {
                        val data = resource?.read()?.getOrNull() ?: return@Coroutine null
                        return@Coroutine String(Base64.getEncoder().encode(data))
                    }
                    return@Coroutine resource?.readDecodeOrNull { it.decodeString() }
                }

        AsyncFunction("getPositions") Coroutine
                { bookUuid: String ->
                    val positions = bookService.getPositions(bookUuid)
                    return@Coroutine positions.map { it.toJSON().toMap() }
                }

        AsyncFunction("getClip") Coroutine
                { bookUuid: String, locatorMap: Map<String, Any> ->
                    val locatorJson = JSONObject(locatorMap)
                    val locator = Locator.fromJSON(locatorJson) ?: return@Coroutine null
                    val clip = bookService.getClip(bookUuid, locator) ?: return@Coroutine null
                    val relativeUrl = URI(null, clip.audioResource, null).toASCIIString()
                    return@Coroutine mutableMapOf(
                        "relativeUrl" to relativeUrl,
                        "fragmentId" to clip.fragmentId,
                        "start" to clip.start,
                        "end" to clip.end,
                        "duration" to clip.end!! - clip.start!!
                    )
                }

        AsyncFunction("getFragment") Coroutine
                { bookUuid: String, clipUrl: String, position: Double ->
                    val fragment =
                        bookService.getFragment(bookUuid, clipUrl, position)
                            ?: return@Coroutine null
                    return@Coroutine mutableMapOf(
                        "href" to fragment.href,
                        "fragment" to fragment.fragment,
                        "locator" to fragment.locator?.toJSON()?.toMap()
                    )
                }

        AsyncFunction("getNextFragment") Coroutine { bookUuid: String, locatorMap: Map<String, Any> ->
            val locatorJson = JSONObject(locatorMap)
            val locator = Locator.fromJSON(locatorJson) ?: return@Coroutine null
            val next = bookService.getNextFragment(bookUuid, locator) ?: return@Coroutine null
            mutableMapOf(
                "href" to next.href,
                "fragment" to next.fragment,
                "locator" to next.locator?.toJSON()?.toMap()
            )
        }

        AsyncFunction("getPreviousFragment") Coroutine { bookUuid: String, locatorMap: Map<String, Any> ->
            val locatorJson = JSONObject(locatorMap)
            val locator = Locator.fromJSON(locatorJson) ?: return@Coroutine null
            val previous =
                bookService.getPreviousFragment(bookUuid, locator) ?: return@Coroutine null
            mutableMapOf(
                "href" to previous.href,
                "fragment" to previous.fragment,
                "locator" to previous.locator?.toJSON()?.toMap()
            )
        }

        AsyncFunction("locateLink") { bookUuid: String, linkMap: Map<String, Any> ->
            val linkJson = JSONObject(linkMap)
            val link = Link.fromJSON(linkJson) ?: throw Exception("Failed to parse link from json")
            val locator = bookService.locateLink(bookUuid, link)
            return@AsyncFunction locator?.toJSON()?.toMap()
        }

        View(EpubView::class) {
            Events(
                "onLocatorChange",
                "onMiddleTouch",
                "onSelection",
                "onDoubleTouch",
                "onError",
                "onHighlightTap",
                "onBookmarksActivate"
            )

            Prop("bookUuid") { view: EpubView, prop: String ->
                if (view.bookService == null) {
                    view.bookService = bookService
                }
                view.pendingProps.bookUuid = prop
            }

            AsyncFunction("goForward") { view: EpubView ->
                val navigator = view.navigator ?: return@AsyncFunction
                navigator.goForward(animated = false)
            }

            AsyncFunction("goBackward") { view: EpubView ->
                val navigator = view.navigator ?: return@AsyncFunction
                navigator.goBackward(animated = false)
            }

            Prop("locator") { view: EpubView, prop: Map<String, Any>? ->
                if (prop == null) {
                    view.pendingProps.locator = null
                    return@Prop
                }

                val locator = Locator.fromJSON(JSONObject(prop)) ?: return@Prop

                view.pendingProps.locator = locator
            }

            Prop("isPlaying") { view: EpubView, prop: Boolean? ->
                val isPlaying = prop ?: false
                view.pendingProps.isPlaying = isPlaying
            }

            Prop("highlights") { view: EpubView, prop: List<Map<String, Any>> ->
                val highlights =
                    prop.mapNotNull {
                        val id = it["uuid"] as String
                        val color =
                            when (it["color"] as String) {
                                "yellow" -> 0xffffff00.toInt()
                                "red" -> 0xffff0000.toInt()
                                "green" -> 0xff00ff00.toInt()
                                "blue" -> 0xff0000ff.toInt()
                                "magenta" -> 0xffff00ff.toInt()
                                else -> 0xffffff00.toInt()
                            }
                        val locatorJson = JSONObject(it["locator"] as Map<*, *>)
                        val locator = Locator.fromJSON(locatorJson) ?: return@mapNotNull null
                        return@mapNotNull Highlight(id, color, locator)
                    }

                view.pendingProps.highlights = highlights
            }

            Prop("bookmarks") { view: EpubView, prop: List<Map<String, Any>> ->
                val bookmarks = prop.mapNotNull { Locator.fromJSON(JSONObject(it)) }

                view.pendingProps.bookmarks = bookmarks
            }

            Prop("colorTheme") { view: EpubView, prop: Map<String, String> ->
                val foregroundHex = prop["foreground"] ?: "#000000"
                val backgroundHex = prop["background"] ?: "#FFFFFF"
                view.pendingProps.foreground = foregroundHex.toColorInt()
                view.pendingProps.background = backgroundHex.toColorInt()
            }

            Prop("readaloudColor") { view: EpubView, prop: String ->
                view.pendingProps.readaloudColor = prop.toColorInt()
            }

            Prop("fontScale") { view: EpubView, prop: Double ->
                view.pendingProps.fontSize = prop
            }

            Prop("lineHeight") { view: EpubView, prop: Double ->
                view.pendingProps.lineHeight = prop
            }

            Prop("textAlign") { view: EpubView, prop: String ->
                val textAlign =
                    when (prop) {
                        "left" -> TextAlign.LEFT
                        else -> TextAlign.JUSTIFY
                    }

                view.pendingProps.textAlign = textAlign
            }

            Prop("customFonts") { view: EpubView, prop: List<Map<String, String>> ->
                val customFonts =
                    prop.map {
                        val uri = it["uri"] as String
                        val name = it["name"] as String
                        val type = it["type"] as String
                        CustomFont(uri, name, type)
                    }

                view.pendingProps.customFonts = customFonts
            }

            Prop("fontFamily") { view: EpubView, prop: String ->
                view.pendingProps.fontFamily = FontFamily(prop)
            }

            OnViewDidUpdateProps { view: EpubView ->
                view.finalizeProps()
            }
        }
    }
}
