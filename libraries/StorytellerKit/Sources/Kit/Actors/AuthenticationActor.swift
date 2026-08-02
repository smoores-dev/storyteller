import Foundation

@globalActor
public actor AuthenticationActor {
    public static let shared = AuthenticationActor()

    private let serverURLKey = "serverURL"
    private let usernameKey = "username"
    private let passwordKey = "password"
    private let hardcoverTokenKey = "hardcoverToken"

    private init() {}

    private var keychain: any KeychainStoring {
        get throws {
            guard let keychain = StorytellerPlatform.keychain else {
                throw KeychainError.unsupportedPlatform
            }
            return keychain
        }
    }

    public func saveCredentials(
        url: String,
        username: String,
        password: String,
        sourceID: BookSourceID,
    ) async throws {
        try await deleteCredentials(sourceID: sourceID)

        try await saveString(url, for: accountKey(serverURLKey, sourceID: sourceID))
        try await saveString(username, for: accountKey(usernameKey, sourceID: sourceID))
        try await saveString(password, for: accountKey(passwordKey, sourceID: sourceID))
    }

    public func loadCredentials() async throws -> (url: String, username: String, password: String)?
    {
        guard let url = try await loadString(for: serverURLKey),
            let username = try await loadString(for: usernameKey),
            let password = try await loadString(for: passwordKey)
        else {
            return nil
        }

        return (url, username, password)
    }

    public func loadCredentials(sourceID: BookSourceID) async throws
        -> (url: String, username: String, password: String)?
    {
        guard let url = try await loadString(for: accountKey(serverURLKey, sourceID: sourceID)),
            let username = try await loadString(for: accountKey(usernameKey, sourceID: sourceID)),
            let password = try await loadString(for: accountKey(passwordKey, sourceID: sourceID))
        else {
            return nil
        }

        return (url, username, password)
    }

    public func deleteCredentials() async throws {
        for key in [serverURLKey, usernameKey, passwordKey] {
            try await keychain.removeItem(account: key)
        }
    }

    public func deleteCredentials(sourceID: BookSourceID) async throws {
        for key in [serverURLKey, usernameKey, passwordKey] {
            try await keychain.removeItem(account: accountKey(key, sourceID: sourceID))
        }
    }

    public func hasCredentials(sourceID: BookSourceID) async -> Bool {
        do {
            let creds = try await loadCredentials(sourceID: sourceID)
            return creds != nil
        } catch {
            return false
        }
    }

    public func saveHardcoverToken(_ token: String) async throws {
        try await saveString(token, for: hardcoverTokenKey)
    }

    public func loadHardcoverToken() async throws -> String? {
        try await loadString(for: hardcoverTokenKey)
    }

    public func deleteHardcoverToken() async throws {
        try await keychain.removeItem(account: hardcoverTokenKey)
    }

    private func saveString(_ value: String, for account: String) async throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.invalidData
        }

        try await keychain.setItem(data, account: account)
    }

    private func loadString(for account: String) async throws -> String? {
        guard
            let data = try await keychain.item(account: account)
        else {
            return nil
        }

        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.invalidData
        }

        return string
    }

    private func accountKey(_ key: String, sourceID: BookSourceID) -> String {
        return "bookSource.\(sourceID).\(key)"
    }

}

public enum KeychainError: Error, LocalizedError {
    #if canImport(Security)
    case unableToSave(status: OSStatus)
    case unableToLoad(status: OSStatus)
    case unableToDelete(status: OSStatus)
    #endif
    case invalidData
    case unsupportedPlatform

    public var errorDescription: String? {
        switch self {
            #if canImport(Security)
                case .unableToSave(let status):
                    return "Unable to save to keychain (status: \(status))"
                case .unableToLoad(let status):
                    return "Unable to load from keychain (status: \(status))"
                case .unableToDelete(let status):
                    return "Unable to delete from keychain (status: \(status))"
            #endif
            case .invalidData:
                return "Invalid data in keychain"
            case .unsupportedPlatform:
                return "Keychain is not available on this platform"
        }
    }
}
