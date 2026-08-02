import Foundation

public enum NullableField<T: Sendable>: Sendable {
    case value(T)
    case null
}

extension KeyedEncodingContainer {
    mutating func encodeTriState<T: Encodable & Sendable>(
        _ field: NullableField<T>?,
        forKey key: Key,
    ) throws {
        guard let field else { return }
        switch field {
            case .value(let value):
                try encode(value, forKey: key)
            case .null:
                try encodeNil(forKey: key)
        }
    }
}
