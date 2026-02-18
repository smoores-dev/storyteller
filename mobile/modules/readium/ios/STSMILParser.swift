//
//  Copyright 2023 Readium Foundation. All rights reserved.
//  Use of this source code is governed by the BSD-style license
//  available in the top-level LICENSE file of the project.
//

import Foundation
import ReadiumShared
import ReadiumFuzi

/// The object containing the methods used to parse SMIL files.
final class STSMILParser {
    /// [RECURSIVE]
    /// Parse the <seq> elements at the current XML level. It will recursively
    /// parse they childrens <par> and <seq>
    ///
    /// - Parameters:
    ///   - element: The XML element which should contain <seq>.
    ///   - parent: The parent MediaOverlayNode of the "to be creatred" nodes.
    ///   - readingOrder:
    ///   - base: The base location of the file for path normalization.
    internal static func parseSequences(_ publication: Publication, in element: ReadiumFuzi.XMLElement, withParent parent: STMediaOverlayNode, mediaOverlays: STMediaOverlays, base: String) async {
        guard let baseHREF = RelativeURL(epubHREF: base) else {
            return
        }
        // TODO: 2 lines differ from the version used in the parseMediaOverlay for loop. Refactor?
        for sequence in element.xpath("smil:seq") {
            guard let href = sequence.attr("textref") else {
                continue
            }

            let newNode = STMediaOverlayNode()
            newNode.role.append("section")
            guard let textref = RelativeURL(epubHREF: href).flatMap(baseHREF.resolve)?.string else {
                continue
            }
            
            newNode.text = textref
            
            guard let contentLink = publication.linkWithHREF(RelativeURL(string: textref)!),
                  let resource = publication.get(contentLink),
                  let htmlContent = try? await resource.readAsString().get()
            else {
                return
            }

            await parseParallels(publication, in: sequence, withParent: newNode, base: base, htmlContent: htmlContent)
            await parseSequences(publication, in: sequence, withParent: newNode, mediaOverlays: mediaOverlays, base: base)

            let baseHrefParent = parent.text?.components(separatedBy: "#")[0]

            guard let baseHref = newNode.text?.components(separatedBy: "#")[0],
                  baseHref != baseHrefParent
            else {
                parent.children.append(newNode)
                continue
            }
            
            mediaOverlays.append(newNode)
        }
    }
    
    private static func locateFromPositions(_ publication: Publication, text: AnyURL) async throws -> Locator? {
        guard let readingOrderIndex = publication.readingOrder.firstIndexWithHREF(text.removingFragment()) else {
            return nil
        }

        let positions = try await publication.positionsByReadingOrder().get()

        guard let locator = positions[readingOrderIndex].first else {
            return nil
        }

        return locator
    }
    
    private static func createLocator(_ publication: Publication, htmlContent: String, htmlContentStart: String.Index, text: RelativeURL) async throws -> (Locator?, String.Index) {
        if let startOfFragment = htmlContent[htmlContentStart...].firstRange(of: text.fragment!)?.lowerBound {
            let fragmentPosition = htmlContent.distance(from: htmlContent.startIndex, to: startOfFragment)
            let progression = Double(fragmentPosition) / Double(htmlContent.distance(from: htmlContent.startIndex, to: htmlContent.endIndex))
            guard let startOfChapterProgression = try await locateFromPositions(publication, text: text.anyURL)?.locations.totalProgression else {
                return (nil, htmlContentStart)
            }
            guard let chapterIndex = publication.readingOrder.firstIndexWithHREF(text.removingFragment()) else {
                return (nil, htmlContentStart)
            }
            let nextChapterIndex = publication.readingOrder.index(after: chapterIndex)
            let nextChapterLink = publication.readingOrder[nextChapterIndex]
            let startOfNextChapterProgression = try await locateFromPositions(publication, text: nextChapterLink.url())?.locations.totalProgression ?? 1
            let totalProgression = startOfChapterProgression + (progression * (startOfNextChapterProgression - startOfChapterProgression))
            return (
                Locator(
                    href: text.removingFragment(),
                    mediaType: .xhtml,
                    locations: Locator.Locations(
                        fragments: [text.fragment!],
                        progression: progression,
                        totalProgression: totalProgression
                    )
                ),
                htmlContent.index(startOfFragment, offsetBy: (text.fragment?.count ?? 0) + 5)
            )
        }

        return (nil, htmlContentStart)
    }

    /// Parse the <par> elements at the current XML element level.
    ///
    /// - Parameters:
    ///   - element: The XML element which should contain <par>.
    ///   - parent: The parent MediaOverlayNode of the "to be creatred" nodes.
    internal static func parseParallels(_ publication: Publication, in element: ReadiumFuzi.XMLElement, withParent parent: STMediaOverlayNode, base: String, htmlContent: String?) async {
        guard let baseHREF = RelativeURL(epubHREF: base) else {
            return
        }
        
        var htmlContentStart = htmlContent.flatMap(\.startIndex)
        
        // For each <par> in the current scope.
        for parameterElement in element.xpath("smil:par") {
            guard let href = parameterElement.firstChild(xpath: "smil:text")?.attr("src"),
                  let audioElement = parameterElement.firstChild(xpath: "smil:audio"),
                  let audioClip = parse(base: baseHREF, audioElement: audioElement)
            else {
                continue
            }

            guard let nodeText = RelativeURL(epubHREF: href).flatMap(baseHREF.resolve)?.string else {
                continue
            }
            
            let nodeTextUrl = RelativeURL(string: nodeText)!
            
            let result: (Locator?, String.Index?) = await htmlContent.asyncFlatMap { htmlContent in
                await htmlContentStart.asyncFlatMap { htmlContentStart in
                    try? await createLocator(publication, htmlContent: htmlContent, htmlContentStart: htmlContentStart, text: RelativeURL(string: nodeText)!)
                }
            } ?? (
                Locator(
                    href: nodeTextUrl.removingFragment(),
                    mediaType: .xhtml
                ),
                htmlContentStart
            )
            
            htmlContentStart = result.1

            let newNode = STMediaOverlayNode(nodeText, clip: audioClip, locator: result.0)
            
            parent.children.append(newNode)
        }
    }

