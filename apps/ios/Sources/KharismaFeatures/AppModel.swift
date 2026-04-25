import Foundation
import Observation
import KharismaProtocol
import KharismaWallet
import KharismaXMTP

@MainActor
@Observable
public final class KharismaAppModel {
    public private(set) var phase: AppPhase = .signedOut
    public private(set) var walletAddress: String?
    public private(set) var groups: [GroupSummary] = []
    public private(set) var selectedGroup: GroupSummary?
    public private(set) var conversationId: String?
    public private(set) var messages: [KharismaMessage] = []
    public private(set) var emailOTPPhase: EmailOTPPhase = .enteringEmail
    public var loginEmail = ""
    public var loginCode = ""
    public var composeText = ""
    public var displayName = ""
    public var errorMessage: String?

    private var signer: (any KharismaSigner)?
    private var xmtpClient: (any KharismaXMTPClient)?
    private let privyProvider: (any PrivyEmbeddedWalletProvider)?
    private let walletConnectProvider: (any WalletConnectProvider)?
    private let xmtpClientFactory: any KharismaXMTPClientFactory
    private let configuration: XMTPClientConfiguration
    private let storage: XMTPStorage

    public init(
        configuration: XMTPClientConfiguration,
        storage: XMTPStorage = XMTPStorage(),
        privyProvider: (any PrivyEmbeddedWalletProvider)? = nil,
        walletConnectProvider: (any WalletConnectProvider)? = nil,
        xmtpClientFactory: any KharismaXMTPClientFactory = ProductionXMTPClientFactory()
    ) {
        self.configuration = configuration
        self.storage = storage
        self.privyProvider = privyProvider
        self.walletConnectProvider = walletConnectProvider
        self.xmtpClientFactory = xmtpClientFactory
    }

    public func signInWithPrivy() async {
        guard let privyProvider else {
            fail(WalletError.unavailable("Privy provider is not configured."))
            return
        }
        do {
            await attach(signer: try await PrivySigner.authenticate(provider: privyProvider))
        } catch {
            fail(error)
        }
    }

    public func sendPrivyEmailCode() async {
        guard let privyProvider else {
            fail(WalletError.unavailable("Privy provider is not configured."))
            return
        }

        let email = loginEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            errorMessage = "Enter an email address."
            return
        }

        do {
            errorMessage = nil
            emailOTPPhase = .sendingCode
            try await privyProvider.sendEmailCode(to: email)
            loginEmail = email
            emailOTPPhase = .enteringCode(email: email)
        } catch {
            emailOTPPhase = .enteringEmail
            fail(error, phase: .signedOut)
        }
    }

    public func verifyPrivyEmailCode() async {
        guard let privyProvider else {
            fail(WalletError.unavailable("Privy provider is not configured."))
            return
        }

        let email = loginEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let code = loginCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !code.isEmpty else {
            errorMessage = "Enter the code from your email."
            return
        }

        do {
            errorMessage = nil
            emailOTPPhase = .verifyingCode(email: email)
            let signer = try await PrivySigner.authenticateWithEmailCode(code, sentTo: email, provider: privyProvider)
            loginCode = ""
            await attach(signer: signer)
        } catch {
            emailOTPPhase = .enteringCode(email: email)
            fail(error, phase: .signedOut)
        }
    }

    public func connectExternalWallet(requiredChainIds: [Int]) async {
        guard let walletConnectProvider else {
            fail(WalletError.unavailable("WalletConnect provider is not configured."))
            return
        }
        do {
            await attach(signer: try await WalletConnectSigner.connect(provider: walletConnectProvider, requiredChainIds: requiredChainIds))
        } catch {
            fail(error)
        }
    }

    public func attach(signer: any KharismaSigner) async {
        phase = .connectingWallet
        self.signer = signer
        walletAddress = await signer.address
        let client = xmtpClientFactory.makeClient(configuration: configuration, signer: signer, storage: storage)
        xmtpClient = client
        do {
            phase = .bootstrappingXMTP
            try await client.bootstrap()
            try await client.authenticateMain(role: .human)
            phase = .ready
            try await refreshGroups()
        } catch {
            fail(error)
        }
    }

    public func refreshGroups() async throws {
        guard let xmtpClient else { return }
        groups = try await xmtpClient.listGroups(languages: nil)
    }

    public func join(_ group: GroupSummary) async {
        guard let xmtpClient else { return }
        do {
            selectedGroup = group
            conversationId = try await xmtpClient.join(group: group, displayName: displayName.isEmpty ? nil : displayName)
            try await refreshMessages()
        } catch {
            fail(error)
        }
    }

    public func sendComposedMessage() async {
        guard let xmtpClient, let conversationId, !composeText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let text = composeText
        composeText = ""
        do {
            try await xmtpClient.sendText(text, conversationId: conversationId)
            try await refreshMessages()
        } catch {
            fail(error)
        }
    }

    public func submitInvestment(token: InvestmentToken, amount: String, chainId: Int) async {
        guard let xmtpClient, let signer, let selectedGroup else { return }
        do {
            let address = await signer.address
            let payload = InvestmentSubmitPayload(
                groupId: selectedGroup.groupId,
                walletAddress: address,
                chainId: chainId,
                token: token,
                amount: amount,
                txHash: nil,
                userOpHash: nil
            )
            _ = try await xmtpClient.submitInvestment(payload, syncInboxId: selectedGroup.syncInboxId)
        } catch {
            fail(error)
        }
    }

    public func signOut() {
        phase = .signedOut
        emailOTPPhase = .enteringEmail
        walletAddress = nil
        groups = []
        selectedGroup = nil
        conversationId = nil
        messages = []
        signer = nil
        xmtpClient = nil
    }

    private func refreshMessages() async throws {
        guard let xmtpClient, let conversationId else { return }
        messages = try await xmtpClient.messages(conversationId: conversationId)
    }

    private func fail(_ error: Error) {
        fail(error, phase: .failed)
    }

    private func fail(_ error: Error, phase: AppPhase) {
        errorMessage = String(describing: error)
        self.phase = phase
    }
}

public enum AppPhase: Equatable, Sendable {
    case signedOut
    case connectingWallet
    case bootstrappingXMTP
    case ready
    case failed
}

public enum EmailOTPPhase: Equatable, Sendable {
    case enteringEmail
    case sendingCode
    case enteringCode(email: String)
    case verifyingCode(email: String)
}
