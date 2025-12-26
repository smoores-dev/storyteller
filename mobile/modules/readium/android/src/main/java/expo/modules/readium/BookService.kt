@file:OptIn(InternalReadiumApi::class)

package expo.modules.readium

import kotlinx.coroutines.runBlocking
import org.readium.r2.shared.Clip
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.publication.Href
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.indexOfFirstWithHref
import org.readium.r2.shared.publication.services.positions
import org.readium.r2.shared.publication.services.positionsByReadingOrder
import org.readium.r2.shared.util.RelativeUrl
import org.readium.r2.shared.util.Try
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.asset.DefaultArchiveOpener
import org.readium.r2.shared.util.asset.DefaultFormatSniffer
import org.readium.r2.shared.util.data.Container
import org.readium.r2.shared.util.data.Readable
import org.readium.r2.shared.util.data.decodeString
import org.readium.r2.shared.util.data.decodeXml
import org.readium.r2.shared.util.data.readDecodeOrNull
import org.readium.r2.shared.util.file.FileResourceFactory
import org.readium.r2.shared.util.fromEpubHref
import org.readium.r2.shared.util.getOrElse
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.shared.util.resource.Resource
import org.readium.r2.shared.util.xml.ElementNode
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.epub.EpubParser
import java.io.File
import java.net.URL
import java.util.zip.ZipFile

class BookService() {

    /** Returns the resource data as an XML Document at the given [url], or null. */
    @OptIn(InternalReadiumApi::class)
    private suspend inline fun Container<Readable>.readDecodeXmlOrNull(
        url: Url,
    ): ElementNode? =
        readDecodeOrNull(url) { it.decodeXml() }

    private val retriever: AssetRetriever = AssetRetriever(
        FileResourceFactory(),
        DefaultArchiveOpener(), DefaultFormatSniffer()
    )

    @OptIn(InternalReadiumApi::class)
    private val opener: PublicationOpener =
        PublicationOpener(
            EpubParser()
        )
    private var publications: MutableMap<String, Publication> = mutableMapOf()
    private var mediaOverlays: MutableMap<String, Map<Href, STMediaOverlays>> = mutableMapOf()

    fun extractArchive(archiveUrl: URL, extractedUrl: URL) {
        ZipFile(archiveUrl.path).use { zip ->
            zip.entries().asSequence()
                .filterNot { it.isDirectory }
                .forEach { entry ->
                    zip.getInputStream(entry).use { input ->
                        val newFile = File(extractedUrl.path, entry.name)
                        newFile.parentFile?.mkdirs()
                        newFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                }
        }
    }

    fun getPublication(bookUuid: String): Publication? {
        return publications[bookUuid]
    }

    fun getResource(bookUuid: String, link: Link): Resource? {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")
        return publication.get(link)
    }

    suspend fun getPositions(bookUuid: String): List<Locator> {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")
        return publication.positions()
    }

    @OptIn(InternalReadiumApi::class)
    fun getClip(bookUuid: String, locator: Locator): Clip? {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")
        val link = try {
            publication.readingOrder.first { it.url() == locator.href }
        } catch (_: NoSuchElementException) {
            throw Exception("Locator ${locator.href} could not be found in reading order for book $bookUuid")
        }
        val overlayHref = try {
            link.properties["mediaOverlay"] as Url?
        } catch (_: NoSuchElementException) {
            null
        } ?: return null

        val mediaOverlays = this.mediaOverlays[bookUuid]?.get(Href(overlayHref)) ?: return null

        val fragment = try {
            locator.locations.fragments.first()
        } catch (_: Exception) {
            return null
        }

        return mediaOverlays.clip(fragment)
    }

    @OptIn(InternalReadiumApi::class)
    private suspend fun locateFromPositions(bookUuid: String, link: Link): Locator {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")

        val readingOrderIndex = publication.readingOrder.indexOfFirstWithHref(link.url())
            ?: throw Exception("Could not find a locator for href ${link.href} in reading order for book $bookUuid")

        return publication.positionsByReadingOrder()[readingOrderIndex].first()
    }

    @OptIn(InternalReadiumApi::class)
    suspend fun buildFragmentLocator(bookUuid: String, href: Url, fragment: String): Locator {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")

        val defaultLocator = Locator(
            href = href,
            mediaType = MediaType.XHTML
        )

        val link = publication.linkWithHref(href) ?: return defaultLocator

        val resource = publication.get(link) ?: return defaultLocator
        val htmlContent = resource.readDecodeOrNull { Try.success(it.decodeString()) }?.getOrNull()
            ?: return defaultLocator
        val fragmentRegex = Regex("id=\"${fragment}\"")
        val startOfFragment = fragmentRegex.find(htmlContent)?.range?.start ?: return defaultLocator
        val progression = startOfFragment.toDouble() / htmlContent.length.toDouble()
        val startOfChapterProgression =
            locateFromPositions(bookUuid, link).locations.totalProgression
                ?: return defaultLocator
        val chapterIndex = publication.readingOrder.indexOfFirstWithHref(link.url())
            ?: return defaultLocator
        val nextChapterIndex = chapterIndex + 1
        val startOfNextChapterProgression = nextChapterIndex.let {
            if (it == publication.readingOrder.size) {
                return@let 1.0
            } else {
                val nextChapterLink = publication.readingOrder[nextChapterIndex]
                return@let locateFromPositions(bookUuid, nextChapterLink).locations.totalProgression
            }
        } ?: return defaultLocator
        val totalProgression =
            startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))

