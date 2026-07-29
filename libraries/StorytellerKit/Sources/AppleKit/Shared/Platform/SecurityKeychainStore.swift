import Foundation

#if canImport(Security)
import Security
#endif

public struct SecurityKeychainStore: KeychainStoring {
    private static let serviceInfoKey = "KEYCHAIN_SERVICE"
    private static let accessGroupInfoKey = "KEYCHAIN_ACCESS_GROUP"

    private let configuredService: String?
    private let configuredAccessGroup: String?

    public init() {
        configuredService = nil
        configuredAccessGroup = nil
    }

    public init(service: String, accessGroup: String? = nil) {
        configuredService = service
        configuredAccessGroup = accessGroup
    }

    public func setItem(
        _ data: Data,
        account: String,
    ) throws {
        #if canImport(Security)
        var query = Self.baseQuery(service: service, account: account, accessGroup: accessGroup)
        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        // AfterFirstUnlock so background launches (WCSession delivery, background
        // URLSession events) can authenticate while the phone is locked
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unableToSave(status: status)
        }
        #else
        throw KeychainError.unsupportedPlatform
        #endif
    }

    public func item(account: String) throws -> Data? {
        #if canImport(Security)
        var query = Self.baseQuery(service: service, account: account, accessGroup: accessGroup)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw KeychainError.unableToLoad(status: status)
        }

        guard let data = result as? Data else {
            throw KeychainError.invalidData
        }

        return data
        #else
        throw KeychainError.unsupportedPlatform
        #endif
    }

    public func removeItem(account: String) throws {
        #if canImport(Security)
        let query = Self.baseQuery(service: service, account: account, accessGroup: accessGroup)

        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unableToDelete(status: status)
        }
        #else
        throw KeychainError.unsupportedPlatform
        #endif
    }

    private static func infoValue(for key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func requiredInfoValue(for key: String) -> String {
        guard let value = infoValue(for: key) else {
            preconditionFailure("Missing required Info.plist value for \(key)")
        }
        return value
    }

    private var service: String {
        configuredService ?? Self.requiredInfoValue(for: Self.serviceInfoKey)
    }

    private var accessGroup: String? {
        if configuredService != nil {
            return configuredAccessGroup
        }
        return Self.requiredInfoValue(for: Self.accessGroupInfoKey)
    }

    #if canImport(Security)
    private static func baseQuery(
        service: String,
        account: String,
        accessGroup: String?,
    ) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }
    #endif
}
