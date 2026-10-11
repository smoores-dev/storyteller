@file:OptIn(ExperimentalReadiumApi::class, InternalReadiumApi::class)

package expo.modules.readium

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.text.Html
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import androidx.annotation.ColorInt
import androidx.core.graphics.toColorInt
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.HyperlinkNavigator
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.KeyEvent as ReadiumKeyEvent
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.TextAlign
import org.readium.r2.navigator.util.DirectionalNavigationAdapter
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.AbsoluteUrl
import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.shared.publication.Link
import kotlin.math.abs
import kotlin.math.ceil
import java.io.File

data class Highlight(val id: String, @ColorInt val color: Int, val locator: Locator)

data class CustomFont(val uri: String, val name: String, val type: String)

data class Props(
    var bookUuid: String?,
    var locator: Locator?,
    var isPlaying: Boolean?,
    var highlights: List<Highlight>?,
    var bookmarks: List<Locator>?,
    var readaloudColor: Int?,
    var readaloudDecoratorStyle: String?,
    var customFonts: List<CustomFont>?,
    @ColorInt var foreground: Int?,
    @ColorInt var background: Int?,
    var fontFamily: FontFamily?,
    var lineHeight: Double?,
    var paragraphSpacing: Double?,
    var fontSize: Double?,
    var textAlign: TextAlign?,
    var marginLeft: Int?,
    var marginRight: Int?,
    var scrollMode: Boolean?
)


data class FinalizedProps(
    var bookUuid: String,
    var locator: Locator?,
    var isPlaying: Boolean,
    var highlights: List<Highlight>,
    var bookmarks: List<Locator>,
    var readaloudColor: Int,
    var readaloudDecoratorStyle: String,
    var customFonts: List<CustomFont>,
    @ColorInt var foreground: Int,
    @ColorInt var background: Int,
    var fontFamily: FontFamily,
    var lineHeight: Double,
    var paragraphSpacing: Double,
    var fontSize: Double,
    var textAlign: TextAlign,
    var marginLeft: Int,
    var marginRight: Int,
    var scrollMode: Boolean
)


