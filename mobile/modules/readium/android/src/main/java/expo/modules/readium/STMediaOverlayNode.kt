package expo.modules.readium

/*
 * Developers: Aferdita Muriqi, Clément Baumann
 *
 * Copyright (c) 2018. Readium Foundation. All rights reserved.
 * Use of this source code is governed by a BSD-style license which is detailed in the
 * LICENSE file present in the project repository where this source code is maintained.
 */

import org.readium.r2.shared.publication.Locator
import java.io.Serializable
import org.readium.r2.shared.util.Url

data class Clip(
    val audioResource: String,
    val fragmentId: String,
    val start: Double,
    val end: Double,
)

class MediaOverlayNode(
    val text: Url, // an URI possibly finishing by a fragment (textFile#id)
    val audio: Url?, // an URI possibly finishing by a simple timer (audioFile#t=start,end)
    val children: List<MediaOverlayNode> = listOf(),
    val role: List<String> = listOf(),
    val locator: Locator? = null
) : Serializable {

    val audioFile: String?
        get() = audio?.removeFragment()?.path!!
    val audioTime: String?
        get() = audio?.fragment
    val textFile: String
        get() = text.removeFragment().path!!
    val fragmentId: String?
        get() = text.fragment
    val clip: Clip?
        get() {
            val audio = audio ?: throw Exception("audio")
            val audioFile = audio.removeFragment().path ?: throw Exception("audioFile")
            val times = audio.fragment ?: ""
            val (start, end) = parseTimer(times)
            return Clip(audioFile, fragmentId ?: return null, start, end)
        }

    private fun parseTimer(times: String): Pair<Double, Double> {
        //  Remove "t=" prefix
        val netTimes = times.removeRange(0, 2)
        val start = netTimes.split(',').first()
        val end = netTimes.split(',').last()
        val startTimer = start.toDouble()
        val endTimer = end.toDouble()
        return Pair(startTimer, endTimer)
    }
}
