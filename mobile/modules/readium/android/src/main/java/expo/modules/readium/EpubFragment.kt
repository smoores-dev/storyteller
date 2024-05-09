package expo.modules.readium

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.commitNow
import kotlinx.coroutines.runBlocking
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.ExperimentalDecorator
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.epub.css.FontStyle
import org.readium.r2.navigator.epub.css.FontWeight
import org.readium.r2.navigator.html.HtmlDecorationTemplates
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.html.cssSelector

@SuppressLint("ViewConstructor")
@OptIn(ExperimentalDecorator::class, ExperimentalReadiumApi::class)
class EpubFragment(var locator: Locator, val publication: Publication, var isPlaying: Boolean, val listener: EpubNavigatorFragment.Listener) : Fragment() {
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
            locator,
            listener = listener,
            configuration = EpubNavigatorFragment.Configuration {
                servedAssets = listOf(
                    "fonts/Bookerly.ttf"
                )

                addFontFamilyDeclaration(FontFamily("Bookerly")) {
                    addFontFace {
                        addSource("fonts/Bookerly.ttf")
                        setFontStyle(FontStyle.NORMAL)
                        setFontWeight(FontWeight.NORMAL)
                    }
                }
            },
            initialPreferences = EpubPreferences(
                fontFamily = FontFamily("Bookerly"),
                lineHeight = 1.4,
                paragraphSpacing = 0.5
            ),
        )

        super.onCreate(savedInstanceState)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
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
        return inflater.inflate(R.layout.fragment_reader, container, false)
    }
}