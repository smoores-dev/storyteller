@file:OptIn(ExperimentalReadiumApi::class)

package expo.modules.readium

import android.graphics.Color
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
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.readium.FinalizedProps
import kotlin.math.ceil
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.ExperimentalDecorator
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.TextAlign
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Locator

data class Highlight(val id: String, @ColorInt val color: Int, val locator: Locator)

data class CustomFont(val uri: String, val name: String, val type: String)

data class Props(
    var bookId: Long?,
    var locator: Locator?,
    var isPlaying: Boolean?,
    var highlights: List<Highlight>?,
    var bookmarks: List<Locator>?,
    var readaloudColor: Int?,
    var customFonts: List<CustomFont>?,
    @ColorInt var foreground: Int?,
    @ColorInt var background: Int?,
    var fontFamily: FontFamily?,
    var lineHeight: Double?,
    var paragraphSpacing: Double?,
    var fontSize: Double?,
    var textAlign: TextAlign?
)


data class FinalizedProps(
    var bookId: Long,
    var locator: Locator,
    var isPlaying: Boolean,
    var highlights: List<Highlight>,
    var bookmarks: List<Locator>,
    var readaloudColor: Int,
    var customFonts: List<CustomFont>,
    @ColorInt var foreground: Int,
    @ColorInt var background: Int,
    var fontFamily: FontFamily,
    var lineHeight: Double,
    var paragraphSpacing: Double,
    var fontSize: Double,
    var textAlign: TextAlign
)


@SuppressLint("ViewConstructor", "ResourceType")
@OptIn(ExperimentalDecorator::class)
class EpubView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    EpubNavigatorFragment.Listener, DecorableNavigator.Listener {

    // Required for proper layout! Forces Expo to
    // use the Android layout system for this view,
    // rather than React Native's. Without this,
    // the ViewPager and WebViews will be laid out
    // incorrectly
    override val shouldUseAndroidLayout = true

    val onLocatorChange by EventDispatcher()
    val onMiddleTouch by EventDispatcher()
    val onBookmarksActivate by EventDispatcher()
    val onDoubleTouch by EventDispatcher()
    val onSelection by EventDispatcher()
    val onHighlightTap by EventDispatcher()

    var bookService: BookService? = null
    var navigator: EpubNavigatorFragment? = null

    var pendingProps: Props = Props(
        bookId=null,
        locator=null,
        isPlaying=null,
        highlights=null,
        bookmarks=null,
        readaloudColor=null,
        customFonts=null,
        foreground=null,
        background=null,
        fontFamily=null,
        lineHeight=null,
        paragraphSpacing=null,
        fontSize=null,
        textAlign=null,
    )
    var props: FinalizedProps? = null

    fun finalizeProps() {
        val oldProps = props

        props =
        FinalizedProps(
            bookId = pendingProps.bookId!!,
            locator = pendingProps.locator!!,
            isPlaying = pendingProps.isPlaying ?: oldProps?.isPlaying ?: false,
            highlights = pendingProps.highlights ?: oldProps?.highlights ?: listOf(),
            bookmarks = pendingProps.bookmarks ?: oldProps?.bookmarks ?: listOf(),
            readaloudColor = pendingProps.readaloudColor
                ?: oldProps?.readaloudColor ?: 0xffffff00.toInt(),
            customFonts = pendingProps.customFonts ?: oldProps?.customFonts ?: listOf(),
            foreground = pendingProps.foreground
                ?: oldProps?.foreground ?: Color.parseColor("#111111"),
            background = pendingProps.background
                ?: oldProps?.background ?: Color.parseColor("#FFFFFF"),
            fontFamily = pendingProps.fontFamily
                ?: oldProps?.fontFamily ?: FontFamily("Literata"),
            lineHeight = pendingProps.lineHeight ?: oldProps?.lineHeight ?: 1.4,
            paragraphSpacing = pendingProps.paragraphSpacing
                ?: oldProps?.paragraphSpacing ?: 0.5,
            fontSize = pendingProps.fontSize ?: oldProps?.fontSize ?: 1.0,
            textAlign = pendingProps.textAlign ?: oldProps?.textAlign ?: TextAlign.JUSTIFY,
        )

        if (props!!.bookId != oldProps?.bookId || props!!.customFonts != oldProps.customFonts) {
            destroyNavigator()
            initializeNavigator()
            return
        }

        val activity = appContext.currentActivity as FragmentActivity?

        // Don't go to a new location if it's the same as the current location, except with
        // different fragments. Prevents unnecessarily triggering renders and state updates
        // when the position hasn't actually changed
        val locatorComp =
            if (navigator!!.currentLocator.value.locations.fragments.isEmpty())
                props!!.locator.copy(locations = props!!.locator.locations.copy(fragments = listOf()))
            else props!!.locator

        if (locatorComp != navigator!!.currentLocator.value) {
            go(props!!.locator)
        }

        if (props!!.isPlaying) {
            highlightFragment(props!!.locator)
        } else {
            clearHighlightFragment()
        }

        if (props!!.highlights != oldProps.highlights) {
            decorateHighlights()
        }

        if (props!!.bookmarks != oldProps.bookmarks) {
            activity?.lifecycleScope?.launch { findOnPage(props!!.locator) }
        }

        if (props!!.readaloudColor != oldProps.readaloudColor) {
            clearHighlightFragment()
            highlightFragment(props!!.locator)
        }

        navigator!!.submitPreferences(
            EpubPreferences(
                backgroundColor = org.readium.r2.navigator.preferences.Color(props!!.background),
                fontFamily = props!!.fontFamily,
                fontSize = props!!.fontSize,
                lineHeight = props!!.lineHeight,
                paragraphSpacing = props!!.paragraphSpacing,
                textAlign = props!!.textAlign,
                textColor = org.readium.r2.navigator.preferences.Color(props!!.foreground),
            )
        )
    }

