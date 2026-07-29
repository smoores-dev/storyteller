import Foundation

/// The interface between the common core reader stack and a platform's JS
/// engine. Implementations normalize their engine's result shape to a
/// JSON-literal string (WKWebView returns bridged objects, Chromium returns
/// double-encoded JSON; both adapters produce the same String here).
@StorytellerUIActor
public protocol JSEvaluating: AnyObject {
    @discardableResult
    func evaluate(_ script: String) async throws -> String?
}
