import Foundation

/// Generic secure item store. Domain logic (which accounts exist and payload
/// encoding) stays in AuthenticationActor; the provider owns its platform
/// namespace, such as an Apple keychain service/access group.
public protocol KeychainStoring: Sendable {
    func setItem(_ data: Data, account: String) async throws
    func item(account: String) async throws -> Data?
    func removeItem(account: String) async throws
}
