/*
 * Copyright 2022 Readium Foundation. All rights reserved.
 * Use of this source code is governed by the BSD-style license
 * available in the top-level LICENSE file of the project.
 */

@file:OptIn(InternalReadiumApi::class)

package expo.modules.readium

import org.readium.r2.shared.DelicateReadiumApi
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.indexOfFirstWithHref
import org.readium.r2.shared.publication.services.positionsByReadingOrder
import org.readium.r2.shared.util.Try
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.data.decodeString
import org.readium.r2.shared.util.data.readDecodeOrNull
import org.readium.r2.shared.util.fromEpubHref
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.shared.util.xml.ElementNode

internal object SmilParser {
    /* According to https://www.w3.org/publishing/epub3/epub-mediaoverlays.html#sec-overlays-content-conf
       a Media Overlay Document MAY refer to more than one EPUB Content Document
       This might be possible only using Canonical Fragment Identifiers
       since the unique body and each seq element MUST reference
       one EPUB Content Document by means of its attribute epub:textref
     */

    suspend fun parse(
        publication: Publication,
        document: ElementNode,
        link: Link
    ): STMediaOverlays? {
        val body = document.getFirst("body", Namespaces.SMIL) ?: return null
        return parseSeq(publication, body, link.url())?.let { STMediaOverlays(link, it) }
    }

    @OptIn(DelicateReadiumApi::class)
    private suspend fun parseSeq(
        publication: Publication,
        node: ElementNode,
        filePath: Url
    ): List<MediaOverlayNode>? {
        val textref = node.getAttrNs("textref", Namespaces.OPS)
            ?.let { Url.fromEpubHref(it) }

        val defaultLocator = textref?.let {
            Locator(
                href = it,
                mediaType = MediaType.XHTML
            )
        }

        val link = textref?.let {
            publication.linkWithHref(filePath.resolve(it))
        }

        val resource = link?.let {
            publication.get(it)
        }

        val htmlContent = resource?.let {
            it.readDecodeOrNull { Try.success(it.decodeString()) }?.getOrNull()
        }

        var htmlContentStart = 0

        val children: MutableList<MediaOverlayNode> = mutableListOf()
        for (child in node.getAll()) {
            if (child.name == "par" && child.namespace == Namespaces.SMIL) {
                if (htmlContent == null) return listOf()
                if (defaultLocator == null) return listOf()

                val pair = parsePar(
                    publication,
                    htmlContentStart,
                    htmlContent,
                    defaultLocator,
                    child,
                    filePath
                )
                pair.first?.let {
                    children.add(it)
                }
                htmlContentStart = pair.second
            } else if (child.name == "seq" && child.namespace == Namespaces.SMIL) {
                parseSeq(publication, child, filePath)?.let { children.addAll(it) }
            }
        }

        /* No wrapping media overlay can be created unless:
       - all child media overlays reference the same audio file
       - the seq element has an textref attribute (this is mandatory according to the EPUB spec)
         */
        val audioFiles = children.mapNotNull(MediaOverlayNode::audioFile)
        return if (textref != null && audioFiles.distinct().size == 1) { // hierarchy
            val normalizedTextref = filePath.resolve(textref)
            listOf(mediaOverlayFromChildren(normalizedTextref, children))
        } else {
            children
        }
    }

