import Foundation
import KharismaProtocol
import KharismaWallet
@testable import KharismaXMTP

actor MockSigner: KharismaSigner {
    let addressValue: String
    let accountTypeValue: WalletAccountType
    let chainIdValue: Int

    init(address: String = "0x1111111111111111111111111111111111111111", accountType: WalletAccountType = .eoa, chainId: Int = 480) {
        self.addressValue = address
        self.accountTypeValue = accountType
        self.chainIdValue = chainId
    }

    var address: String { addressValue }
    var accountType: WalletAccountType { accountTypeValue }
    var chainId: Int { chainIdValue }

    func signPersonalMessage(_ message: Data) async throws -> String {
        "0xmock\(message.count)"
    }

    func sendTransaction(_ request: WalletTransactionRequest) async throws -> WalletTransactionResult {
        WalletTransactionResult(txHash: "0xmocktx\(request.chainId)")
    }
}

actor FakeXMTPClient: KharismaXMTPClient {
    private let signer: any KharismaSigner
    private var bootstrapped = false
    private var groupMessages: [String: [KharismaMessage]] = [:]

    init(signer: any KharismaSigner) {
        self.signer = signer
    }

    var identity: XMTPClientIdentity {
        get async {
            let address = await signer.address
            return XMTPClientIdentity(inboxId: "test-\(address)", walletAddress: address)
        }
    }

    func bootstrap() async throws {
        bootstrapped = true
    }

    func authenticateMain(role: AuthenticatedRole) async throws {}

    func listGroups(languages: [String]?) async throws -> [GroupSummary] {
        [
            GroupSummary(
                groupId: "genesis",
                title: "Genesis Circle",
                description: "Initial Kharisma coordination group",
                mediaUrl: nil,
                thumbnailUrl: nil,
                languages: ["en"],
                syncInboxId: "xmtp-sync-genesis",
                memberCount: 1,
                maxMembers: 50,
                availableSeats: 49,
                joinPolicy: .humanAndHumanAgent,
                isMember: false,
                conversationId: "xmtp-group-genesis",
                senders: []
            )
        ]
    }

    func join(group: GroupSummary, displayName: String?) async throws -> String {
        let conversationId = group.conversationId ?? group.groupId
        let sender = await identity.inboxId
        groupMessages[conversationId, default: []].append(
            KharismaMessage(id: UUID().uuidString, conversationId: conversationId, senderInboxId: sender, text: "\(displayName ?? "test") joined the group")
        )
        return conversationId
    }

    func sendText(_ text: String, conversationId: String) async throws {
        let sender = await identity.inboxId
        groupMessages[conversationId, default: []].append(
            KharismaMessage(id: UUID().uuidString, conversationId: conversationId, senderInboxId: sender, text: text)
        )
    }

    func messages(conversationId: String) async throws -> [KharismaMessage] {
        groupMessages[conversationId, default: []]
    }

    func submitInvestment(_ payload: InvestmentSubmitPayload, syncInboxId: String) async throws -> WalletTransactionResult? {
        nil
    }
}

struct FakeXMTPClientFactory: KharismaXMTPClientFactory {
    func makeClient(configuration: XMTPClientConfiguration, signer: any KharismaSigner, storage: XMTPStorage) -> any KharismaXMTPClient {
        FakeXMTPClient(signer: signer)
    }
}
