import Foundation
import StorytellerKit

/// Token payload matching the client's `AccessToken` decode (snake_case keys).
struct TokenResponse: Encodable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int64?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
    }
}

/// Permission set mirroring Storyteller's `UserPermissionSet`. A single-user content server
/// grants read/list/download but withholds destructive and admin capabilities.
struct UserPermissions: Encodable {
    var bookCreate = false
    var bookDelete = false
    var bookDownload = true
    var bookList = true
    var bookProcess = false
    var bookRead = true
    var bookUpdate = false
    var collectionCreate = false
    var inviteDelete = false
    var inviteList = false
    var settingsUpdate = false
    var userCreate = false
    var userDelete = false
    var userList = false
    var userRead = false
    var userUpdate = false
}

struct UserResponse: Encodable {
    let id: String
    let name: String
    let username: String
    let email: String?
    let permissions: UserPermissions
}

/// Position body posted by clients: `{ locator, timestamp }`.
struct PositionUpdate: Decodable {
    let locator: BookLocator
    let timestamp: Double
}
