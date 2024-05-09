package expo.modules.readium

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PointF
import android.util.Log
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
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

@SuppressLint("ViewConstructor", "ResourceType")
@OptIn(ExperimentalDecorator::class)
class EpubView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    EpubNavigatorFragment.Listener {

    val onLocatorChange by EventDispatcher()
    val onMiddleTouch by EventDispatcher()

    var bookService: BookService? = null
    var bookId: Long? = null
    var locator: Locator? = null
    var isPlaying: Boolean = false
    var navigator: EpubNavigatorFragment? = null

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
        activity?.supportFragmentManager?.commitNow {
            setReorderingAllowed(true)
            add(EpubFragment(locator, publication, isPlaying, listener), fragmentTag)
        }

        val fragment =
            activity?.supportFragmentManager?.findFragmentByTag(fragmentTag) as? EpubFragment
        addView(fragment?.view)

        navigator = fragment?.navigator
        activity?.lifecycleScope?.launch {
            activity.repeatOnLifecycle(Lifecycle.State.STARTED) {
                navigator?.currentLocator?.collect {
                    onLocatorChanged(it)
                }
            }
        }

    }

    fun go() {
        val navigator = this.navigator ?: return initializeNavigator()
        val locator = this.locator ?: return

        navigator.go(locator, true)
        if (isPlaying) {
            highlightSelection()
        }
    }


    fun highlightSelection() {
        val locator = this.locator ?: return
        val id = locator.locations.fragments.first()

        val overlayHighlight = Decoration.Style.Highlight(0xffffff00.toInt(), isActive = true)
        val decoration = Decoration(id, locator, overlayHighlight)

        runBlocking {
            navigator?.applyDecorations(listOf(decoration), "overlay")
        }

    }

    fun clearHighlights() {
        runBlocking {
            navigator?.applyDecorations(listOf(), "overlay")
        }
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
        Log.d("EpubView", "Navigated to ${locator.locations.position}")

        val bookService = this.bookService ?: return
        val bookId = this.bookId ?: return

        val fragments = bookService.getFragments(bookId, locator)

        val joinedFragments = fragments.map { it.fragment }.joinToString(",") { "\"${it}\"" }
        val jsFragmentsArray = "[${joinedFragments}]"

        val result = navigator?.evaluateJavascript(
            """
            (function() {
                function isOnScreen(element) {
                    const rect = element.getBoundingClientRect();
                    const isVerticallyWithin = rect.bottom >= 0 && rect.top <= window.innerHeight;
                    const isHorizontallyWithin = rect.right >= 0 && rect.left <= window.innerWidth;
                    return isVerticallyWithin && isHorizontallyWithin;
                }
                debugger;
                for (const fragment of ${jsFragmentsArray}) {
                    const element = document.getElementById(fragment);
                    if (isOnScreen(element)) {
                        return fragment;
                    }
                }
          
                return null;
            })();
        """.trimIndent()
        )
        Log.d("EpubView", "result: $result")
        if (result == null || result == "null") {
            return onLocatorChange(locator.toJSON().toMap())
        }
        val fragmentsLocator =
            locator.copy(locations = locator.locations.copy(fragments = listOf(result.drop(1).dropLast(1))))
        onLocatorChange(fragmentsLocator.toJSON().toMap())
    }
}