    private suspend fun createLocator(
        publication: Publication,
        htmlContentStart: Int,
        htmlContent: String,
        defaultLocator: Locator,
        text: Url,
    ): Pair<Locator, Int> {
        val fragmentRegex = Regex("id=\"${text.fragment}\"")
        val startOfFragment =
            fragmentRegex.find(htmlContent, htmlContentStart)?.range?.start ?: return Pair(
                defaultLocator,
                htmlContentStart
            )
        val progression = startOfFragment.toDouble() / htmlContent.length.toDouble()
        val readingOrderIndex = publication.readingOrder.indexOfFirstWithHref(text.removeFragment())
            ?: throw Exception("Could not find a locator for href ${text.removeFragment()} in reading order")

        val startOfChapterProgression =
            publication.positionsByReadingOrder()[readingOrderIndex].first().locations.totalProgression
                ?: return Pair(defaultLocator, htmlContentStart)

        val chapterIndex = publication.readingOrder.indexOfFirstWithHref(text.removeFragment())
            ?: return Pair(defaultLocator, htmlContentStart)
        val nextChapterIndex = chapterIndex + 1
        val startOfNextChapterProgression = nextChapterIndex.let {
            if (it == publication.readingOrder.size) {
                return@let 1.0
            } else {
                val nextChapterLink = publication.readingOrder[nextChapterIndex]
                val readingOrderIndex =
                    publication.readingOrder.indexOfFirstWithHref(nextChapterLink.url())
                        ?: throw Exception("Could not find a locator for href ${nextChapterLink.url()} in reading order")

                return@let publication.positionsByReadingOrder()[readingOrderIndex].first().locations.totalProgression
            }
        } ?: return Pair(defaultLocator, htmlContentStart)
        val totalProgression =
            startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))

        return Pair(
            Locator(
                href = text.removeFragment(),
                mediaType = MediaType.XHTML,
                locations = Locator.Locations(
                    fragments = listOf(text.fragment!!),
                    progression = progression,
                    totalProgression = totalProgression
                )
            ), startOfFragment + (text.fragment?.length ?: 0) + 5
        )
    }

    // Url.fromEpubHref encodes # as %23 when falling back to path-based
    // encoding for hrefs with spaces. split the fragment out first so it
    // survives the encoding, then resolve against a base url.
    private fun resolveEpubHref(href: String, base: Url): Url? {
        val hashIndex = href.indexOf('#')

        if (hashIndex < 0) {
            val url = Url.fromEpubHref(href) ?: return null
            return base.resolve(url)
        }

        val pathPart = href.substring(0, hashIndex)
        val fragment = href.substring(hashIndex + 1)
        val pathUrl = Url.fromEpubHref(pathPart) ?: return null
        val resolved = base.resolve(pathUrl)

        return Url("$resolved#$fragment")
    }

    private suspend fun parsePar(
        publication: Publication,
        htmlContentStart: Int,
        htmlContent: String,
        defaultLocator: Locator,
        node: ElementNode,
        filePath: Url
    ): Pair<MediaOverlayNode?, Int> {
        val textSrc = node.getFirst("text", Namespaces.SMIL)?.getAttr("src")
            ?: return Pair(null, 0)

        val resolvedText = resolveEpubHref(textSrc, filePath)
            ?: return Pair(null, 0)

        val resolvedAudio = node.getFirst("audio", Namespaces.SMIL)
            ?.let { audioNode ->
                val src = audioNode.getAttr("src") ?: return@let null
                val begin = audioNode.getAttr("clipBegin")?.let { ClockValueParser.parse(it) } ?: ""
                val end = audioNode.getAttr("clipEnd")?.let { ClockValueParser.parse(it) } ?: ""
                resolveEpubHref("$src#t=$begin,$end", filePath)
            }

        val pair = createLocator(
            publication,
            htmlContentStart,
            htmlContent,
            defaultLocator,
            resolvedText
        )

        return Pair(
            MediaOverlayNode(
                resolvedText,
                resolvedAudio,
                locator = pair.first
            ), pair.second
        )
    }

    private fun mediaOverlayFromChildren(
        text: Url,
        children: List<MediaOverlayNode>
    ): MediaOverlayNode {
        require(children.isNotEmpty() && children.mapNotNull { it.audioFile }.distinct().size <= 1)
        val audioChildren = children.mapNotNull { if (it.audioFile != null) it else null }
        val file = audioChildren.first().audioFile
        val start = audioChildren.first().clip!!.start
        val end = audioChildren.last().clip!!.end
        val audio = Url.fromEpubHref("$file#t=$start,$end")
        return MediaOverlayNode(text, audio, children, listOf("section"))
    }
}
