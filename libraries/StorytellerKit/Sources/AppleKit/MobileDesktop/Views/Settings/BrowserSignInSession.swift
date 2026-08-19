#if os(iOS) || os(macOS)
import AuthenticationServices
import Foundation
import StorytellerKit

#if os(macOS)
import AppKit
#endif

#if os(iOS)
import UIKit
#endif

@MainActor
enum BrowserSignInSession {
    static func signIn(serverURL: String) async throws -> StorytellerBrowserLogin.Result {
        let authorizationURL = try StorytellerBrowserLogin.authorizationURL(serverURL: serverURL)
        let callbackURL = try await presentSession(url: authorizationURL)
        return try await StorytellerBrowserLogin.completeLogin(
            serverURL: serverURL,
            callbackURL: callbackURL,
        )
    }

    private static var anchorProvider: PresentationAnchorProvider?
    private static var activeSession: ASWebAuthenticationSession?

    private static func presentSession(url: URL) async throws -> URL {
        let anchorProvider = PresentationAnchorProvider()
        Self.anchorProvider = anchorProvider
        defer {
            Self.anchorProvider = nil
            Self.activeSession = nil
        }

        return try await withCheckedThrowingContinuation { continuation in
            let completion: @Sendable (URL?, Error?) -> Void = { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                    return
                }
                if let error = error as? ASWebAuthenticationSessionError,
                    error.code == .canceledLogin
                {
                    continuation.resume(throwing: StorytellerBrowserLogin.LoginError.cancelled)
                    return
                }
                continuation.resume(
                    throwing: error
                        ?? StorytellerBrowserLogin.LoginError.exchangeFailed("Sign-in failed")
                )
            }
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: StorytellerBrowserLogin.callbackScheme,
                completionHandler: completion,
            )
            session.presentationContextProvider = anchorProvider
            session.prefersEphemeralWebBrowserSession = false
            Self.activeSession = session

            guard session.start() else {
                continuation.resume(
                    throwing: StorytellerBrowserLogin.LoginError.exchangeFailed(
                        "Could not open a browser for sign-in"
                    )
                )
                return
            }
        }
    }

    @MainActor
    private final class PresentationAnchorProvider: NSObject,
        ASWebAuthenticationPresentationContextProviding
    {
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            #if os(macOS)
            return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first
                ?? ASPresentationAnchor()
            #else
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            return scene?.keyWindow ?? scene?.windows.first ?? ASPresentationAnchor()
            #endif
        }
    }
}
#endif
