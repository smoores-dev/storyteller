package expo.modules.readium

import android.content.Context
import kotlinx.coroutines.runBlocking
import org.readium.r2.shared.Clip
import org.readium.r2.shared.extensions.addPrefix
import org.readium.r2.shared.fetcher.Resource
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.asset.FileAsset
import org.readium.r2.shared.publication.indexOfFirstWithHref
import org.readium.r2.shared.publication.services.positionsByReadingOrder
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.streamer.Streamer
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream

class BookService(private val context: Context) {

    private val streamer: Streamer =
        Streamer(this.context, onCreatePublication = { ->
            val builder = this
            runBlocking {
                val containerResource = builder.fetcher.get("/META-INF/container.xml")
                val maybeContainerXml = containerResource.readAsXml().getOrNull()
                containerResource.close()
                val opfPath = maybeContainerXml
                    ?.getFirst("rootfiles", Namespaces.OPC)
                    ?.getFirst("rootfile", Namespaces.OPC)
                    ?.getAttr("full-path")
                    ?: return@runBlocking

                val opfXmlDocument = fetcher.get(opfPath.addPrefix("/")).readAsXml().getOrThrow()
                val packageDocument = PackageDocument.parse(opfXmlDocument, opfPath)
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
                    val linkIndex = readingOrder.indexOfFirstWithHref(manifestItem.href) ?: continue
                    val link = readingOrder[linkIndex]
                    readingOrder[linkIndex] =
                        link.addProperties(mapOf("mediaOverlay" to mediaOverlayHref))
                }

                builder.manifest = builder.manifest.copy(
                    readingOrder = readingOrder
                )
            }

        })
    private var publications: MutableMap<Long, Publication> = mutableMapOf()
    private var mediaOverlays: MutableMap<Long, Map<String, STMediaOverlays>> = mutableMapOf()

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

    fun getPublication(bookId: Long): Publication? {
        return publications[bookId]
    }

    fun getResource(bookId: Long, link: Link): Resource {
        val publication = getPublication(bookId)
            ?: throw Exception("Publication for book $bookId is unopened.")
        return publication.get(link)
    }

    fun getClip(bookId: Long, locator: Locator): Clip? {
        val publication = getPublication(bookId)
            ?: throw Exception("Publication for book $bookId is unopened.")
        val link = try {
            publication.readingOrder.first { it.href == locator.href }
        } catch (e: NoSuchElementException) {
            throw Exception("Locator ${locator.href} could not be found in reading order for book $bookId")
        }
        val overlayHref = try {
            link.properties["mediaOverlay"] as String?
        } catch (e: NoSuchElementException) {
            null
        } ?: return null

        val mediaOverlays = this.mediaOverlays[bookId]?.get(overlayHref) ?: return null

        val fragment = try {
            locator.locations.fragments.first()
        } catch (e: Exception) {
            return null
        }

        return mediaOverlays.clip(fragment)
    }

    private suspend fun locateFromPositions(bookId: Long, link: Link): Locator {
        val publication = getPublication(bookId)
            ?: throw Exception("Publication for book $bookId is unopened.")

        val readingOrderIndex = publication.readingOrder.indexOfFirstWithHref(link.href)
            ?: throw Exception("Could not find a locator for href ${link.href} in reading order for book $bookId")

        return publication.positionsByReadingOrder()[readingOrderIndex].first()
    }

    suspend fun buildFragmentLocator(bookId: Long, href: String, fragment: String): Locator {
        val publication = getPublication(bookId)
            ?: throw Exception("Publication for book $bookId is unopened.")

        val defaultLocator = Locator(
            href = href,
            type = "application/xhtml+xml"
        )

        val link = publication.linkWithHref(href) ?: return defaultLocator

        val resource = publication.get(link)
        val htmlContent = resource.readAsString().getOrThrow()
        val fragmentRegex = Regex("id=\"${fragment}\"")
        val startOfFragment = fragmentRegex.find(htmlContent)?.range?.start ?: return defaultLocator
        val progression = startOfFragment.toDouble() / htmlContent.length.toDouble()
        val startOfChapterProgression = locateFromPositions(bookId, link).locations.totalProgression
            ?: return defaultLocator
        val chapterIndex = publication.readingOrder.indexOfFirstWithHref(link.href)
            ?: return defaultLocator
        val nextChapterIndex = chapterIndex + 1
        val startOfNextChapterProgression = nextChapterIndex.let {
            if (it == publication.readingOrder.size) {
                return@let 1.0
            } else {
                val nextChapterLink = publication.readingOrder[nextChapterIndex]
                return@let locateFromPositions(bookId, nextChapterLink).locations.totalProgression
            }
        } ?: return defaultLocator
        val totalProgression = startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))

        return Locator(
            href = href,
            type = "application/xhtml+xml",
            locations = Locator.Locations(
                fragments = listOf(fragment),
                progression = progression,
                totalProgression = totalProgression
            )
        )
    }

    fun getFragments(bookId: Long, locator: Locator): List<TextFragment> {
        val mediaOverlayStore = this.mediaOverlays[bookId] ?: return emptyList()
        val mediaOverlays = mediaOverlayStore.values
        val textFragments = mediaOverlays.flatMap { it.fragments() }
        return textFragments.filter { it.href == locator.href }
    }

    suspend fun getFragment(bookId: Long, clipUrl: String, position: Double): TextFragment? {
        val mediaOverlayStore = this.mediaOverlays[bookId] ?: return null

        var maybeFragment: TextFragment? = null
        for (mediaOverlays in mediaOverlayStore.values) {
            val found = mediaOverlays.fragment(clipUrl, position) ?: continue
            maybeFragment = found
            break
        }

        val fragment = maybeFragment ?: return null
        fragment.locator = buildFragmentLocator(bookId, fragment.href, fragment.fragment)

        return fragment
    }

    fun locateLink(bookId: Long, link: Link): Locator? {
        val publication = getPublication(bookId) ?: return null
        return publication.locatorFromLink(link)
    }

    suspend fun openPublication(bookId: Long, url: URL): Publication {
        val file = File(url.path)

        require(file.exists())
        val asset = FileAsset(file)

        val publication = streamer.open(asset, allowUserInteraction = false).getOrThrow()
        publications[bookId] = publication
        makeMediaOverlays(bookId, publication)
        return publication
    }

    private suspend fun makeMediaOverlays(bookId: Long, publication: Publication) {
        val mediaOverlayStore: MutableMap<String, STMediaOverlays> = mutableMapOf()

        val mediaOverlayLinks = publication.resources.filter { it.mediaType == MediaType.SMIL }

        for (link in mediaOverlayLinks) {
            val smilResource = publication.get(link)
            try {
                val smilXml = smilResource.readAsXml().getOrThrow()
                val mediaOverlays = SmilParser.parse(smilXml, link.href) ?: continue
                mediaOverlayStore[link.href] = mediaOverlays
            } finally {
                smilResource.close()
            }
        }

        this.mediaOverlays[bookId] = mediaOverlayStore
    }
}