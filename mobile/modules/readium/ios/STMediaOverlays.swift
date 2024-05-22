//
//  STMediaOverlays.swift
//  Readium
//
//  Created by Shane Friedman on 1/7/24.
//

import Foundation
import R2Shared

public struct TextFragment {
    public var href: String
    
    public var fragment: String
    
    public var locator: Locator?
}

public class STMediaOverlays : Loggable {
    public let mediaOverlays: MediaOverlays
    
    init() {
        mediaOverlays = MediaOverlays()
    }
    
    public func clip(forFragmentId id: String) throws -> Clip? {
        return try mediaOverlays.clip(forFragmentId: id)
    }
    
    public func clip(nextAfterFragmentId id: String) throws -> Clip? {
        return try mediaOverlays.clip(nextAfterFragmentId: id)
    }
    
    public func fragments() -> [TextFragment] {
        let nodes = collectNodes(inNodes: mediaOverlays.nodes)
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
        let node = findNode(clipUrl: clipUrl, position: position, inNodes: mediaOverlays.nodes)
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
    
    private func collectNodes(inNodes nodes: [MediaOverlayNode]) -> [MediaOverlayNode] {
        var collected: [MediaOverlayNode] = []
        for node in nodes {
            if node.role.contains("section") {
                collected += collectNodes(inNodes: node.children)
            } else {
                collected.append(node)
            }
        }
        return collected
    }
    
    private func findNode(clipUrl: URL, position: Double, inNodes nodes: [MediaOverlayNode]) -> MediaOverlayNode? {
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
