import Foundation

public struct JSONContentCodec<Payload: Codable & Sendable>: Sendable {
    public let contentType: ContentTypeID
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(contentType: ContentTypeID, encoder: JSONEncoder = .kharisma, decoder: JSONDecoder = .kharisma) {
        self.contentType = contentType
        self.encoder = encoder
        self.decoder = decoder
    }

    public func encode(_ payload: Payload) throws -> Data {
        try encoder.encode(payload)
    }

    public func decode(_ data: Data) throws -> Payload {
        try decoder.decode(Payload.self, from: data)
    }
}

public extension JSONEncoder {
    static var kharisma: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

public extension JSONDecoder {
    static var kharisma: JSONDecoder {
        JSONDecoder()
    }
}

