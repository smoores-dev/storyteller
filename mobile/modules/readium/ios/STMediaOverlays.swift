//
//  STMediaOverlays.swift
//  Readium
//
//  Created by Shane Friedman on 1/7/24.
//

import Foundation
import ReadiumShared

public struct TextFragment {
    public var href: String
    
    public var fragment: String
    
    public var locator: Locator?
}

public struct OverlayPar: Sendable {
    public let relativeUrl: URL
    public let fragmentId: String
    public let textResource: String
    public let start: Double
    public let end: Double
    public let locator: Locator
    
    func toJson() -> [String:Any] {
        return [
            "relativeUrl": relativeUrl,
            "fragmentId": fragmentId,
            "textResource": textResource,
            "start": start,
            "end": end,
            "duration": end - start,
            "locator": locator.json
        ]
    }
    
    static func fromReadiumClip(clip: Clip, textResource: String, locator: Locator) -> OverlayPar {
        return OverlayPar(
            relativeUrl: clip.relativeUrl,
            fragmentId: clip.fragmentId,
            textResource: textResource,
            start: clip.start,
            end: clip.end,
            locator: locator
        )
    }
    
    static func fromJson(_ map: [String:Any]) throws -> OverlayPar {
        return OverlayPar(
            relativeUrl: RelativeURL(epubHREF: map["relativeUrl"] as! String)!.url,
            fragmentId: map["fragmentId"] as! String,
            textResource: map["textResource"] as! String,
            start: map["start"] as! Double,
            end: map["end"] as! Double,
            locator: try Locator(json: map["locator"] as! [String:Any])!
        )
    }
}

public class STMediaOverlays : Loggable {
    public var nodes: [STMediaOverlayNode]!
    public let link: Link
    
    init(link: Link) {
        self.link = link
        self.nodes = [STMediaOverlayNode]()
    }
    
    public func append(_ newNode: STMediaOverlayNode) {
        nodes.append(newNode)
    }
    
    public func clips() -> [OverlayPar] {
        return collectNodes(inNodes: nodes).compactMap {
            guard let clip = $0.clip, let textResource = $0.text, let locator = $0.locator else {
                return nil
            }

            return OverlayPar.fromReadiumClip(
                clip: clip,
                textResource: textResource,
                locator: locator
            )
        }
    }
    
    // Get the audio `Clip` associated to an audio Fragment id.
    /// The fragment id can be found in the HTML document in <p> & <span> tags,
    /// it refer to a element of one of the SMIL files, providing informations
    /// about the synchronized audio.
    /// This function returns the clip representing this element from SMIL.
    ///
    /// - Parameter id: The audio fragment id.
    /// - Returns: The `Clip`, representation of the associated SMIL element.
    /// - Throws: `MediaOverlayNodeError.audio`,
    ///           `MediaOverlayNodeError.timersParsing`.
    public func clip(forFragmentId id: String) throws -> OverlayPar? {
        let par: OverlayPar?

        do {
            let fragmentNode = try node(forFragmentId: id)
            
            guard let clip = fragmentNode.clip, let textResource = fragmentNode.text, let locator = fragmentNode.locator else {
                return nil
            }

            par = OverlayPar.fromReadiumClip(
                clip: clip,
                textResource: textResource,
                locator: locator
            )
        }
        return par
    }

    /// Get the audio `Clip` for the node right after the one designated by
    /// `id`.
    /// The fragment id can be found in the HTML document in <p> & <span> tags,
    /// it refer to a element of one of the SMIL files, providing informations
    /// about the synchronized audio.
    /// This function returns the `Clip representing the element following this
    /// element from SMIL.
    ///
    /// - Parameter id: The audio fragment id.
    /// - Returns: The `Clip` for the node element positioned right after the
    ///            one designated by `id`.
    /// - Throws: `MediaOverlayNodeError.audio`,
    ///           `MediaOverlayNodeError.timersParsing`.
    public func clip(nextAfterFragmentId id: String) throws -> OverlayPar? {
        let par: OverlayPar?

        do {
            let fragmentNextNode = try node(nextAfterFragmentId: id)
            guard let clip = fragmentNextNode.clip, let textResource = fragmentNextNode.text, let locator = fragmentNextNode.locator else {
                return nil
            }

            par = OverlayPar.fromReadiumClip(
                clip: clip,
                textResource: textResource,
                locator: locator
            )
        }
        return par
    }
    
    // Return the `MediaOverlayNode` found for the given 'fragment id'.
    ///
    /// - Parameter forFragment: The SMIL fragment identifier.
    /// - Returns: The node associated to the fragment.
    public func node(forFragmentId id: String?) throws -> STMediaOverlayNode {
        guard let node = _findNode(forFragment: id, inNodes: nodes) else {
            throw MediaOverlaysError.nodeNotFound(forFragmentId: id)
        }
        return node
    }

    /// Return the `MediaOverlayNode` right after the node found for the given
    /// 'fragment id'.
    ///
    /// - Parameter forFragment: The SMIL fragment identifier.
    /// - Returns: The node right after the node associated to the fragment.
    public func node(nextAfterFragmentId id: String?) throws -> STMediaOverlayNode {
        let ret = _findNextNode(forFragment: id, inNodes: nodes)

        guard let node = ret.found else {
            throw MediaOverlaysError.nodeNotFound(forFragmentId: id)
        }
        return node
    }

