@file:OptIn(InternalReadiumApi::class)

package expo.modules.readium

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.View
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.epub.css.FontStyle
import org.readium.r2.navigator.epub.css.FontWeight
import org.readium.r2.navigator.epub.css.RsProperties
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.util.BaseActionModeCallback
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Publication
import kotlin.math.ceil

class SelectionActionModeCallback(private val epubView: EpubView) : BaseActionModeCallback() {
    override fun onCreateActionMode(mode: ActionMode?, menu: Menu?): Boolean {
        val activity: FragmentActivity? = epubView.appContext.currentActivity as FragmentActivity?
        activity?.lifecycleScope?.launch {
            val selection = epubView.navigator?.currentSelection() ?: return@launch
            selection.rect?.let {
                val x = ceil(it.centerX() / epubView.resources.displayMetrics.density).toInt()
                val y = ceil(it.top / epubView.resources.displayMetrics.density).toInt() - 16
                epubView.onSelection(
                    mapOf(
                        "locator" to selection.locator.toJSON().toMap(),
                        "x" to x,
                        "y" to y
                    )
                )
            }
        }

        return true
    }
}

@SuppressLint("ViewConstructor")
@OptIn(ExperimentalReadiumApi::class)
class EpubFragment(
    private val publication: Publication,
    private val listener: EpubView
) : Fragment(R.layout.fragment_reader) {
    var navigator: EpubNavigatorFragment? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        childFragmentManager.fragmentFactory = EpubNavigatorFactory(
            publication,
            EpubNavigatorFactory.Configuration(
                defaults = EpubDefaults(
                    publisherStyles = false
                ),
            ),
        ).createFragmentFactory(
            listener.props!!.locator,
            listener = listener,
            paginationListener = listener,
            configuration = EpubNavigatorFragment.Configuration {
                servedAssets = listOf("fonts/Literata_500Medium.ttf")
                shouldApplyInsetsPadding = false
                disablePageTurnsWhileScrolling = true

                addFontFamilyDeclaration(FontFamily("Literata")) {
                    addFontFace {
                        addSource("fonts/Literata_500Medium.ttf")
                        setFontStyle(FontStyle.NORMAL)
                        setFontWeight(FontWeight.NORMAL)
                    }
                }

                // Custom fonts are imported at runtime, so they live outside the app's assets,
                // which is the only place Readium can serve an `addSource` path from on Android.
                // EpubView injects them into the pages as data URLs instead.

                selectionActionModeCallback = SelectionActionModeCallback(listener)

                registerJavascriptInterface("storytellerAPI") {
                    listener.setupUserScript()
                }
            },
            initialPreferences = listener.layoutPreferences(),
        )

        super.onCreate(savedInstanceState)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val navigatorFragmentTag = getString(R.string.epub_navigator_tag)

        if (savedInstanceState == null) {
            childFragmentManager.commitNow {
                setReorderingAllowed(true)
                add(
                    R.id.fragment_reader_container,
                    EpubNavigatorFragment::class.java,
                    Bundle(),
                    navigatorFragmentTag
                )
            }
        }
        navigator =
            childFragmentManager.findFragmentByTag(navigatorFragmentTag) as EpubNavigatorFragment
    }
}
