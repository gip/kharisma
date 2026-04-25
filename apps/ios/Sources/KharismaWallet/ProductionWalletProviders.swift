import Foundation

#if canImport(PrivySDK)
import PrivySDK
#endif

#if canImport(WalletConnectSign)
import WalletConnectSign
#endif

public struct PrivyWalletConfiguration: Equatable, Sendable {
    public let appId: String
    public let appClientId: String
    public let defaultChainId: Int

    public init(appId: String, appClientId: String, defaultChainId: Int) {
        self.appId = appId
        self.appClientId = appClientId
        self.defaultChainId = defaultChainId
    }
}

public struct ReownWalletConfiguration: Equatable, Sendable {
    public let projectId: String
    public let requiredChainIds: [Int]

    public init(projectId: String, requiredChainIds: [Int]) {
        self.projectId = projectId
        self.requiredChainIds = requiredChainIds
    }
}

public actor ProductionPrivyWalletProvider: PrivyEmbeddedWalletProvider {
    private let configuration: PrivyWalletConfiguration

    #if canImport(PrivySDK)
    private let privy: Privy
    #endif

    public init(configuration: PrivyWalletConfiguration) {
        self.configuration = configuration
        #if canImport(PrivySDK)
        let config = PrivyConfig(
            appId: configuration.appId,
            appClientId: configuration.appClientId
        )
        self.privy = PrivySdk.initialize(config: config)
        #endif
    }

    public func authenticate() async throws -> WalletSession {
        #if canImport(PrivySDK)
        let user: PrivyUser
        switch await privy.getAuthState() {
        case .authenticated(let authenticatedUser):
            user = authenticatedUser
        case .authenticatedUnverified:
            throw WalletError.unavailable("Privy session exists but could not be verified. Restore network connectivity and retry.")
        case .notReady:
            throw WalletError.unavailable("Privy is not ready yet.")
        case .unauthenticated:
            throw WalletError.unavailable("Privy authentication requires a login flow before wallet creation.")
        @unknown default:
            throw WalletError.unavailable("Unknown Privy authentication state.")
        }

        let wallet = try await ethereumWallet(for: user)
        return WalletSession(address: wallet.address, accountType: .eoa, chainId: configuration.defaultChainId)
        #else
        throw WalletError.unavailable("PrivySDK is not linked. Add https://github.com/privy-io/privy-ios to the app target.")
        #endif
    }

    public func sendEmailCode(to email: String) async throws {
        #if canImport(PrivySDK)
        try await privy.email.sendCode(to: email)
        #else
        throw WalletError.unavailable("PrivySDK is not linked.")
        #endif
    }

    public func authenticateWithEmailCode(_ code: String, sentTo email: String) async throws -> WalletSession {
        #if canImport(PrivySDK)
        let user = try await privy.email.loginWithCode(code, sentTo: email)
        let wallet = try await ethereumWallet(for: user)
        return WalletSession(address: wallet.address, accountType: .eoa, chainId: configuration.defaultChainId)
        #else
        throw WalletError.unavailable("PrivySDK is not linked.")
        #endif
    }

    public func signPersonalMessage(_ message: Data, address: String) async throws -> String {
        #if canImport(PrivySDK)
        guard let user = await privy.getUser() else {
            throw WalletError.unavailable("Privy user is not authenticated.")
        }
        let wallet = try await ethereumWallet(for: user, address: address)
        let request = EthereumRpcRequest.personalSign(
            message: String(data: message, encoding: .utf8) ?? message.base64EncodedString(),
            address: address
        )
        return try await wallet.provider.request(request)
        #else
        throw WalletError.unavailable("PrivySDK is not linked.")
        #endif
    }

    public func sendTransaction(_ request: WalletTransactionRequest, address: String) async throws -> WalletTransactionResult {
        #if canImport(PrivySDK)
        guard let user = await privy.getUser() else {
            throw WalletError.unavailable("Privy user is not authenticated.")
        }
        let wallet = try await ethereumWallet(for: user, address: address)
        let transaction = EthereumRpcRequest.UnsignedEthTransaction(
            from: address,
            to: request.to,
            data: request.data,
            value: request.value.map { .hexadecimalNumber($0) },
            chainId: .int(request.chainId)
        )
        let rpcRequest = try EthereumRpcRequest.ethSendTransaction(transaction: transaction)
        let hash = try await wallet.provider.request(rpcRequest)
        return WalletTransactionResult(txHash: hash)
        #else
        throw WalletError.unavailable("PrivySDK is not linked.")
        #endif
    }

    #if canImport(PrivySDK)
    private func ethereumWallet(for user: PrivyUser, address: String? = nil) async throws -> EmbeddedEthereumWallet {
        if let address,
           let existing = user.embeddedEthereumWallets.first(where: { $0.address.lowercased() == address.lowercased() }) {
            return existing
        }
        if let existing = user.embeddedEthereumWallets.first {
            return existing
        }
        return try await user.createEthereumWallet(allowAdditional: false)
    }
    #endif
}

public actor ProductionWalletConnectProvider: WalletConnectProvider {
    private let configuration: ReownWalletConfiguration

    public init(configuration: ReownWalletConfiguration) {
        self.configuration = configuration
    }

    public func connect(requiredChainIds: [Int]) async throws -> WalletSession {
        throw WalletError.unavailable("WalletConnect/Reown connection UI is not wired yet. Project ID: \(configuration.projectId), chains: \(requiredChainIds)")
    }

    public func signPersonalMessage(_ message: Data, address: String) async throws -> String {
        throw WalletError.unavailable("WalletConnect personal_sign requires an active Reown session.")
    }

    public func sendTransaction(_ request: WalletTransactionRequest, address: String) async throws -> WalletTransactionResult {
        throw WalletError.unavailable("WalletConnect eth_sendTransaction requires an active Reown session.")
    }

    public func disconnect() async {}
}