    // MARK: - Fileprivate Methods.

    /// [RECURISVE]
    /// Find the node (<par>) corresponding to "fragment" ?? nil.
    ///
    /// - Parameters:
    ///   - fragment: The current fragment name for which we are looking the
    ///               associated media overlay node.
    ///   - nodes: The set of MediaOverlayNodes where to search. Default to
    ///            self children.
    /// - Returns: The node we found ?? nil.
    private func _findNode(forFragment fragment: String?,
                           inNodes nodes: [STMediaOverlayNode]) -> STMediaOverlayNode?
    {
        // For each node of the current scope..
        for node in nodes {
            // If the node is a "section" (<seq> sequence element)..
            // TODO: ask if really useful?
            if node.role.contains("section") {
                // Try to find par nodes inside.
                if let found = _findNode(forFragment: fragment, inNodes: node.children) {
                    return found
                }
            }
            // If the node text refer to filename or that filename is nil,
            // return node.
            if fragment == nil || node.text?.contains(fragment!) ?? false {
                return node
            }
        }
        // If nothing found, return nil.
        return nil
    }

    /// [RECURISVE]
    /// Find the node (<par>) corresponding to the next one after the given
    /// "fragment" ?? nil.
    ///
    /// - Parameters:
    ///   - fragment: The fragment name corresponding to the node previous to
    ///               the one we want.
    ///   - nodes: The set of MediaOverlayNodes where to search. Default to
    ///            self children.
    /// - Returns: The node we found ?? nil.
    private func _findNextNode(forFragment fragment: String?,
                               inNodes nodes: [STMediaOverlayNode]) -> (found: STMediaOverlayNode?, prevFound: Bool)
    {
        var previousNodeFoundFlag = false

        // For each node of the current scope..
        for node in nodes {
            guard !previousNodeFoundFlag else {
                /// If the node is a section, we get the first non section child.
                if node.role.contains("section") {
                    if let validChild = getFirstNonSectionChild(of: node) {
                        return (validChild, false)
                    } else {
                        // Try next nodes.
                        continue
                    }
                }
                /// Else we just return it.
                return (node, false)
            }
            // If the node is a "section" (<seq> sequence element)..
            if node.role.contains("section") {
                let ret = _findNextNode(forFragment: fragment, inNodes: node.children)
                if let foundNode = ret.found {
                    return (foundNode, false)
                }
                previousNodeFoundFlag = ret.prevFound
            }
            // If the node text refer to filename or that filename is nil,
            // return node.
            if fragment == nil || node.text?.contains(fragment!) ?? false {
                previousNodeFoundFlag = true
            }
        }
        // If nothing found, return nil.
        return (nil, previousNodeFoundFlag)
    }
    
    // Returns the closest non section children node found.
    ///
    /// - Parameter node: The section node
    /// - Returns: The closest non section node or nil.
    private func getFirstNonSectionChild(of node: STMediaOverlayNode) -> STMediaOverlayNode? {
        for node in node.children {
            if node.role.contains("section") {
                if let found = getFirstNonSectionChild(of: node) {
                    return found
                }
            } else {
                return node
            }
        }
        return nil
    }
    
    public func fragments() -> [TextFragment] {
        let nodes = collectNodes(inNodes: nodes)
        return nodes.compactMap(\.text).compactMap { (text: String) -> TextFragment? in
            let components = text.components(separatedBy: "#")
            guard components.count == 2 else {
                log(.error, "Could not find hash in link \(text)")
                return nil
            }
            return TextFragment(href: String(components[0]), fragment: String(components[1]))
        }
    }
    
    public func fragment(clipUrl: URL, position: Double) -> TextFragment? {
        let node = findNode(clipUrl: clipUrl, position: position, inNodes: nodes)
        guard let text = node?.text else {
            return nil
        }
        let components = text.components(separatedBy: "#")
        guard components.count == 2 else {
            log(.error, "Could not find hash in link \(text)")
            return nil
        }
        return TextFragment(href: String(components[0]), fragment: String(components[1]))
    }
    
    private func collectNodes(inNodes nodes: [STMediaOverlayNode]) -> [STMediaOverlayNode] {
        var collected: [STMediaOverlayNode] = []
        for node in nodes {
            if node.role.contains("section") {
                collected += collectNodes(inNodes: node.children)
            } else {
                collected.append(node)
            }
        }
        return collected
    }
    
    private func findNode(clipUrl: URL, position: Double, inNodes nodes: [STMediaOverlayNode]) -> STMediaOverlayNode? {
        for node in nodes {
            // If the node is a "section" (<seq> sequence element)..
            // FIXME: ask if really usefull?
            if node.role.contains("section") {
                // Try to find par nodes inside.
                if let found = findNode(clipUrl: clipUrl, position: position, inNodes: node.children) {
                    return found
                }
            }
            
            guard let clip = node.clip, let start = clip.start, let end = clip.end else {
                continue
            }
            
            if clip.relativeUrl == clipUrl && start <= position && end > position {
                return node
            }
        }
        // If nothing found, return nil.
        return nil
    }
}
