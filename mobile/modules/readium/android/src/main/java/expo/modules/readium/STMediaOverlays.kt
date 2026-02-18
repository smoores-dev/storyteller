package expo.modules.readium

import org.json.JSONObject
import org.readium.r2.shared.InternalReadiumApi
import org.readium.r2.shared.extensions.toMap
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.fromEpubHref
import java.io.Serializable
import java.net.URI

data class TextFragment(val href: Url, val fragment: String) : Serializable {
    var locator: Locator? = null
}

data class OverlayPar(
    val audioResource: String,
    val fragmentId: String,
    val textResource: String,
    val start: Double,
    val end: Double,
    val locator: Locator
) {
    @OptIn(InternalReadiumApi::class)
    fun toJson(): Map<String, Any> {
        return mapOf(
            "relativeUrl" to this.audioResource,
            "fragmentId" to this.fragmentId,
            "textResource" to this.textResource,
            "start" to this.start,
            "end" to this.end,
            "duration" to this.end - this.start,
            "locator" to this.locator.toJSON().toMap()
        )
    }

    companion object {
        @OptIn(InternalReadiumApi::class)
        fun fromReadiumClip(clip: Clip, textResource: String, locator: Locator): OverlayPar {
            return OverlayPar(
                audioResource = clip.audioResource,
                fragmentId = clip.fragmentId,
                start = clip.start,
                end = clip.end,
                textResource = textResource,
                locator = locator
            )
        }

        fun fromJson(map: Map<String, Any>): OverlayPar {
            return OverlayPar(
                map["relativeUrl"] as String,
                map["fragmentId"] as String,
                map["textResource"] as String,
                map["start"] as Double,
                map["end"] as Double,
                Locator.fromJSON(JSONObject(map["locator"] as Map<String, Any>))!!
            )
        }
    }
}

@OptIn(InternalReadiumApi::class)
class STMediaOverlays(val link: Link, private val nodes: List<MediaOverlayNode> = listOf()) {
    fun clip(ref: String): OverlayPar? {
        val fragmentNode = findNode(ref, this.nodes) ?: return null
        val textResource = fragmentNode.text.path ?: return null
        val locator = fragmentNode.locator ?: return null
        return OverlayPar.fromReadiumClip(fragmentNode.clip ?: return null, textResource, locator)
    }

    fun clips(): List<OverlayPar> {
        val nodes = collectNodes(this.nodes)
        return nodes.mapNotNull {
            val textResource = it.text.path ?: return@mapNotNull null
            val locator = it.locator ?: return@mapNotNull null
            return@mapNotNull OverlayPar.fromReadiumClip(
                it.clip ?: return@mapNotNull null,
                textResource,
                locator
            )
        }
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

            val clip = node.clip ?: continue
            val start = clip.start
            val end = clip.end

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