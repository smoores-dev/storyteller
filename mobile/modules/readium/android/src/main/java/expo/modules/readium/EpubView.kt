package expo.modules.readium

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PointF
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.annotation.ColorInt
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import kotlinx.serialization.json.Json
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.ExperimentalDecorator
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Locator

data class Highlight(val id: String, @ColorInt val color: Int, val locator: Locator)

@SuppressLint("ViewConstructor", "ResourceType")
@OptIn(ExperimentalDecorator::class)
class EpubView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    EpubNavigatorFragment.Listener {

    val onLocatorChange by EventDispatcher()
    val onMiddleTouch by EventDispatcher()
    val onBookmarksActivate by EventDispatcher()
    val onDoubleTouch by EventDispatcher()
    val onSelection by EventDispatcher()

    var bookService: BookService? = null
    var bookId: Long? = null
    var locator: Locator? = null
    var isPlaying: Boolean = false
    var navigator: EpubNavigatorFragment? = null
    var highlights: List<Highlight> = listOf()
    var bookmarks: List<Locator> = listOf()

    fun initializeNavigator() {
        if (this.navigator != null) {
            return
        }

        val bookId = this.bookId ?: return
        val locator = this.locator ?: return
        val publication = bookService?.getPublication(bookId) ?: return

        val fragmentTag = resources.getString(R.string.epub_fragment_tag)
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?

        val listener = this
        val epubFragment = EpubFragment(locator, publication, listener)

        activity?.supportFragmentManager?.commitNow {
            setReorderingAllowed(true)
            add(epubFragment, fragmentTag)
        }

        addView(epubFragment.view)

        navigator = epubFragment.navigator

        decorateHighlights()

        activity?.lifecycleScope?.launch {
            navigator?.currentLocator?.collect {
                onLocatorChanged(it)
            }
        }
    }

    fun go() {
        val navigator = this.navigator ?: return initializeNavigator()
        val locator = this.locator ?: return

        navigator.go(locator, true)
        if (isPlaying) {
            highlightFragment(locator)
        }
    }