@SuppressLint("ViewConstructor", "ResourceType")
class EpubView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    EpubNavigatorFragment.Listener, EpubNavigatorFragment.PaginationListener,
    DecorableNavigator.Listener, HyperlinkNavigator.Listener {

    companion object {
        var current: EpubView? = null
    }

    // Required for proper layout! Forces Expo to
    // use the Android layout system for this view,
    // rather than React Native's. Without this,
    // the ViewPager and WebViews will be laid out
    // incorrectly
    override val shouldUseAndroidLayout = true

    // Expo's shouldUseAndroidLayout only measures/layouts the ExpoView itself,
    // not children. Override requestLayout to propagate through the view tree.
    // See: https://github.com/readium/kotlin-toolkit/discussions/737
    override fun requestLayout() {
        super.requestLayout()
        post {
            measureAndLayoutRecursively(this)
        }
    }

    // When the WebView has an active InputConnection (after a touch/tap), Android routes
    // the next key's ACTION_DOWN through the IME dispatch path (ViewRootImpl.dispatchKeyFromIme),
    // which calls dispatchKeyEventPreIme directly on the view hierarchy — bypassing
    // Activity.dispatchKeyEvent entirely. By intercepting here, we handle both cases:
    //   - Normal (WebView not focused): Activity.dispatchKeyEvent fires first, returns true,
    //     view hierarchy never sees it → no double navigation.
    //   - After touch (WebView focused): Activity never sees DOWN, we catch it here → works.
    override fun dispatchKeyEventPreIme(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val activity = appContext.currentActivity as FragmentActivity?
            when (event.keyCode) {
                93, 117 -> {
                    activity?.lifecycleScope?.launch { navigator?.goForward(animated = false) }
                    return true
                }
                92 -> {
                    activity?.lifecycleScope?.launch { navigator?.goBackward(animated = false) }
                    return true
                }
            }
        }
        return super.dispatchKeyEventPreIme(event)
    }

    private fun measureAndLayoutRecursively(view: android.view.View) {
        view.forceLayout()
        view.measure(
            MeasureSpec.makeMeasureSpec(view.width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(view.height, MeasureSpec.EXACTLY)
        )
        view.layout(view.left, view.top, view.right, view.bottom)
        (view as? android.view.ViewGroup)?.let { vg ->
            for (i in 0 until vg.childCount) {
                measureAndLayoutRecursively(vg.getChildAt(i))
            }
        }
    }

    val onLocatorChange by EventDispatcher()
    val onMiddleTouch by EventDispatcher()
    val onBookmarksActivate by EventDispatcher()
    val onDoubleTouch by EventDispatcher()
    val onSelection by EventDispatcher()
    val onHighlightTap by EventDispatcher()
    val onShowFootnote by EventDispatcher()

    var navigator: EpubNavigatorFragment? = null
    var player: AudiobookPlayer? = null

    var locationEmitter: Job? = null

    private var changingResource = false
    private var lastEmittedLocator: Locator? = null
    private var firstPageLoaded = CompletableDeferred<Unit>()
    private val scrollModeChapterNavigator = ScrollModeChapterNavigator()

    private val activity: FragmentActivity?
        get() = appContext.currentActivity as FragmentActivity?

    var pendingProps: Props = Props(
        bookUuid = null,
        locator = null,
        isPlaying = null,
        highlights = null,
        bookmarks = null,
        readaloudColor = null,
        readaloudDecoratorStyle = null,
        customFonts = null,
        foreground = null,
        background = null,
        fontFamily = null,
        lineHeight = null,
        paragraphSpacing = null,
        fontSize = null,
        textAlign = null,
        marginLeft = null,
        marginRight = null,
        scrollMode = null
    )
    var props: FinalizedProps? = null

    // @font-face rules for the fonts imported by the user, see injectCustomFonts()
    private var customFontsCss: String = ""

    // Readium can only serve the font sources of `addFontFamilyDeclaration` from the app's
    // assets, so the fonts imported by the user are embedded as data URLs instead.
    private fun applyCustomFonts(customFonts: List<CustomFont>) {
        customFontsCss = ""

        activity?.lifecycleScope?.launch {
            val css = withContext(Dispatchers.IO) { buildCustomFontsCss(customFonts) }

            customFontsCss = css
            injectCustomFonts()
        }
    }

    private fun buildCustomFontsCss(customFonts: List<CustomFont>): String =
        customFonts.mapNotNull { font ->
            val family = font.name
                .filterNot { it == '"' || it == '\\' || it.code < 0x20 || it.code == 0x7f }
                .trim()
            if (family.isEmpty()) return@mapNotNull null

            val bytes = try {
                File(Uri.parse(font.uri).path ?: font.uri).readBytes()
            } catch (e: Exception) {
                Log.w("StorytellerFonts", "Could not read the custom font ${font.name}", e)
                null
            } ?: return@mapNotNull null

            val type = if (font.type.equals("otf", ignoreCase = true)) "otf" else "ttf"
            val source = Base64.encodeToString(bytes, Base64.NO_WRAP)

            "@font-face { font-family: \"$family\"; font-style: normal; font-weight: normal;" +
                " src: url(data:font/$type;base64,$source) }"
        }.joinToString("\n")

    private fun injectCustomFonts() {
        val css = customFontsCss
        if (css.isEmpty()) return

        activity?.lifecycleScope?.launch {
            navigator?.evaluateJavascript(
                """
                (function() {
                  var style = document.getElementById('storyteller-custom-fonts');
                  if (!style) {
                    style = document.createElement('style');
                    style.id = 'storyteller-custom-fonts';
                    document.head.appendChild(style);
                  }
                  style.textContent = ${JSONObject.quote(css)};
                })();
                """.trimIndent()
            )
        }
    }

    private fun isSameLocatorPosition(lhs: Locator?, rhs: Locator?): Boolean {
        if (lhs == null || rhs == null) {
            return lhs == null && rhs == null
        }

        if (lhs.href != rhs.href) return false

        val lhsFragment = lhs.locations.fragments.firstOrNull()
        val rhsFragment = rhs.locations.fragments.firstOrNull()
        if (lhsFragment != null || rhsFragment != null) {
            return lhsFragment == rhsFragment
        }

        val lhsProgression = lhs.locations.progression
        val rhsProgression = rhs.locations.progression
        if (lhsProgression != null || rhsProgression != null) {
            return lhsProgression != null &&
                rhsProgression != null &&
                abs(lhsProgression - rhsProgression) < 0.00001
        }

        return true
    }

    private fun emitLocatorChange(locator: Locator) {
        lastEmittedLocator = locator
        onLocatorChange(locator.toJSON().toMap())
    }

    private data class LayoutChange(
        val finalProps: FinalizedProps,
        val layoutModeChanged: Boolean,
        val enteredPageLayout: Boolean,
        val locatorChangedFromExternalUpdate: Boolean,
        val playbackStarted: Boolean,
    )

    private interface EpubLayoutBehavior {
        val supportsPagedClipScheduling: Boolean

        fun preferences(view: EpubView): EpubPreferences
        fun submitModePreferences(view: EpubView, change: LayoutChange)
        fun shouldNavigateToLocator(view: EpubView, change: LayoutChange): Boolean
        fun navigateToLocator(view: EpubView, locator: Locator)
        fun handleExternalLocatorChange(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        )
        fun handlePlayingFragmentChanged(
            view: EpubView,
            change: LayoutChange,
            newFragment: String?,
            oldFragment: String?
        )
        fun keepPlayingLocatorVisible(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        )
        fun submitReadingPreferences(view: EpubView, change: LayoutChange)
        fun onTap(
            view: EpubView,
            event: TapEvent,
            directionalNavigationAdapter: DirectionalNavigationAdapter
        ): Boolean
        suspend fun isProgressionVisible(
            view: EpubView,
            currentLocator: Locator,
            progression: Double
        ): Boolean?
        suspend fun findOnPage(view: EpubView, locator: Locator)
    }

    private object PagedLayoutBehavior : EpubLayoutBehavior {
        override val supportsPagedClipScheduling = true

        override fun preferences(view: EpubView): EpubPreferences =
            view.epubPreferences()

        override fun submitModePreferences(view: EpubView, change: LayoutChange) {
            if (change.enteredPageLayout) {
                view.navigator?.submitPreferences(view.epubPreferences(scroll = false))
            }
        }

        override fun shouldNavigateToLocator(view: EpubView, change: LayoutChange): Boolean {
            val currentLocator = view.navigator?.currentLocator?.value
            return change.finalProps.locator?.let { locator ->
                !change.enteredPageLayout && locator != currentLocator
            } ?: false
        }

        override fun navigateToLocator(view: EpubView, locator: Locator) {
            view.go(locator)
        }

        override fun handleExternalLocatorChange(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        ) = Unit

        override fun handlePlayingFragmentChanged(
            view: EpubView,
            change: LayoutChange,
            newFragment: String?,
            oldFragment: String?
        ) {
            if (newFragment != null && (newFragment != oldFragment || change.enteredPageLayout || change.playbackStarted)) {
                view.player?.let { player ->
                    view.schedulePagedClipChanged(newFragment, player)
                }
            }
        }

        override fun keepPlayingLocatorVisible(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        ) = Unit

        override fun submitReadingPreferences(view: EpubView, change: LayoutChange) {
            view.navigator?.submitPreferences(view.epubPreferences())
        }

        override fun onTap(
            view: EpubView,
            event: TapEvent,
            directionalNavigationAdapter: DirectionalNavigationAdapter
        ): Boolean = directionalNavigationAdapter.onTap(event)

        override suspend fun isProgressionVisible(
            view: EpubView,
            currentLocator: Locator,
            progression: Double
        ): Boolean? = view.isPagedProgressionVisible(currentLocator, progression)

        override suspend fun findOnPage(view: EpubView, locator: Locator) {
            view.findOnPageInPagedLayout(locator)
        }
    }

    private object ScrollLayoutBehavior : EpubLayoutBehavior {
        override val supportsPagedClipScheduling = false

        override fun preferences(view: EpubView): EpubPreferences =
            view.epubPreferences(scroll = true)

        override fun submitModePreferences(view: EpubView, change: LayoutChange) {
            view.navigator?.submitPreferences(view.epubPreferences(scroll = true))
        }

        override fun shouldNavigateToLocator(view: EpubView, change: LayoutChange): Boolean {
            val currentLocator = view.navigator?.currentLocator?.value
            return change.finalProps.locator?.let { locator ->
                change.layoutModeChanged ||
                    currentLocator == null ||
                    locator.href != currentLocator.href
            } ?: false
        }

        override fun navigateToLocator(view: EpubView, locator: Locator) {
            view.go(locator, scrollAfterNavigation = true)
        }

        override fun handleExternalLocatorChange(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        ) {
            val locator = change.finalProps.locator ?: return
            if (!didNavigateToLocator && change.locatorChangedFromExternalUpdate && !change.finalProps.isPlaying) {
                // In active playback, same-resource updates are centered below; go() top-aligns first.
                view.go(locator, scrollAfterNavigation = true)
            }
        }

        override fun handlePlayingFragmentChanged(
            view: EpubView,
            change: LayoutChange,
            newFragment: String?,
            oldFragment: String?
        ) = Unit

        override fun keepPlayingLocatorVisible(
            view: EpubView,
            change: LayoutChange,
            didNavigateToLocator: Boolean
        ) {
            val locator = change.finalProps.locator ?: return
            if (didNavigateToLocator || !change.finalProps.isPlaying) return

            view.activity?.lifecycleScope?.launch {
                view.scrollFragmentIntoView(locator)
            }
        }

        override fun submitReadingPreferences(view: EpubView, change: LayoutChange) = Unit

        override fun onTap(
            view: EpubView,
            event: TapEvent,
            directionalNavigationAdapter: DirectionalNavigationAdapter
        ): Boolean {
            val width = view.navigator?.publicationView?.width?.toDouble() ?: return false
            val horizontalEdgeSize = maxOf(80.0, 0.3 * width)
            val x = event.point.x.toDouble()

            return when {
                x <= horizontalEdgeSize -> {
                    view.handleScrollModeEdgeTap(goForward = false)
                    true
                }
                x >= width - horizontalEdgeSize -> {
                    view.handleScrollModeEdgeTap(goForward = true)
                    true
                }
                else -> false
            }
        }

        override suspend fun isProgressionVisible(
            view: EpubView,
            currentLocator: Locator,
            progression: Double
        ): Boolean? = view.isScrollProgressionVisible(progression)

        override suspend fun findOnPage(view: EpubView, locator: Locator) {
            view.findOnPageInScrollLayout(locator)
        }
    }

    private fun layoutBehavior(props: FinalizedProps? = this.props): EpubLayoutBehavior =
        if (props?.scrollMode == true) ScrollLayoutBehavior else PagedLayoutBehavior

    fun layoutPreferences(): EpubPreferences =
        layoutBehavior(props!!).preferences(this)

    fun epubPreferences(scroll: Boolean? = null): EpubPreferences {
        val props = props!!
        return if (scroll == null) {
            EpubPreferences(
                backgroundColor = org.readium.r2.navigator.preferences.Color(props.background),
                fontFamily = props.fontFamily,
                fontSize = props.fontSize,
                lineHeight = props.lineHeight,
                paragraphSpacing = props.paragraphSpacing,
                textAlign = props.textAlign,
                textColor = org.readium.r2.navigator.preferences.Color(props.foreground),
            )
        } else {
            EpubPreferences(
                backgroundColor = org.readium.r2.navigator.preferences.Color(props.background),
                fontFamily = props.fontFamily,
                fontSize = props.fontSize,
                lineHeight = props.lineHeight,
                paragraphSpacing = props.paragraphSpacing,
                scroll = scroll,
                textAlign = props.textAlign,
                textColor = org.readium.r2.navigator.preferences.Color(props.foreground),
            )
        }
    }

    fun finalizeProps() {
        val oldProps = props

        val finalProps =
            FinalizedProps(
                bookUuid = pendingProps.bookUuid!!,
                locator = pendingProps.locator,
                isPlaying = pendingProps.isPlaying ?: oldProps?.isPlaying ?: false,
                highlights = pendingProps.highlights ?: oldProps?.highlights ?: listOf(),
                bookmarks = pendingProps.bookmarks ?: oldProps?.bookmarks ?: listOf(),
                readaloudColor = pendingProps.readaloudColor
                    ?: oldProps?.readaloudColor ?: 0xffffff00.toInt(),
                readaloudDecoratorStyle = pendingProps.readaloudDecoratorStyle
                    ?: oldProps?.readaloudDecoratorStyle ?: "highlight",
                customFonts = pendingProps.customFonts ?: oldProps?.customFonts ?: listOf(),
                foreground = pendingProps.foreground
                    ?: oldProps?.foreground ?: "#111111".toColorInt(),
                background = pendingProps.background
                    ?: oldProps?.background ?: "#FFFFFF".toColorInt(),
                fontFamily = pendingProps.fontFamily
                    ?: oldProps?.fontFamily ?: FontFamily("Literata"),
                lineHeight = pendingProps.lineHeight ?: oldProps?.lineHeight ?: 1.4,
                paragraphSpacing = pendingProps.paragraphSpacing
                    ?: oldProps?.paragraphSpacing ?: 0.5,
                fontSize = pendingProps.fontSize ?: oldProps?.fontSize ?: 1.0,
                textAlign = pendingProps.textAlign ?: oldProps?.textAlign ?: TextAlign.JUSTIFY,
                marginLeft = pendingProps.marginLeft ?: oldProps?.marginLeft ?: 0,
                marginRight = pendingProps.marginRight ?: oldProps?.marginRight ?: 0,
                scrollMode = pendingProps.scrollMode ?: oldProps?.scrollMode ?: false
            )

        props = finalProps
        val scrollModeChanged = oldProps?.let { finalProps.scrollMode != it.scrollMode } ?: false
        val customFontsChanged = finalProps.customFonts != oldProps?.customFonts
        val fontFamilyChanged = finalProps.fontFamily != oldProps?.fontFamily
        val enteredPageLayout = oldProps?.scrollMode == true && !finalProps.scrollMode
        val locatorChangedFromExternalUpdate = finalProps.locator != null &&
            !isSameLocatorPosition(finalProps.locator, oldProps?.locator) &&
            !isSameLocatorPosition(finalProps.locator, lastEmittedLocator)
        val playbackStarted = finalProps.isPlaying && oldProps?.isPlaying != true
        val layoutChange = LayoutChange(
            finalProps = finalProps,
            layoutModeChanged = scrollModeChanged,
            enteredPageLayout = enteredPageLayout,
            locatorChangedFromExternalUpdate = locatorChangedFromExternalUpdate,
            playbackStarted = playbackStarted,
        )
        val layoutBehavior = layoutBehavior(finalProps)

        if (
            finalProps.bookUuid != oldProps?.bookUuid ||
            customFontsChanged
        ) {
            destroyNavigator()
            initializeNavigator()
        }

        if (customFontsChanged) {
            applyCustomFonts(finalProps.customFonts)
        }

        if (fontFamilyChanged) {
            injectCustomFonts()
        }

        layoutBehavior.submitModePreferences(this, layoutChange)
        val shouldNavigateToLocator = layoutBehavior.shouldNavigateToLocator(this, layoutChange)
        if (shouldNavigateToLocator) {
            finalProps.locator?.let { locator ->
                layoutBehavior.navigateToLocator(this, locator)
            }
        } else {
            layoutBehavior.handleExternalLocatorChange(
                this,
                layoutChange,
                didNavigateToLocator = false
            )
        }

        if (finalProps.marginLeft != oldProps?.marginLeft) {
            setCssVar("--st-padding-left", "${finalProps.marginLeft}px")
        }

        if (finalProps.marginRight != oldProps?.marginRight) {
            setCssVar("--st-padding-right", "${finalProps.marginRight}px")
        }

        if (finalProps.isPlaying && finalProps.locator != null) {
            applyReadaloudDecoration(finalProps.locator!!)

            val newFragment = finalProps.locator?.locations?.fragments?.firstOrNull()
            val oldFragment = oldProps?.locator?.locations?.fragments?.firstOrNull()

            layoutBehavior.handlePlayingFragmentChanged(
                this,
                layoutChange,
                newFragment,
                oldFragment
            )
        } else {
            clearReadaloudDecoration()
        }

        if (finalProps.highlights != oldProps?.highlights) {
            decorateHighlights()
        }

        if (finalProps.bookmarks != oldProps?.bookmarks && finalProps.locator != null) {
            activity?.lifecycleScope?.launch { findOnPage(finalProps.locator!!) }
        }

        layoutBehavior.keepPlayingLocatorVisible(
            this,
            layoutChange,
            didNavigateToLocator = shouldNavigateToLocator
        )
        layoutBehavior.submitReadingPreferences(this, layoutChange)
    }

    fun initializeNavigator() {
        val publication = BookService.getPublication(props!!.bookUuid) ?: return

        val fragmentTag = resources.getString(R.string.epub_fragment_tag)
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?

        firstPageLoaded = CompletableDeferred()

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

        val directionalNavigationAdapter = DirectionalNavigationAdapter(
            navigator!!,
            animatedTransition = true,
        )

        navigator?.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean {
                return layoutBehavior().onTap(
                    this@EpubView,
                    event,
                    directionalNavigationAdapter
                )
            }

            override fun onKey(event: ReadiumKeyEvent): Boolean {
                return directionalNavigationAdapter.onKey(event)
            }
        })

        navigator?.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean {
                onMiddleTouch(mapOf())
                return true
            }
        })

        locationEmitter = activity?.lifecycleScope?.launch {
            firstPageLoaded.await()
            navigator?.currentLocator?.collect {
                onLocatorChanged(it)
            }
            emitCurrentLocator()
        }

        current = this
    }

    fun destroyNavigator() {
        locationEmitter?.cancel()
        locationEmitter = null

        val navigator = this.navigator ?: return
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.supportFragmentManager?.commitNow {
            setReorderingAllowed(true)
            remove(navigator.requireParentFragment())
        }

        removeView(navigator.view)

        this.navigator = null

        if (current === this) {
            current = null
        }
    }

    private fun setCssVar(name: String, value: String) {
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?

        activity?.lifecycleScope?.launch {
            navigator?.evaluateJavascript(
                """
                (function() {
                  document.body.style.setProperty('${name}', '${value}')
                })();
            """.trimIndent()
            )
        }
    }

    private suspend fun emitCurrentLocator() {
        val currentLocator = navigator!!.currentLocator.value
        val propLocator = props?.locator
        val isPropLocatorOnPage = propLocator?.locations?.fragments?.firstOrNull()?.let {
            val result = navigator?.evaluateJavascript(
                """
            (function() {
                if (!globalThis.storyteller || !storyteller.isFirstClientRectOnScreen) return false;
                const element = document.getElementById(${JSONObject.quote(it)});
                return storyteller.isFirstClientRectOnScreen(element);
            })();
            """.trimIndent()
            )
            result?.let { Json.decodeFromString<Boolean?>(it) }
        } ?: propLocator?.locations?.progression?.let {
            layoutBehavior().isProgressionVisible(this, currentLocator, it)
        } ?: false

        val found = navigator!!.firstVisibleElementLocator()
        if (found == null) {
            // If the locator specified by the prop is still on the page, don't emit
            // a change event. We haven't actually changed the page.
            if (isPropLocatorOnPage) return
            emitLocatorChange(currentLocator)
            return
        }

        val merged = currentLocator.copy(
            locations = currentLocator.locations.copy(
                fragments = found.locations.fragments,
                otherLocations = found.locations.otherLocations,
            ),
        )

        // If the locator specified by the prop is still on the page,
        // we still need to emit if we're adding fragments that we didn't
        // have initially
        if (isPropLocatorOnPage && (props?.locator?.locations?.fragments?.size ?: 0) > 0) {
            return
        }

        emitLocatorChange(merged)
    }

    fun go(locator: Locator, scrollAfterNavigation: Boolean = false) {
        if (locator.href != navigator?.currentLocator?.value?.href) {
            changingResource = true
        }
        navigator!!.go(locator, true)
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        if (scrollAfterNavigation) {
            activity?.lifecycleScope?.launch {
                scrollFragmentIntoView(locator)
            }
        }
    }

    private suspend fun scrollFragmentIntoView(locator: Locator) {
        val id = locator.locations.fragments.firstOrNull() ?: return
        navigator?.evaluateJavascript(
            """
            (function() {
                if (!globalThis.storyteller || !storyteller.scrollElementIntoView) return false;
                const element = document.getElementById(${JSONObject.quote(id)});
                return storyteller.scrollElementIntoView(element);
            })();
            """.trimIndent()
        )
    }

    private suspend fun isAtScrollBoundary(end: Boolean): Boolean {
        val result = navigator?.evaluateJavascript(
            """
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                const tolerance = 1;

                return ${if (end) {
                    "scroller.scrollTop >= maxScrollTop - tolerance"
                } else {
                    "scroller.scrollTop <= tolerance"
                }};
            })();
            """.trimIndent()
        ) ?: return false

        return Json.decodeFromString<Boolean?>(result) ?: false
    }

    private fun handleScrollModeEdgeTap(goForward: Boolean) {
        activity?.lifecycleScope?.launch {
            if (isAtScrollBoundary(end = goForward)) {
                val navigator = navigator ?: return@launch
                if (goForward) {
                    scrollModeChapterNavigator.goForward(navigator, animated = true)
                } else {
                    scrollModeChapterNavigator.goBackward(navigator, animated = true)
                }
            } else {
                scrollCurrentResource(goForward = goForward)
            }
        }
    }

    private suspend fun scrollCurrentResource(goForward: Boolean): Boolean {
        val direction = if (goForward) 1 else -1
        val result = navigator?.evaluateJavascript(
            """
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                const delta = Math.max(96, viewportHeight * 0.65) * $direction;
                const targetScrollTop = Math.min(maxScrollTop, Math.max(0, scroller.scrollTop + delta));

                if (Math.abs(targetScrollTop - scroller.scrollTop) < 1) return false;

                try {
                    scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                } catch (_) {
                    scroller.scrollTop = targetScrollTop;
                }

                return true;
            })();
            """.trimIndent()
        ) ?: return false

        return Json.decodeFromString<Boolean?>(result) ?: false
    }

    private suspend fun isScrollProgressionVisible(progression: Double): Boolean? {
        val result = navigator?.evaluateJavascript(
            """
            (function() {
                const scroller = document.scrollingElement || document.documentElement;
                const viewportHeight = window.innerHeight;
                const visibleTopProgression = scroller.scrollHeight > 0
                    ? scroller.scrollTop / scroller.scrollHeight
                    : 0;
                const visibleBottomProgression = scroller.scrollHeight > 0
                    ? (scroller.scrollTop + viewportHeight) / scroller.scrollHeight
                    : 1;

                return $progression >= visibleTopProgression &&
                    $progression <= visibleBottomProgression;
            })();
            """.trimIndent()
        ) ?: return null

        return Json.decodeFromString<Boolean?>(result)
    }

    private suspend fun isPagedProgressionVisible(
        currentLocator: Locator,
        progression: Double
    ): Boolean? {
        val result = navigator?.evaluateJavascript(
            """
            (function() {
                const width = Android.getViewportWidth();
                const pageWidth = width / window.devicePixelRatio;

                function snapOffset(offset) {
                    const value = offset + 1;
                    return value - (value % pageWidth);
                }

                const documentWidth = document.scrollingElement.scrollWidth;
                const currentPageStart = snapOffset(documentWidth * ${currentLocator.locations.progression});
                const currentPageEnd = currentPageStart + pageWidth;
                return $progression * documentWidth >= currentPageStart &&
                    $progression * documentWidth < currentPageEnd;
            })();
            """.trimIndent()
        ) ?: return null

        return Json.decodeFromString<Boolean?>(result)
    }

    suspend fun getFragmentPageProportion(fragmentId: String): Map<String, Any>? {
        val nav = navigator ?: return null

        val result = nav.evaluateJavascript("""
            (function() {
                return storyteller.getFragmentPageProportion("$fragmentId");
            })();
        """.trimIndent()) ?: return null

        return try {
            val json = JSONObject(result)
            mapOf(
                "crossesPage" to json.getBoolean("crossesPage"),
                "proportionOnCurrentPage" to json.getDouble("proportionOnCurrentPage")
            )
        } catch (e: Exception) {
            null
        }
    }

    fun handleClipChanged(fragmentId: String, player: AudiobookPlayer) {
        layoutBehavior().handlePlayingFragmentChanged(
            this,
            LayoutChange(
                finalProps = props ?: return,
                layoutModeChanged = false,
                enteredPageLayout = false,
                locatorChangedFromExternalUpdate = false,
                playbackStarted = false,
            ),
            newFragment = fragmentId,
            oldFragment = null
        )
    }

    private fun schedulePagedClipChanged(fragmentId: String, player: AudiobookPlayer) {
        val activity = activity ?: return

        activity.lifecycleScope.launch {
            val result = getFragmentPageProportion(fragmentId) ?: return@launch
            val crossesPage = result["crossesPage"] as? Boolean ?: return@launch
            if (!crossesPage) return@launch

            val proportion = result["proportionOnCurrentPage"] as? Double ?: return@launch

            player.scheduleClipEvent(fragmentId, proportion) {
                activity.lifecycleScope.launch {
                    if (!layoutBehavior().supportsPagedClipScheduling) return@launch

                    val recheck = getFragmentPageProportion(fragmentId)
                    val overflowsRight = (recheck?.get("crossesPage") as? Boolean) ?: false

                    if (overflowsRight) {
                        // not animated
                        navigator?.goForward()
                    }
                }
            }
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

    fun applyReadaloudDecoration(locator: Locator) {
        val id = locator.locations.fragments.firstOrNull() ?: return

        val style =
            if (props!!.readaloudDecoratorStyle == "underline") {
                Decoration.Style.Underline(props!!.foreground)
            } else {
                Decoration.Style.Highlight(props!!.readaloudColor, isActive = true)
            }
        val decoration = Decoration(id, locator, style)

        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.applyDecorations(listOf(decoration), "overlay")
        }
    }

    fun clearReadaloudDecoration() {
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            navigator?.applyDecorations(listOf(), "overlay")
        }
    }

    suspend fun findOnPage(locator: Locator) {
        layoutBehavior().findOnPage(this, locator)
    }

    private suspend fun findOnPageInScrollLayout(locator: Locator) {
        val epubNav = navigator ?: return

        val bookmarkCandidates = props!!.bookmarks.mapIndexedNotNull { index, bookmark ->
            if (bookmark.href != locator.href) return@mapIndexedNotNull null

            JSONObject().apply {
                put("index", index)
                bookmark.locations.fragments.firstOrNull()?.let { put("fragment", it) }
                bookmark.locations.progression?.let { put("progression", it) }
            }
        }

        val jsBookmarksArray = JSONArray(bookmarkCandidates).toString()
        val result = epubNav.evaluateJavascript(
            """
                (function() {
                    const bookmarks = $jsBookmarksArray;
                    const scroller = document.scrollingElement || document.documentElement;
                    const viewportHeight = window.innerHeight;
                    const visibleTopProgression = scroller.scrollHeight > 0
                        ? scroller.scrollTop / scroller.scrollHeight
                        : 0;
                    const visibleBottomProgression = scroller.scrollHeight > 0
                        ? (scroller.scrollTop + viewportHeight) / scroller.scrollHeight
                        : 1;

                    return bookmarks.filter((bookmark) => {
                        if (bookmark.fragment) {
                            const element = document.getElementById(bookmark.fragment);
                            if (element) {
                                const rects = Array.from(element.getClientRects());
                                const visibleRects = rects.length > 0 ? rects : [element.getBoundingClientRect()];
                                const isVisible = visibleRects.some((rect) => {
                                    const isVerticallyVisible = rect.bottom >= 0 && rect.top <= viewportHeight;
                                    const isHorizontallyVisible = rect.right >= 0 && rect.left <= window.innerWidth;
                                    return isVerticallyVisible && isHorizontallyVisible;
                                });

                                if (isVisible) return true;
                            }
                        }

                        if (typeof bookmark.progression === 'number') {
                            return bookmark.progression >= visibleTopProgression &&
                                bookmark.progression <= visibleBottomProgression;
                        }

                        return false;
                    }).map((bookmark) => bookmark.index);
                })();
                """.trimIndent()
        ) ?: return onBookmarksActivate(mapOf("activeBookmarks" to listOf<Locator>()))

        val activeIndexes = try {
            Json.decodeFromString<List<Int>>(result).toSet()
        } catch (e: Exception) {
            emptySet()
        }
        val found = props!!.bookmarks.filterIndexed { index, _ -> activeIndexes.contains(index) }

        onBookmarksActivate(mapOf("activeBookmarks" to found.map { it.toJSON().toMap() }))
    }

    private suspend fun findOnPageInPagedLayout(locator: Locator) {
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
            val locator = props!!.locator ?: return@launch
            val fragments =
                BookService.getFragments(props!!.bookUuid, locator)

            val joinedFragments = fragments.joinToString { "\"${it.fragmentId}\"" }
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
                    })
                }, {
                    threshold: [0],
                })

                document.addEventListener('selectionchange', () => {
                    if (document.getSelection().isCollapsed) {
                        storytellerAPI.handleSelectionCleared();
                    }
                });

                storyteller.isEntirelyOnScreen = function isEntirelyOnScreen(element) {
                    const rects = element.getClientRects()
                    return Array.from(rects).every((rect) => {
                        const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                        return isVerticallyWithin && isHorizontallyWithin;
                    });
                }

                storyteller.isFirstClientRectOnScreen = function isFirstClientRectOnScreen(element) {
                    if (!element) return false;

                    const rect = element.getClientRects()[0];
                    if (!rect) return false;

                    const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                    const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                    return isVerticallyWithin && isHorizontallyWithin;
                }

                storyteller.scrollElementIntoView = function scrollElementIntoView(element) {
                    if (!element) return false;

                    const rects = Array.from(element.getClientRects())
                        .filter((rect) => rect.width > 0 && rect.height > 0);
                    if (rects.length === 0) return false;

                    const top = Math.min(...rects.map((rect) => rect.top));
                    const bottom = Math.max(...rects.map((rect) => rect.bottom));
                    const viewportHeight = window.innerHeight;
                    const viewportCenter = viewportHeight / 2;
                    const elementCenter = top + ((bottom - top) / 2);
                    const deadZone = Math.min(36, Math.max(16, viewportHeight * 0.04));
                    const delta = elementCenter - viewportCenter;

                    if (Math.abs(delta) < deadZone) return false;

                    const scroller = document.scrollingElement || document.documentElement;
                    const maxScrollTop = Math.max(0, scroller.scrollHeight - viewportHeight);
                    const targetScrollTop = Math.min(maxScrollTop, Math.max(0, scroller.scrollTop + delta));
                    if (Math.abs(targetScrollTop - scroller.scrollTop) < 1) return false;

                    try {
                        scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                    } catch (_) {
                        scroller.scrollTop = targetScrollTop;
                    }
                    return true;
                }

                readium.findFirstVisibleLocator = function findFirstVisibleLocator() {
                    let firstVisibleFragmentId = null;

                    for (const fragmentId of storyteller.fragmentIds) {
                        const element = document.getElementById(fragmentId);
                        if (!element) continue;
                        if (storyteller.isEntirelyOnScreen(element)) {
                            firstVisibleFragmentId = fragmentId
                            break
                        }
                    }

                    if (firstVisibleFragmentId === null) return null;

                    return {
                        href: "#",
                        type: "application/xhtml+xml",
                        locations: {
                            cssSelector: "#" + firstVisibleFragmentId,
                            fragments: [firstVisibleFragmentId]
                        },
                        text: {
                            highlight: document.getElementById(firstVisibleFragmentId).textContent,
                        },
                    };
                }

                storyteller.fragmentIds = $jsFragmentsArray;
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                })

                storyteller.getFragmentPageProportion = function getFragmentPageProportion(fragmentId) {
                    const element = document.getElementById(fragmentId);
                    if (!element) return null;

                    const rects = Array.from(element.getClientRects());
                    if (rects.length === 0) return null;

                    const viewportWidth = window.innerWidth;
                    let visibleWidth = 0;
                    let totalWidth = 0;
                    let overflowsRight = false;

                    for (const rect of rects) {
                        totalWidth += rect.width;

                        if (rect.right > viewportWidth) {
                            overflowsRight = true;
                        }

                        if (rect.left >= 0 && rect.right <= viewportWidth) {
                            visibleWidth += rect.width;
                        } else if (rect.left < viewportWidth && rect.right > 0) {
                            const visibleLeft = Math.max(rect.left, 0);
                            const visibleRight = Math.min(rect.right, viewportWidth);
                            visibleWidth += visibleRight - visibleLeft;
                        }
                    }

                    if (totalWidth === 0) return null;

                    const proportion = visibleWidth / totalWidth;
                    return { crossesPage: overflowsRight, proportionOnCurrentPage: proportion };
                };

                document.body.firstElementChild.style.paddingLeft = "var(--st-padding-left)";
                document.body.firstElementChild.style.paddingRight = "var(--st-padding-right)";
                """.trimIndent()
            )

            setCssVar("--st-padding-left", "${props?.marginLeft ?: 0}px")
            setCssVar("--st-padding-right", "${props?.marginRight ?: 0}px")
        }

        return this
    }

    @JavascriptInterface
    fun handleDoubleTap(fragment: String) {
        val bookService = BookService
        val currentLocator = navigator?.currentLocator?.value ?: return
        val activity: FragmentActivity? = appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            val locator =
                bookService.buildFragmentLocator(props!!.bookUuid, currentLocator.href, fragment)

            onDoubleTouch(locator.toJSON().toMap())
        }
    }

    @JavascriptInterface
    fun handleSelectionCleared() {
        onSelection(mapOf("cleared" to true))
    }

    private suspend fun onLocatorChanged(locator: Locator) {
        findOnPage(locator)

        if (locator.href != props!!.locator?.href || changingResource) {
            changingResource = false

            val fragments = BookService.getFragments(props!!.bookUuid, locator)

            val joinedFragments = fragments.joinToString { "\"${it.fragmentId}\"" }
            val jsFragmentsArray = "[${joinedFragments}]"

            navigator?.evaluateJavascript(
                """
                storyteller.fragmentIds = $jsFragmentsArray;
                storyteller.fragmentIds.map((id) => document.getElementById(id)).forEach((element) => {
                    storyteller.observer.observe(element)
                })
            """.trimIndent()
            )
            if (props!!.isPlaying && props!!.locator?.href == locator.href) {
                applyReadaloudDecoration(props!!.locator!!)
            }
            emitCurrentLocator()
        } else {
            emitCurrentLocator()
        }
    }

    @ExperimentalReadiumApi
    override fun onExternalLinkActivated(url: AbsoluteUrl) {
        TODO("Not yet implemented")
    }

    override fun onPageLoaded() {
        injectCustomFonts()

        if (!firstPageLoaded.isCompleted) {
            firstPageLoaded.complete(Unit)
        }
    }

    override fun onPageChanged(pageIndex: Int, totalPages: Int, locator: Locator) = Unit

    override fun shouldFollowInternalLink(
        link: Link,
        context: HyperlinkNavigator.LinkContext?,
    ): Boolean =
        when (context) {
            is HyperlinkNavigator.FootnoteContext -> {
                onShowFootnote(mapOf("content" to context.noteContent))
                false
            }
            else -> true
        }
}
