package expo.modules.readium

import org.readium.r2.shared.Clip
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.MediaOverlayNode
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.fromEpubHref
import java.io.Serializable
import java.net.URI

data class TextFragment(val href: Url, val fragment: String) : Serializable {
    var locator: Locator? = null
}

@OptIn(InternalReadiumApi::class)
class STMediaOverlays(val link: Link, private val nodes: List<MediaOverlayNode> = listOf()) {
    fun clip(ref: String): Clip? {
        val fragmentNode = findNode(ref, this.nodes)
        return fragmentNode?.clip
    }

    fun clips(): List<Clip> {
        val nodes = collectNodes(this.nodes)
        return nodes.map { it.clip }
    }

    fun fragments(): List<TextFragment> {
        val nodes = collectNodes(this.nodes)
        return nodes.map { it.text }.mapNotNull { text: Url ->
            val path = text.path ?: return@mapNotNull null
            val href = Url.fromEpubHref(path) ?: return@mapNotNull null
            val fragment = text.fragment ?: return@mapNotNull null
            return@mapNotNull TextFragment(href = href, fragment = fragment)
        }
    }

    fun fragment(clipUrl: String, position: Double): TextFragment? {
        val node = findNode(clipUrl, position, this.nodes)
        val text = node?.text ?: return null
        val path = text.path ?: return null
        val href = Url.fromEpubHref(path) ?: return null
        val fragment = text.fragment ?: return null
        return TextFragment(href = href, fragment = fragment)
    }

    private fun collectNodes(nodes: List<MediaOverlayNode>): List<MediaOverlayNode> {
        val collected: MutableList<MediaOverlayNode> = mutableListOf()
        for (node in nodes) {
            if (node.role.contains("section"))
                collected.addAll(collectNodes(node.children))
            else
                collected.add(node)
        }
        return collected
    }

    private fun findNode(ref: String?, inNodes: List<MediaOverlayNode>): MediaOverlayNode? {
        for (node in inNodes) {
            if (node.role.contains("section"))
                return findNode(ref, node.children)
            else if (ref == null || node.text.fragment == ref)
                return node
        }
        return null
    }

    private fun findNode(
        clipUrl: String?,
        position: Double,
        nodes: List<MediaOverlayNode>
    ): MediaOverlayNode? {
        for (node in nodes) {
            if (node.role.contains("section")) {
                val found = findNode(clipUrl, position, node.children)
                if (found != null) {
                    return found
                }
            }

            val clip = node.clip
            val start = clip.start ?: continue
            val end = clip.end ?: continue

            if (URI(
                    null,
                    clip.audioResource,
                    null
                ).toASCIIString() == clipUrl && start <= position && end >= position
            ) {
                return node
            }
        }

        return null
    }
}