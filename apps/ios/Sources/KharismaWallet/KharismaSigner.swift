import Foundation

public enum WalletAccountType: String, Codable, Sendable {
    case eoa = "EOA"
    case smartContractWallet = "SCW"
}

public struct WalletTransactionRequest: Codable, Equatable, Sendable {
    public let to: String
    public let value: String?
    public let data: String?
    public let chainId: Int

    public init(to: String, value: String? = nil, data: String? = nil, chainId: Int) {
        self.to = to
        self.value = value
        self.data = data
        self.chainId = chainId
    }
}

public struct WalletTransactionResult: Codable, Equatable, Sendable {
    public let txHash: String?
    public let userOpHash: String?

    public init(txHash: String? = nil, userOpHash: String? = nil) {
        self.txHash = txHash
        self.userOpHash = userOpHash
    }
}

public protocol KharismaSigner: Sendable {
    var address: String { get async }
    var accountType: WalletAccountType { get async }
    var chainId: Int { get async }

    func signPersonalMessage(_ message: Data) async throws -> String
    func sendTransaction(_ request: WalletTransactionRequest) async throws -> WalletTransactionResult
}

public enum WalletError: Error, Equatable, Sendable {
    case unavailable(String)
    case unsupported(String)
    case rejected(String)
    case invalidResponse(String)
}

