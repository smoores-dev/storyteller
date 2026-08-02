import Foundation

public enum CreatorRole: String, Codable, Sendable, CaseIterable {
    case author = "aut"
    case narrator = "nrt"
    case translator = "trl"
}
