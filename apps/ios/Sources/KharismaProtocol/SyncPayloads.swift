import Foundation

public struct JoinRequestPayload: Codable, Equatable, Sendable {
    public let groupId: String
    public let walletAddress: String
    public let name: String?
    public init(groupId: String, walletAddress: String, name: String? = nil) {
        self.groupId = groupId
        self.walletAddress = walletAddress
        self.name = name
    }
}

public enum JoinResponsePayload: Codable, Equatable, Sendable {
    case ok(groupId: String, name: String, conversationId: String)
    case error(groupId: String, error: KharismaProtocolError)

    private enum CodingKeys: String, CodingKey { case status, groupId, name, conversationId, error }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let groupId = try container.decode(String.self, forKey: .groupId)
        switch try container.decode(String.self, forKey: .status) {
        case "ok":
            self = .ok(
                groupId: groupId,
                name: try container.decode(String.self, forKey: .name),
                conversationId: try container.decode(String.self, forKey: .conversationId)
            )
        case "error":
            self = .error(groupId: groupId, error: try container.decode(KharismaProtocolError.self, forKey: .error))
        default:
            throw DecodingError.dataCorruptedError(forKey: .status, in: container, debugDescription: "Unknown join status")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .ok(groupId, name, conversationId):
            try container.encode("ok", forKey: .status)
            try container.encode(groupId, forKey: .groupId)
            try container.encode(name, forKey: .name)
            try container.encode(conversationId, forKey: .conversationId)
        case let .error(groupId, error):
            try container.encode("error", forKey: .status)
            try container.encode(groupId, forKey: .groupId)
            try container.encode(error, forKey: .error)
        }
    }
}

public struct ThreadCatalogEntry: Codable, Equatable, Identifiable, Sendable {
    public var id: String { threadId }
    public let threadId: String
    public let title: String
    public let createdAt: String
    public let createdBy: String
    public let updatedAt: String

    public init(threadId: String, title: String, createdAt: String, createdBy: String, updatedAt: String) {
        self.threadId = threadId
        self.title = title
        self.createdAt = createdAt
        self.createdBy = createdBy
        self.updatedAt = updatedAt
    }
}

public struct ThreadCatalogRequestPayload: Codable, Equatable, Sendable {
    public let groupId: String
    public init(groupId: String) { self.groupId = groupId }
}

public enum ThreadCatalogResponsePayload: Codable, Equatable, Sendable {
    case ok(groupId: String, conversationId: String, threads: [ThreadCatalogEntry])
    case error(groupId: String, error: KharismaProtocolError)

    private enum CodingKeys: String, CodingKey { case status, groupId, conversationId, threads, error }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let groupId = try container.decode(String.self, forKey: .groupId)
        switch try container.decode(String.self, forKey: .status) {
        case "ok":
            self = .ok(groupId: groupId, conversationId: try container.decode(String.self, forKey: .conversationId), threads: try container.decode([ThreadCatalogEntry].self, forKey: .threads))
        case "error":
            self = .error(groupId: groupId, error: try container.decode(KharismaProtocolError.self, forKey: .error))
        default:
            throw DecodingError.dataCorruptedError(forKey: .status, in: container, debugDescription: "Unknown thread catalog status")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .ok(groupId, conversationId, threads):
            try container.encode("ok", forKey: .status)
            try container.encode(groupId, forKey: .groupId)
            try container.encode(conversationId, forKey: .conversationId)
            try container.encode(threads, forKey: .threads)
        case let .error(groupId, error):
            try container.encode("error", forKey: .status)
            try container.encode(groupId, forKey: .groupId)
            try container.encode(error, forKey: .error)
        }
    }
}

public enum InvestmentToken: String, Codable, Sendable {
    case WLD
    case USDC
}

public struct InvestmentConfigRequestPayload: Codable, Equatable, Sendable {
    public let groupId: String
    public init(groupId: String) { self.groupId = groupId }
}

public struct InvestmentTokenConfigPayload: Codable, Equatable, Sendable {
    public let token: InvestmentToken
    public let address: String
    public let decimals: Int

    public init(token: InvestmentToken, address: String, decimals: Int) {
        self.token = token
        self.address = address
        self.decimals = decimals
    }
}

public struct InvestmentChainConfigPayload: Codable, Equatable, Sendable {
    public let chainId: Int
    public let name: String
    public let tokens: [InvestmentTokenConfigPayload]

    public init(chainId: Int, name: String, tokens: [InvestmentTokenConfigPayload]) {
        self.chainId = chainId
        self.name = name
        self.tokens = tokens
    }
}

public enum InvestmentConfigResponsePayload: Codable, Equatable, Sendable {
    case ok(groupId: String, destinationAddress: String?, chains: [InvestmentChainConfigPayload])
    case error(groupId: String, error: KharismaProtocolError)
}

public struct InvestmentSubmitPayload: Codable, Equatable, Sendable {
    public let groupId: String
    public let walletAddress: String
    public let chainId: Int
    public let token: InvestmentToken
    public let amount: String
    public let txHash: String?
    public let userOpHash: String?

    public init(groupId: String, walletAddress: String, chainId: Int, token: InvestmentToken, amount: String, txHash: String? = nil, userOpHash: String? = nil) {
        self.groupId = groupId
        self.walletAddress = walletAddress
        self.chainId = chainId
        self.token = token
        self.amount = amount
        self.txHash = txHash
        self.userOpHash = userOpHash
    }
}
