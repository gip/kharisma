import Foundation

public struct WalletSession: Equatable, Sendable {
    public let address: String
    public let accountType: WalletAccountType
    public let chainId: Int

    public init(address: String, accountType: WalletAccountType, chainId: Int) {
        self.address = address
        self.accountType = accountType
        self.chainId = chainId
    }
}

public protocol PrivyEmbeddedWalletProvider: Sendable {
    func authenticate() async throws -> WalletSession
    func sendEmailCode(to email: String) async throws
    func authenticateWithEmailCode(_ code: String, sentTo email: String) async throws -> WalletSession
    func signPersonalMessage(_ message: Data, address: String) async throws -> String
    func sendTransaction(_ request: WalletTransactionRequest, address: String) async throws -> WalletTransactionResult
}

public protocol WalletConnectProvider: Sendable {
    func connect(requiredChainIds: [Int]) async throws -> WalletSession
    func signPersonalMessage(_ message: Data, address: String) async throws -> String
    func sendTransaction(_ request: WalletTransactionRequest, address: String) async throws -> WalletTransactionResult
    func disconnect() async
}

public actor PrivySigner: KharismaSigner {
    private let provider: PrivyEmbeddedWalletProvider
    private var session: WalletSession

    public init(provider: PrivyEmbeddedWalletProvider, session: WalletSession) {
        self.provider = provider
        self.session = session
    }

    public static func authenticate(provider: PrivyEmbeddedWalletProvider) async throws -> PrivySigner {
        let session = try await provider.authenticate()
        return PrivySigner(provider: provider, session: session)
    }

    public static func authenticateWithEmailCode(_ code: String, sentTo email: String, provider: PrivyEmbeddedWalletProvider) async throws -> PrivySigner {
        let session = try await provider.authenticateWithEmailCode(code, sentTo: email)
        return PrivySigner(provider: provider, session: session)
    }

    public var address: String { session.address }
    public var accountType: WalletAccountType { session.accountType }
    public var chainId: Int { session.chainId }

    public func signPersonalMessage(_ message: Data) async throws -> String {
        try await provider.signPersonalMessage(message, address: session.address)
    }

    public func sendTransaction(_ request: WalletTransactionRequest) async throws -> WalletTransactionResult {
        try await provider.sendTransaction(request, address: session.address)
    }
}

public actor WalletConnectSigner: KharismaSigner {
    private let provider: WalletConnectProvider
    private var session: WalletSession

    public init(provider: WalletConnectProvider, session: WalletSession) {
        self.provider = provider
        self.session = session
    }

    public static func connect(provider: WalletConnectProvider, requiredChainIds: [Int]) async throws -> WalletConnectSigner {
        let session = try await provider.connect(requiredChainIds: requiredChainIds)
        return WalletConnectSigner(provider: provider, session: session)
    }

    public var address: String { session.address }
    public var accountType: WalletAccountType { session.accountType }
    public var chainId: Int { session.chainId }

    public func signPersonalMessage(_ message: Data) async throws -> String {
        try await provider.signPersonalMessage(message, address: session.address)
    }

    public func sendTransaction(_ request: WalletTransactionRequest) async throws -> WalletTransactionResult {
        try await provider.sendTransaction(request, address: session.address)
    }
}
