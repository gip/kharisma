import Foundation

public struct MemberJoinedPayload: Codable, Equatable, Sendable {
    public let name: String
    public let inboxId: String
    public let joinedAt: String

    public init(name: String, inboxId: String, joinedAt: String) {
        self.name = name
        self.inboxId = inboxId
        self.joinedAt = joinedAt
    }

    public var fallbackText: String {
        "\(name) joined the group"
    }
}

public struct ThreadCreatePayload: Codable, Equatable, Sendable {
    public let title: String
    public let createdAt: String

    public init(title: String, createdAt: String) {
        self.title = title
        self.createdAt = createdAt
    }

    public var fallbackText: String {
        "Thread: \(title)"
    }
}

public struct InvestmentRecordedPayload: Codable, Equatable, Sendable {
    public let groupId: String
    public let investorInboxId: String
    public let investorWalletAddress: String
    public let token: InvestmentToken
    public let tokenAddress: String
    public let amount: String
    public let decimals: Int
    public let destinationAddress: String
    public let chainId: Int
    public let txHash: String
    public let recordedAt: String

    public init(groupId: String, investorInboxId: String, investorWalletAddress: String, token: InvestmentToken, tokenAddress: String, amount: String, decimals: Int, destinationAddress: String, chainId: Int, txHash: String, recordedAt: String) {
        self.groupId = groupId
        self.investorInboxId = investorInboxId
        self.investorWalletAddress = investorWalletAddress
        self.token = token
        self.tokenAddress = tokenAddress
        self.amount = amount
        self.decimals = decimals
        self.destinationAddress = destinationAddress
        self.chainId = chainId
        self.txHash = txHash
        self.recordedAt = recordedAt
    }

    public var fallbackText: String {
        "\(investorWalletAddress) invested \(amount) \(token.rawValue)"
    }
}
