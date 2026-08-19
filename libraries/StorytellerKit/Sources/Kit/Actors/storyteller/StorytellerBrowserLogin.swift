import Foundation

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

public enum StorytellerBrowserLogin {
    public struct Result: Sendable {
        public let serverURL: String
        public let username: String
        public let sessionToken: String
    }

    public enum LoginError: Error, LocalizedError {
        case invalidServerURL
        case missingToken
        case exchangeFailed(String)
        case missingUsername
        case cancelled

        public var errorDescription: String? {
            switch self {
                case .invalidServerURL:
                    return "Invalid server URL"
                case .missingToken:
                    return "The server did not return a sign-in token"
                case .exchangeFailed(let message):
                    return message
                case .missingUsername:
                    return "Signed in, but the server did not return a username"
                case .cancelled:
                    return "Sign-in was cancelled"
            }
        }
    }

    public static let callbackScheme = "storyteller"

    public static func authorizationURL(serverURL: String) throws -> URL {
        try apiBaseURL(serverURL: serverURL).appendingPathComponent("token/app")
    }

    public static func completeLogin(serverURL: String, callbackURL: URL) async throws -> Result {
        let normalizedServerURL = try normalizedServerURL(serverURL)
        let apiBase = try apiBaseURL(serverURL: normalizedServerURL)

        guard
            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let shortLivedToken = components.queryItems?
                .first(where: { $0.name == "token" })?.value,
            !shortLivedToken.isEmpty
        else {
            throw LoginError.missingToken
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }

        let body = try JSONSerialization.data(withJSONObject: ["token": shortLivedToken])
        let sessionToken: AccessToken
        do {
            let response = try await httpPost(
                apiBase.appendingPathComponent("token/app").absoluteString,
                headers: [
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                ],
                body: body,
                session: session,
            )
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            sessionToken = try decoder.decode(AccessToken.self, from: response.data)
        } catch HTTPRequestError.unauthorized {
            throw LoginError.exchangeFailed("The sign-in token was rejected. Please try again.")
        } catch let error as URLError {
            throw LoginError.exchangeFailed(error.localizedDescription)
        } catch {
            throw LoginError.exchangeFailed("Could not complete sign-in with this server.")
        }

        let username = try await currentUsername(
            apiBase: apiBase,
            token: sessionToken.accessToken,
            session: session,
        )

        return Result(
            serverURL: normalizedServerURL,
            username: username,
            sessionToken: sessionToken.accessToken,
        )
    }

    private static func currentUsername(
        apiBase: URL,
        token: String,
        session: URLSession,
    ) async throws -> String {
        struct CurrentUser: Decodable {
            let username: String?
        }

        do {
            let response = try await httpGet(
                apiBase.appendingPathComponent("user").absoluteString,
                headers: [
                    "Authorization": "Bearer \(token)",
                    "Accept": "application/json",
                ],
                session: session,
            )
            guard
                let username = try JSONDecoder()
                    .decode(CurrentUser.self, from: response.data).username,
                !username.isEmpty
            else {
                throw LoginError.missingUsername
            }
            return username
        } catch let error as LoginError {
            throw error
        } catch let error as URLError {
            throw LoginError.exchangeFailed(error.localizedDescription)
        } catch {
            throw LoginError.exchangeFailed("Signed in, but could not read the user account.")
        }
    }

    private static func normalizedServerURL(_ serverURL: String) throws -> String {
        let trimmed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme != nil, url.host != nil else {
            throw LoginError.invalidServerURL
        }
        return trimmed
    }

    private static func apiBaseURL(serverURL: String) throws -> URL {
        guard let url = URL(string: try normalizedServerURL(serverURL)) else {
            throw LoginError.invalidServerURL
        }

        let trimmedPath = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if trimmedPath.hasSuffix("api/v2") {
            return url
        }
        if trimmedPath.hasSuffix("api") {
            return url.appendingPathComponent("v2")
        }
        return url.appendingPathComponent("api").appendingPathComponent("v2")
    }
}
