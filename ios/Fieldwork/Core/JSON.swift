import Foundation

// A loosely typed JSON value for the parts of the API that are open-ended
// (visual specs, partial snapshots while a reply streams, stored records).
enum JSON: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    subscript(key: String) -> JSON? {
        if case .object(let o) = self { return o[key] }
        return nil
    }
    subscript(index: Int) -> JSON? {
        if case .array(let a) = self, a.indices.contains(index) { return a[index] }
        return nil
    }
    var string: String? { if case .string(let v) = self { v } else { nil } }
    var number: Double? { if case .number(let v) = self { v } else { nil } }
    var int: Int? { number.map { Int($0) } }
    var bool: Bool? { if case .bool(let v) = self { v } else { nil } }
    var array: [JSON]? { if case .array(let v) = self { v } else { nil } }
    var object: [String: JSON]? { if case .object(let v) = self { v } else { nil } }
    var isNull: Bool { if case .null = self { true } else { false } }

    // Re-decodes this value as a typed model.
    func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder.api.decode(T.self, from: JSONEncoder.api.encode(self))
    }
    static func from<T: Encodable>(_ value: T) throws -> JSON {
        try JSONDecoder.api.decode(JSON.self, from: JSONEncoder.api.encode(value))
    }
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()
}

extension JSONEncoder {
    static let api: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.withoutEscapingSlashes]
        return e
    }()
}

extension KeyedDecodingContainer {
    // Missing, null or mistyped optional fields decode as nil rather than
    // failing the whole response; the server adds fields over time.
    func lenient<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }
}