    fun decorateHighlights() {
        val decorations = highlights.map {
            val style = Decoration.Style.Highlight(it.color, isActive = true)
            return@map Decoration(
                id = it.id,
                locator = it.locator,
                style = style
            )
        }

        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.applyDecorations(decorations, group = "highlights")
        }
    }

    fun highlightFragment(locator: Locator) {
        val id = locator.locations.fragments.first()

        val overlayHighlight = Decoration.Style.Highlight(0xffffff00.toInt(), isActive = true)
        val decoration = Decoration(id, locator, overlayHighlight)

        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.applyDecorations(listOf(decoration), "overlay")
        }

    }

    fun clearHighlightFragment() {
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.applyDecorations(listOf(), "overlay")
        }
    }

    suspend fun findOnPage(locator: Locator) {
        val epubNav = navigator ?: return
        val currentProgression = locator.locations.progression ?: return

        val joinedProgressions =
            bookmarks.mapNotNull { it.locations.progression }.joinToString { it.toString() }

        val jsProgressionsArray = "[${joinedProgressions}]"

        val result = epubNav.evaluateJavascript(
            """
            (function() {
                const maxScreenX = window.orientation === 0 || window.orientation == 180
                        ? screen.width
                        : screen.height;

                function snapOffset(offset) {
                    const value = offset + 1;
                    
                    return value - (value % maxScreenX);
                }

                const documentWidth = document.scrollingElement.scrollWidth;
                const currentPageStart = snapOffset(documentWidth * ${currentProgression});
                const currentPageEnd = currentPageStart + maxScreenX;
                return ${jsProgressionsArray}.filter((progression) =>
                    progression * documentWidth >= currentPageStart &&
                    progression * documentWidth < currentPageEnd
                );
            })();
            """.trimIndent()
        ) ?: return onBookmarksActivate(mapOf("activeBookmarks" to listOf<Locator>()))

        val parsed = Json.decodeFromString<List<Double>>(result)
        val found = bookmarks.filter {
            val progression = it.locations.progression ?: return@filter false
            return@filter parsed.contains(progression)
        }

        onBookmarksActivate(mapOf("activeBookmarks" to found.map { it.toJSON().toMap() }))
    }

    fun setupUserScript(): EpubView {
        val bookId = this.bookId ?: return this
        val locator = this.locator ?: this.navigator?.currentLocator?.value ?: return this
        val fragments = bookService?.getFragments(bookId, locator) ?: return this

        val joinedFragments = fragments.joinToString { "\"${it.fragment}\"" }
        val jsFragmentsArray = "[${joinedFragments}]"
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.evaluateJavascript(
                """
                globalThis.storytellerFragments = ${jsFragmentsArray};
        
                let storytellerDoubleClickTimeout = null;
                let storytellerTouchMoved = false;
                for (const fragment of globalThis.storytellerFragments) {
                    const element = document.getElementById(fragment);
                    if (!element) continue;
                    element.addEventListener('touchstart', (event) => {
                        storytellerTouchMoved = false;
                    });
                    element.addEventListener('touchmove', (event) => {
                        storytellerTouchMoved = true;
                    });
                    element.addEventListener('touchend', (event) => {
                        if (storytellerTouchMoved || !document.getSelection().isCollapsed || event.changedTouches.length !== 1) return;
            
                        event.bubbles = true
                        event.clientX = event.changedTouches[0].clientX
                        event.clientY = event.changedTouches[0].clientY
                        const clone = new MouseEvent('click', event);
                        event.stopImmediatePropagation();
                        event.preventDefault();
    
                        if (storytellerDoubleClickTimeout) {
                            clearTimeout(storytellerDoubleClickTimeout);
                            storytellerDoubleClickTimeout = null;
                            console.log('handleDoubleTap' in storyteller);
                            console.log(storyteller);
                            console.log(storyteller.handleDoubleTap);
                            storyteller.handleDoubleTap(fragment);
                            return
                        }
    
                        storytellerDoubleClickTimeout = setTimeout(() => {
                            storytellerDoubleClickTimeout = null;
                            element.parentElement.dispatchEvent(clone);
                        }, 350);
                    })
                }
            
                document.addEventListener('selectionchange', () => {
                    if (document.getSelection().isCollapsed) {
                        storyteller.handleSelectionCleared();
                    }
                });
                """.trimIndent()
            )
        }

        return this
    }

    @JavascriptInterface
    fun handleDoubleTap(fragment: String) {
        val bookId = this.bookId ?: return
        val bookService = this.bookService ?: return
        val currentLocator = navigator?.currentLocator?.value ?: return
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            val locator = bookService.buildFragmentLocator(bookId, currentLocator.href, fragment)

            onDoubleTouch(locator.toJSON().toMap())
        }
    }

    @JavascriptInterface
    fun handleSelectionCleared() {
        onSelection(mapOf("cleared" to true))
    }

    override fun onTap(point: PointF): Boolean {
        if (point.x < width * 0.2) {
            navigator?.goBackward(animated = true)
            return true
        }
        if (point.x > width * 0.8) {
            navigator?.goForward(animated = true)
            return true
        }
        onMiddleTouch(mapOf())
        return false
    }

    private suspend fun onLocatorChanged(locator: Locator) {
        if (isPlaying) {
            return
        }

        findOnPage(locator)

        Log.d("EpubView", "Navigated to ${locator.locations.position}")

        val result = navigator?.evaluateJavascript(
            """
            (function() {
                function isEntirelyOnScreen(element) {
                    const rects = element.getClientRects();
                    console.log(element.id, rects);
                    return Array.from(rects).every((rect) => {
                        const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                        return isVerticallyWithin && isHorizontallyWithin;
                    });
                }

                for (const fragment of globalThis.storytellerFragments) {
                    const element = document.getElementById(fragment);
                    if (!element) continue;
                    if (isEntirelyOnScreen(element)) {
                        return fragment;
                    }
                }

                return null;
            })();
        """.trimIndent()
        )
        Log.d("EpubView", "result: $result")
        if (result == null) {
            return onLocatorChange(locator.toJSON().toMap())
        }
        val fragment = Json.decodeFromString<String?>(result)
            ?: return onLocatorChange(locator.toJSON().toMap())

        val fragmentsLocator =
            locator.copy(locations = locator.locations.copy(fragments = listOf(fragment)))
        onLocatorChange(fragmentsLocator.toJSON().toMap())
    }
}