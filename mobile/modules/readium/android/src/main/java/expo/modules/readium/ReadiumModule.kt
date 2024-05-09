package expo.modules.readium

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import java.net.URI
import java.net.URL

class ReadiumModule : Module() {
    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    override fun definition() = ModuleDefinition {
        val bookService: BookService = BookService(appContext.reactContext!!)

        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a
        // string as an argument.
        // Can be inferred from module's class name, but it's recommended to set it explicitly for
        // clarity.
        // The module will be accessible from `requireNativeModule('Readium')` in JavaScript.
        Name("Readium")

        // Defines a JavaScript function that always returns a Promise and whose native code
        // is by default dispatched on the different thread than the JavaScript runtime runs on.
        AsyncFunction("openPublication") Coroutine { bookId: Long, publicationUri: URL ->
            return@Coroutine bookService.openPublication(bookId, publicationUri).jsonManifest
        }

        AsyncFunction("getResource") Coroutine { bookId: Long, linkMap: Map<String, Any> ->
            val linkJson = JSONObject(linkMap)
            val link = Link.fromJSON(linkJson) ?: return@Coroutine null
            val resource = bookService.getResource(bookId, link)
            return@Coroutine resource.readAsString().getOrThrow()
        }

        AsyncFunction("getClip") Coroutine { bookId: Long, locatorMap: Map<String, Any> ->
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

        AsyncFunction("getFragment") Coroutine { bookId: Long, clipUrl: String, position: Double ->
            val fragment =
                bookService.getFragment(bookId, clipUrl, position) ?: return@Coroutine null
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

        // Enables the module to be used as a native view. Definition components that are accepted as
        // part of
        // the view definition: Prop, Events.
        View(EpubView::class) {
            Events("onLocatorChange", "onMiddleTouch")

            Prop("bookId") { view: EpubView, prop: Long ->
                if (view.bookService == null) {
                    view.bookService = bookService
                }
                view.bookId = prop
                view.initializeNavigator()
            }

            Prop("locator") { view: EpubView, prop: Map<String, Any> ->
                val locator = Locator.fromJSON(JSONObject(prop)) ?: return@Prop

                val maybeCurrentLocator = view.navigator?.currentLocator?.value
                maybeCurrentLocator?.let { currentLocator ->
                    val locatorComp =
                        if (currentLocator.locations.fragments.isEmpty()) currentLocator.copy(
                            locations = locator.locations.copy(fragments = listOf())
                        ) else currentLocator
                    if (currentLocator == locatorComp) return@Prop
                }

                view.locator = locator
                view.go()
            }

            Prop("isPlaying") { view: EpubView, prop: Boolean? ->
                val isPlaying = prop ?: false
                view.isPlaying = isPlaying

                if (view.isPlaying) {
                    view.highlightSelection()
                } else {
                    view.clearHighlights()
                }
            }
        }
    }
}
