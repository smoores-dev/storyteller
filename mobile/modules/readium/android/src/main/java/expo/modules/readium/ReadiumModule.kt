package expo.modules.readium

import android.graphics.Color
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URI
import java.net.URL
import java.util.Base64
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.TextAlign
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator

class ReadiumModule : Module() {
    // Each module class must implement the definition function. The definition consists of
    // components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    @RequiresApi(Build.VERSION_CODES.O)
    @OptIn(ExperimentalReadiumApi::class)
    override fun definition() = ModuleDefinition {
        val bookService = BookService(appContext.reactContext!!)

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
                { bookId: Long, publicationUri: URL ->
                    return@Coroutine bookService.openPublication(bookId, publicationUri)
                            .jsonManifest
                }

        AsyncFunction("getResource") Coroutine
                { bookId: Long, linkMap: Map<String, Any> ->
                    val linkJson = JSONObject(linkMap)
                    val link = Link.fromJSON(linkJson) ?: return@Coroutine null
                    val resource = bookService.getResource(bookId, link)
                    if (link.type?.startsWith("image/") == true) {
                        val data = resource.read().getOrThrow()
                        return@Coroutine String(Base64.getEncoder().encode(data))
                    }
                    return@Coroutine resource.readAsString().getOrThrow()
                }

        AsyncFunction("getClip") Coroutine
                { bookId: Long, locatorMap: Map<String, Any> ->
                    val locatorJson = JSONObject(locatorMap)
                    val locator = Locator.fromJSON(locatorJson) ?: return@Coroutine null
                    val clip = bookService.getClip(bookId, locator) ?: return@Coroutine null
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
                { bookId: Long, clipUrl: String, position: Double ->
                    val fragment =
                            bookService.getFragment(bookId, clipUrl, position)
                                    ?: return@Coroutine null
                    return@Coroutine mutableMapOf(
                            "href" to fragment.href,
                            "fragment" to fragment.fragment,
                            "locator" to fragment.locator?.toJSON()?.toMap()
                    )
                }

        AsyncFunction("locateLink") { bookId: Long, linkMap: Map<String, Any> ->
            val linkJson = JSONObject(linkMap)
            val link = Link.fromJSON(linkJson) ?: throw Exception("Failed to parse link from json")
            val locator = bookService.locateLink(bookId, link)
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

            Prop("bookId") { view: EpubView, prop: Long ->
                if (view.bookService == null) {
                    view.bookService = bookService
                }
                view.bookId = prop
                view.initializeNavigator()
            }

            AsyncFunction("goForward") { view: EpubView ->
                val navigator = view.navigator ?: return@AsyncFunction
                navigator.goForward(animated = true)
            }

            AsyncFunction("goBackward") { view: EpubView ->
                val navigator = view.navigator ?: return@AsyncFunction
                navigator.goBackward(animated = true)
            }

            Prop("locator") { view: EpubView, prop: Map<String, Any> ->
                val locator = Locator.fromJSON(JSONObject(prop)) ?: return@Prop

                val maybeCurrentLocator = view.navigator?.currentLocator?.value
                maybeCurrentLocator?.let { currentLocator ->
                    val locatorComp =
                            if (currentLocator.locations.fragments.isEmpty())
                                    currentLocator.copy(
                                            locations = locator.locations.copy(fragments = listOf())
                                    )
                            else currentLocator
                    if (currentLocator == locatorComp) return@Prop
                }

                view.go(locator)
            }

            Prop("isPlaying") { view: EpubView, prop: Boolean? ->
                val isPlaying = prop ?: false
                view.isPlaying = isPlaying

                val locator = view.locator
                if (view.isPlaying && locator != null) {
                    view.highlightFragment(locator)
                } else {
                    view.clearHighlightFragment()
                }
            }

            Prop("highlights") { view: EpubView, prop: List<Map<String, Any>> ->
                val highlights =
                        prop.mapNotNull {
                            val id = it["id"] as String
                            val color =
                                    when (it["color"] as String) {
                                        "yellow" -> 0xffffff00.toInt()
                                        "red" -> 0xffff0000.toInt()
                                        "green" -> 0xff00ff00.toInt()
                                        "blue" -> 0xff0000ff.toInt()
                                        "magenta" -> 0xffff00ff.toInt()
                                        else -> 0xffffff00.toInt()
                                    }
                            val locatorJson = JSONObject(it["locator"] as Map<String, Any>)
                            val locator = Locator.fromJSON(locatorJson) ?: return@mapNotNull null
                            return@mapNotNull Highlight(id, color, locator)
                        }

                view.highlights = highlights
                view.decorateHighlights()
            }

            Prop("bookmarks") { view: EpubView, prop: List<Map<String, Any>> ->
                val bookmarks = prop.mapNotNull { Locator.fromJSON(JSONObject(it)) }

                view.bookmarks = bookmarks
                val currentLocator = view.navigator?.currentLocator?.value ?: return@Prop

                val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
                activity?.lifecycleScope?.launch { view.findOnPage(currentLocator) }
            }

            Prop("colorTheme") { view: EpubView, prop: Map<String, String> ->
                val foregroundHex = prop["foreground"] ?: "#000000"
                val backgroundHex = prop["background"] ?: "#FFFFFF"
                val foreground = Color.parseColor(foregroundHex)
                val background = Color.parseColor(backgroundHex)

                view.preferences =
                        view.preferences.copy(
                                textColor = org.readium.r2.navigator.preferences.Color(foreground),
                                backgroundColor =
                                        org.readium.r2.navigator.preferences.Color(background)
                        )
                view.updatePreferences()
            }

            Prop("readaloudColor") { view: EpubView, prop: String ->
                val color =
                        when (prop) {
                            "yellow" -> 0xffffff00.toInt()
                            "red" -> 0xffff0000.toInt()
                            "green" -> 0xff00ff00.toInt()
                            "blue" -> 0xff0000ff.toInt()
                            "magenta" -> 0xffff00ff.toInt()
                            else -> 0xffffff00.toInt()
                        }

                view.readaloudColor = color

                if (view.isPlaying) {
                    view.clearHighlightFragment()
                    view.navigator?.let { view.highlightFragment(it.currentLocator.value) }
                }
            }

            Prop("fontScale") { view: EpubView, prop: Double ->
                view.preferences = view.preferences.copy(fontSize = prop)
                view.updatePreferences()
            }

            Prop("lineHeight") { view: EpubView, prop: Double ->
                view.preferences = view.preferences.copy(lineHeight = prop)
                view.updatePreferences()
            }

            Prop("textAlign") { view: EpubView, prop: String ->
                val textAlign =
                        when (prop) {
                            "left" -> TextAlign.LEFT
                            else -> TextAlign.JUSTIFY
                        }
                view.preferences = view.preferences.copy(textAlign = textAlign)
                view.updatePreferences()
            }

            Prop("fontFamily") { view: EpubView, prop: String ->
                view.preferences = view.preferences.copy(fontFamily = FontFamily(prop))
                view.updatePreferences()
            }
        }
    }
}