        return Locator(
            href = href,
            mediaType = MediaType.XHTML,
            locations = Locator.Locations(
                fragments = listOf(fragment),
                progression = progression,
                totalProgression = totalProgression
            )
        )
    }

    fun getFragments(bookUuid: String, locator: Locator): List<TextFragment> {
        val mediaOverlayStore = this.mediaOverlays[bookUuid] ?: return emptyList()
        val mediaOverlays = mediaOverlayStore.values
        val textFragments = mediaOverlays.flatMap { it.fragments() }
        return textFragments.filter { it.href == locator.href }
    }

    suspend fun getFragment(bookUuid: String, clipUrl: String, position: Double): TextFragment? {
        val mediaOverlayStore = this.mediaOverlays[bookUuid] ?: return null

        var maybeFragment: TextFragment? = null
        for (mediaOverlays in mediaOverlayStore.values) {
            val found = mediaOverlays.fragment(clipUrl, position) ?: continue
            maybeFragment = found
            break
        }

        val fragment = maybeFragment ?: return null
        fragment.locator = buildFragmentLocator(bookUuid, fragment.href, fragment.fragment)

        return fragment
    }

    suspend fun getPreviousFragment(bookUuid: String, locator: Locator): TextFragment? {
        val currentFragment = locator.locations.fragments.firstOrNull() ?: return null
        val mediaOverlayStore = this.mediaOverlays[bookUuid] ?: return null
        val mediaOverlays = mediaOverlayStore.values
        val textFragments = mediaOverlays.flatMap { it.fragments() }
        val currentIndex =
            textFragments.indexOfFirst { it.href == locator.href && it.fragment == currentFragment }
        if (currentIndex == 0) return null
        val previousIndex = currentIndex.dec()
        val previousFragment = textFragments[previousIndex]
        previousFragment.locator =
            buildFragmentLocator(bookUuid, previousFragment.href, previousFragment.fragment)
        return previousFragment
    }

    suspend fun getNextFragment(bookUuid: String, locator: Locator): TextFragment? {
        val currentFragment = locator.locations.fragments.firstOrNull() ?: return null
        val mediaOverlayStore = this.mediaOverlays[bookUuid] ?: return null
        val mediaOverlays = mediaOverlayStore.values
        val textFragments = mediaOverlays.flatMap { it.fragments() }
        val currentIndex =
            textFragments.indexOfFirst { it.href == locator.href && it.fragment == currentFragment }
        if (currentIndex == textFragments.size - 1) return null
        val nextIndex = currentIndex.inc()
        val nextFragment = textFragments[nextIndex]
        nextFragment.locator =
            buildFragmentLocator(bookUuid, nextFragment.href, nextFragment.fragment)
        return nextFragment
    }

    fun locateLink(bookUuid: String, link: Link): Locator? {
        val publication = getPublication(bookUuid) ?: return null
        return publication.locatorFromLink(link)
    }

    suspend fun openPublication(bookUuid: String, url: URL): Publication {
        if (publications.contains(bookUuid)) {
            return publications[bookUuid]!!
        }

        val file = File(url.toURI())

        require(file.exists())

        val container =
            DirectoryContainer(file).getOrElse { throw Exception("Failed to open publication at $url: ${it.message}") }

        val asset = this.retriever.retrieve(container, MediaType.EPUB)
            .getOrElse { throw Exception("Failed to open publication at $url: ${it.message}") }

        val publication =
            opener.open(asset, allowUserInteraction = false, onCreatePublication = { ->
                val builder = this
                runBlocking {
                    val containerUrl = RelativeUrl("META-INF/container.xml") ?: return@runBlocking
                    val containerXml =
                        builder.container.readDecodeXmlOrNull(containerUrl) ?: return@runBlocking

                    val opfPath = containerXml
                        .getFirst("rootfiles", Namespaces.OPC)
                        ?.getFirst("rootfile", Namespaces.OPC)
                        ?.getAttr("full-path")
                        ?: return@runBlocking

                    val opfUrl = Url.fromEpubHref(opfPath) ?: return@runBlocking
                    val opfXmlDocument =
                        builder.container.readDecodeXmlOrNull(opfUrl) ?: return@runBlocking
                    val packageDocument = PackageDocument.parse(opfXmlDocument, opfUrl)
                        ?: return@runBlocking

                    val manifestItems = packageDocument.manifest

                    @Suppress("UNCHECKED_CAST")
                    val itemById = manifestItems
                        .filter { it.id != null }
                        .associateBy(Item::id) as Map<String, Item>
                    val readingOrder = builder.manifest.readingOrder.toMutableList()

                    for (manifestItem in manifestItems) {
                        val mediaOverlayId = manifestItem.mediaOverlay ?: continue
                        val mediaOverlayHref = itemById[mediaOverlayId]?.href ?: continue
                        val manifestItemHref = manifestItem.href
                        val linkIndex =
                            readingOrder.indexOfFirstWithHref(manifestItemHref) ?: continue
                        val link = readingOrder[linkIndex]
                        readingOrder[linkIndex] =
                            link.addProperties(mapOf("mediaOverlay" to mediaOverlayHref))
                    }

                    builder.manifest = builder.manifest.copy(
                        readingOrder = readingOrder
                    )
                }

            })
                .getOrElse { throw Exception("Failed to open publication at $url: ${it.message}") }

        publications[bookUuid] = publication
        makeMediaOverlays(bookUuid, publication)
        return publication
    }

    @OptIn(ExperimentalReadiumApi::class, InternalReadiumApi::class)
    suspend fun buildAudiobookManifest(bookUuid: String): Manifest {
        val publication = getPublication(bookUuid)
            ?: throw Exception("Publication for book $bookUuid is unopened.")
        val mediaOverlays = this.mediaOverlays[bookUuid]
            ?: throw Exception("Book $bookUuid has no media overlays")

        suspend fun buildAudiobookTocLink(link: Link): Link? {
            val children = link.children.mapNotNull { buildAudiobookTocLink(it) }
            val fallbackLink = children.firstOrNull()?.let {
                Link(
                    href = it.href,
                    mediaType = it.mediaType,
                    title = link.title,
                    duration = 0.0,
                    children = children
                )
            }

            val tocLocator = locateLink(bookUuid, link) ?: return fallbackLink
            val plainLink = publication.linkWithHref(tocLocator.href) ?: return fallbackLink
            val mediaOverlayHref = plainLink.properties["mediaOverlay"] ?: return fallbackLink
            val overlay = mediaOverlays[Href(mediaOverlayHref as Url)] ?: return fallbackLink

            val clip = if (tocLocator.locations.fragments.isNotEmpty()) {
                val resource = publication.get(plainLink)
                val htmlContent =
                    resource?.readDecodeOrNull { Try.success(it.decodeString()) }?.getOrNull()
                        ?: return fallbackLink
                val fragmentRegex = Regex("id=\"${tocLocator.locations.fragments.first()}\"")
                val endOfFragment =
                    fragmentRegex.find(htmlContent)?.range?.endInclusive ?: return fallbackLink
                val nextFragmentRegex = Regex("id=\"([a-zA-Z][a-zA-Z0-9\\-_:.]*)\"")
                val nextFragment =
                    nextFragmentRegex.find(htmlContent, endOfFragment)?.groups?.get(1)?.value
                        ?: return fallbackLink
                overlay.clip(nextFragment) ?: return fallbackLink
            } else {
                overlay.clips().firstOrNull() ?: return fallbackLink
            }

            val clipResource =
                publication.resources.first { it.href.toString() == clip.audioResource }
            val duration = overlay.link.duration

            val href = Href("${clip.audioResource}#t=${clip.start}") ?: return fallbackLink

            return Link(
                href = href,
                mediaType = clipResource.mediaType,
                title = link.title,
                duration = duration,
                children = children
            )
        }

        val clips = emptyMap<String, Double>().toMutableMap()

        for (overlay in mediaOverlays.values) {
            for (clip in overlay.clips()) {
                val audioResource = clip.audioResource ?: continue
                val duration = clips.getOrDefault(clip.audioResource, 0.0)
                val end = clip.end ?: 0.0
                val start = clip.start ?: 0.0
                clips[audioResource] = duration + end - start
            }
        }

        return Manifest(
            metadata = publication.metadata,
            tableOfContents = publication.tableOfContents.mapNotNull { buildAudiobookTocLink(it) },
            readingOrder = clips.entries.mapNotNull {
                publication.linkWithHref(
                    Url.fromEpubHref(it.key)!!
                )?.copy(duration = it.value)
            }
        )
    }

    @OptIn(InternalReadiumApi::class)
    private suspend fun makeMediaOverlays(bookUuid: String, publication: Publication) {
        val mediaOverlayStore: MutableMap<Href, STMediaOverlays> = mutableMapOf()

        val mediaOverlayLinks = publication.resources.filter { it.mediaType == MediaType.SMIL }

        for (link in mediaOverlayLinks) {
            val smilResource = publication.get(link)
            try {
                val smilXml =
                    smilResource?.readDecodeOrNull { Try.success(it.decodeXml()) }?.getOrNull()
                        ?: continue
                val mediaOverlays = SmilParser.parse(smilXml, link) ?: continue
                mediaOverlayStore[link.href] = mediaOverlays
            } finally {
                smilResource?.close()
            }
        }

        this.mediaOverlays[bookUuid] = mediaOverlayStore
    }
}