    /// Converts a smile time string into seconds String.
    ///
    /// - Parameter time: The smile time String.
    /// - Returns: The converted value in Seconds as String.
    internal static func smilTimeToSeconds(_ time: String) -> String {
        let timeFormat: SmilTimeFormat

        if time.contains("h") {
            timeFormat = .hour
        } else if time.contains("s") {
            timeFormat = .second
        } else if time.contains("ms") {
            timeFormat = .milisecond
        } else {
            let timeArity = time.components(separatedBy: ":").count

            guard let format = SmilTimeFormat(rawValue: timeArity) else {
                return ""
            }
            timeFormat = format
        }
        return timeFormat.convertToseconds(smilTime: time)
    }

    /// Parse the <audio> XML element, children of <par> elements.
    ///
    /// - Parameter audioElement: The audio XML element.
    /// - Returns: The formated string representing the data.
    fileprivate static func parse(base: RelativeURL, audioElement: ReadiumFuzi.XMLElement) -> Clip? {
        guard let audioSrc = audioElement.attr("src") else {
            return nil
        }

        // SML3.0/1.0: clipBegin/clip-begin and clipEnd/clip-end
        let clipBegin = audioElement.attr("clipBegin") ?? "0.0"
        let clipEnd = audioElement.attr("clipEnd") ?? "-1.0"

        let parsedBegin = STSMILParser.smilTimeToSeconds(clipBegin)
        let parsedEnd = STSMILParser.smilTimeToSeconds(clipEnd)

        let timeBegin = Double(parsedBegin) ?? 0.0
        let timeEnd = Double(parsedEnd) ?? -1.0

        guard let relativeURL = RelativeURL(epubHREF: audioSrc).flatMap(base.resolve) else {
            return nil
        }

        var newClip = Clip()
        newClip.relativeUrl = relativeURL.url

        newClip.start = timeBegin
        newClip.end = timeEnd

        // It's not recommended getting the duration of audio here.
        // It's still inside the *.epub file, actually a zip file.
        // As the result, it cannot utilize AV APIs from Apple. The soultion
        // And the fetcher (minizip) only provide data access, that might be IO problem.

        newClip.duration = timeEnd > 0 ? (timeEnd - timeBegin) : -1

        return newClip
    }
}

/// Describes the differents time string format of the smile tags.
///
/// - splitMonadic: Handle `SS` format.
/// - splitDyadic//MM/SS: Handles `MM/SS` format.
/// - splitTriadic//HH:MM:SS: Handles `HH:MM:SS` format.
/// - milisecond: Handles `MM"ms"` format.
/// - second: Handles `SS"s" || SS.MM"s"` format
/// - hour: Handles `HH"h" || HH.MM"h"` format.
internal enum SmilTimeFormat: Int {
    case splitMonadic = 1
    case splitDyadic
    case splitTriadic
    case milisecond
    case second
    case hour
}

internal extension SmilTimeFormat {
    /// Return the seconds double value from a possible SS.MS format.
    ///
    /// - Parameter seconds: The seconds String.
    /// - Returns: The translated Double value.
    private func parseSeconds(_ time: String) -> Double {
        let secMilsec = time.components(separatedBy: ".")
        var seconds = 0.0

        if secMilsec.count == 2 {
            seconds = Double(secMilsec[0]) ?? 0.0
            seconds += (Double(secMilsec[1]) ?? 0.0) / 1000.0
        } else {
            seconds = Double(time) ?? 0.0
        }
        return seconds
    }

    /// Will confort the `smileTime` to the equivalent in seconds given it's
    /// type.
    ///
    /// - Parameter time: The `smilTime` `String`.
    /// - Returns: The converted value in seconds.
    func convertToseconds(smilTime time: String) -> String {
        var seconds = 0.0

        switch self {
        case .milisecond:
            let ms = Double(time.replacingOccurrences(of: "ms", with: ""))
            seconds = (ms ?? 0) / 1000.0
        case .second:
            seconds = Double(time.replacingOccurrences(of: "s", with: "")) ?? 0
        case .hour:
            let hourMin = time.replacingOccurrences(of: "h", with: "").components(separatedBy: ".")
            let hoursToSeconds = (Double(hourMin[0]) ?? 0) * 3600.0
            let minutesToSeconds = (Double(hourMin[1]) ?? 0) * 0.6 * 60.0

            seconds = hoursToSeconds + minutesToSeconds
        case .splitMonadic:
            return time
        case .splitDyadic:
            let minSec = time.components(separatedBy: ":")

            // Min
            seconds += (Double(minSec[0]) ?? 0.0) * 60
            // Sec
            seconds += parseSeconds(minSec[1])
        case .splitTriadic:
            let hourMinSec = time.components(separatedBy: ":")

            // Hour
            seconds += (Double(hourMinSec[0]) ?? 0.0) * 3600.0
            // Min
            seconds += (Double(hourMinSec[1]) ?? 0.0) * 60
            // Sec
            seconds += parseSeconds(hourMinSec[2])
        }
        return String(seconds)
    }
}