    fun initializeNavigator() {
        val publication = bookService?.getPublication(props!!.bookId) ?: return

        val fragmentTag = resources.getString(R.string.epub_fragment_tag)
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?

        val listener = this
        val epubFragment = EpubFragment(
            publication,
            listener
        )

        activity?.supportFragmentManager?.commitNow {
            setReorderingAllowed(true)
            add(epubFragment, fragmentTag)
        }

        addView(epubFragment.view)

        navigator = epubFragment.navigator

        decorateHighlights()

        navigator?.addDecorationListener("highlights", this)

        activity?.lifecycleScope?.launch {
            navigator?.currentLocator?.collect {
                onLocatorChanged(it)
            }
        }
    }

    fun destroyNavigator() {
        val navigator = this.navigator ?: return
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.supportFragmentManager?.commitNow {
            setReorderingAllowed(true)
            remove(navigator)
        }
        removeView(navigator.view)
    }

    fun go(locator: Locator) {
        val activity = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator!!.evaluateJavascript(
                """
            storyteller.firstVisibleFragment = null;
            """.trimIndent()
            )
            navigator!!.go(locator, true)
        }
    }

    override fun onDecorationActivated(event: DecorableNavigator.OnActivatedEvent): Boolean {
        val rect = event.rect ?: return false
        val x = ceil(rect.centerX() / this.resources.displayMetrics.density).toInt()
        val y = ceil(rect.top / this.resources.displayMetrics.density).toInt() - 16
        this.onHighlightTap(mapOf("decoration" to event.decoration.id, "x" to x, "y" to y))
        return true
    }

    fun decorateHighlights() {
        val decorations = props!!.highlights.map {
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

        val overlayHighlight = Decoration.Style.Highlight(props!!.readaloudColor, isActive = true)
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
            props!!.bookmarks
                .filter { it.href == locator.href }
                .mapNotNull { it.locations.progression }
                .joinToString { it.toString() }


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
        val found = props!!.bookmarks.filter {
            val progression = it.locations.progression ?: return@filter false
            return@filter parsed.contains(progression)
        }

        onBookmarksActivate(mapOf("activeBookmarks" to found.map { it.toJSON().toMap() }))
    }

    fun setupUserScript(): EpubView {
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            val fragments = bookService?.getFragments(props!!.bookId, props!!.locator) ?: return@launch

            val joinedFragments = fragments.joinToString { "\"${it.fragment}\"" }
            val jsFragmentsArray = "[${joinedFragments}]"

            navigator?.evaluateJavascript(
                """
                globalThis.storyteller = {};
                storyteller.doubleClickTimeout = null;
                storyteller.touchMoved = false;

                storyteller.touchStartHandler = (event) => {
                    storyteller.touchMoved = false;
                }

                storyteller.touchMoveHandler = (event) => {
                    storyteller.touchMoved = true;
                }

                storyteller.touchEndHandler = (event) => {
                    if (storyteller.touchMoved || !document.getSelection().isCollapsed || event.changedTouches.length !== 1) return;

                    event.bubbles = true
                    event.clientX = event.changedTouches[0].clientX
                    event.clientY = event.changedTouches[0].clientY
                    const clone = new MouseEvent('click', event);
                    event.stopImmediatePropagation();
                    event.preventDefault();

                    if (storyteller.doubleClickTimeout) {
                        clearTimeout(storyteller.doubleClickTimeout);
                        storyteller.doubleClickTimeout = null;
                        storytellerAPI.handleDoubleTap(event.currentTarget.id);
                        return
                    }

                    const element = event.currentTarget;

                    storyteller.doubleClickTimeout = setTimeout(() => {
                        storyteller.doubleClickTimeout = null;
                        element.parentElement.dispatchEvent(clone);
                    }, 350);
                }

                storyteller.observer = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            entry.target.addEventListener('touchstart', storyteller.touchStartHandler)
                            entry.target.addEventListener('touchmove', storyteller.touchMoveHandler)
                            entry.target.addEventListener('touchend', storyteller.touchEndHandler)
                        } else {
                            entry.target.removeEventListener('touchstart', storyteller.touchStartHandler)
                            entry.target.removeEventListener('touchmove', storyteller.touchMoveHandler)
                            entry.target.removeEventListener('touchend', storyteller.touchEndHandler)
                        }

                        if (entry.intersectionRatio === 1) {
                            // TODO: Is this fast enough?
                            if (!storyteller.firstVisibleFragment || storyteller.fragmentIds.indexOf(entry.target.id) < storyteller.fragmentIds.indexOf(storyteller.firstVisibleFragment.id)) {
                                console.log('found earlier fragment', entry.target.id)
                                storyteller.firstVisibleFragment = entry.target
                            }
                        }
                    })
                }, {
                    threshold: [0, 1],
                })

                document.addEventListener('selectionchange', () => {
                    if (document.getSelection().isCollapsed) {
                        storytellerAPI.handleSelectionCleared();
                    }
                });

                storyteller.fragmentIds = $jsFragmentsArray;
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                })
                """.trimIndent()
            )
        }

        return this
    }

    @JavascriptInterface
    fun handleDoubleTap(fragment: String) {
        val bookService = this.bookService ?: return
        val currentLocator = navigator?.currentLocator?.value ?: return
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            val locator = bookService.buildFragmentLocator(props!!.bookId, currentLocator.href, fragment)

            onDoubleTouch(locator.toJSON().toMap())
        }
    }

    @JavascriptInterface
    fun handleSelectionCleared() {
        onSelection(mapOf("cleared" to true))
    }

    override fun onTap(point: PointF): Boolean {
        val activity = appContext.currentActivity as FragmentActivity?
        if (point.x < width * 0.2) {
            activity?.lifecycleScope?.launch {
                navigator!!.evaluateJavascript(
                    """
            storyteller.firstVisibleFragment = null;
            """.trimIndent()
                )
                navigator?.goBackward(animated = true)
            }
            return true
        }
        if (point.x > width * 0.8) {
            activity?.lifecycleScope?.launch {
                navigator!!.evaluateJavascript(
                    """
            storyteller.firstVisibleFragment = null;
            """.trimIndent()
                )
                navigator?.goForward(animated = true)
            }
            return true
        }
        onMiddleTouch(mapOf())
        return false
    }

    private suspend fun onLocatorChanged(locator: Locator) {
        findOnPage(locator)

        if (locator.href !== props!!.locator?.href) {
            val fragments = bookService?.getFragments(props!!.bookId, locator) ?: return

            val joinedFragments = fragments.joinToString { "\"${it.fragment}\"" }
            val jsFragmentsArray = "[${joinedFragments}]"

            navigator?.evaluateJavascript(
                """
                storyteller.fragmentIds = $jsFragmentsArray;
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                })
            """.trimIndent()
            )
        }

        if (props!!.isPlaying) {
            return
        }

        val result = navigator?.evaluateJavascript(
            """
            storyteller.firstVisibleFragment?.id
            """.trimIndent()
        )
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
