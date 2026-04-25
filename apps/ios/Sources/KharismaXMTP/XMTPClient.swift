import Foundation
import KharismaProtocol
import KharismaWallet

public enum XMTPEnvironment: String, Codable, Sendable {
    case local
    case dev
    case production
}

public struct XMTPClientConfiguration: Equatable, Sendable {
    public let environment: XMTPEnvironment
    public let appVersion: String
    public let mainServiceInboxId: String

    public init(environment: XMTPEnvironment = .dev, appVersion: String = "kharisma-ios/0.1.0", mainServiceInboxId: String) {
        self.environment = environment
        self.appVersion = appVersion
        self.mainServiceInboxId = mainServiceInboxId
    }
}

public struct XMTPClientIdentity: Equatable, Sendable {
    public let inboxId: String
    public let walletAddress: String
}

public struct KharismaMessage: Identifiable, Equatable, Sendable {
    public let id: String
    public let conversationId: String
    public let senderInboxId: String
    public let sentAt: Date
    public let text: String

    public init(id: String, conversationId: String, senderInboxId: String, sentAt: Date = Date(), text: String) {
        self.id = id
        self.conversationId = conversationId
        self.senderInboxId = senderInboxId
        self.sentAt = sentAt
        self.text = text
    }
}

public protocol KharismaXMTPClient: Sendable {
    var identity: XMTPClientIdentity { get async }
    func bootstrap() async throws
    func authenticateMain(role: AuthenticatedRole) async throws
    func listGroups(languages: [String]?) async throws -> [GroupSummary]
    func join(group: GroupSummary, displayName: String?) async throws -> String
    func sendText(_ text: String, conversationId: String) async throws
    func messages(conversationId: String) async throws -> [KharismaMessage]
    func submitInvestment(_ payload: InvestmentSubmitPayload, syncInboxId: String) async throws -> WalletTransactionResult?
}

public protocol KharismaXMTPClientFactory: Sendable {
    func makeClient(configuration: XMTPClientConfiguration, signer: any KharismaSigner, storage: XMTPStorage) -> any KharismaXMTPClient
}

public struct ProductionXMTPClientFactory: KharismaXMTPClientFactory {
    public init() {}

    public func makeClient(configuration: XMTPClientConfiguration, signer: any KharismaSigner, storage: XMTPStorage) -> any KharismaXMTPClient {
        XMTPKharismaClient(configuration: configuration, signer: signer, storage: storage)
    }
}

#if canImport(XMTPiOS)
@preconcurrency import XMTPiOS

public final class XMTPKharismaClient: KharismaXMTPClient, @unchecked Sendable {
    private let configuration: XMTPClientConfiguration
    private let signer: any KharismaSigner
    private let storage: XMTPStorage
    private var client: Client?
    private var mainDM: Dm?
    private var conversationIds: [String: Conversation] = [:]

    public init(configuration: XMTPClientConfiguration, signer: any KharismaSigner, storage: XMTPStorage) {
        self.configuration = configuration
        self.signer = signer
        self.storage = storage
    }

    public var identity: XMTPClientIdentity {
        get async {
            if let client {
                return XMTPClientIdentity(inboxId: client.inboxID, walletAddress: await signer.address)
            }
            return XMTPClientIdentity(inboxId: "", walletAddress: await signer.address)
        }
    }

    public func bootstrap() async throws {
        let address = await signer.address
        let dbDirectory = try storage.databaseURL(walletAddress: address).deletingLastPathComponent().path
        let encryptionKey = try storage.encryptionKey(walletAddress: address)
        let options = ClientOptions(
            api: ClientOptions.Api(env: xmtpEnvironment),
            dbEncryptionKey: encryptionKey,
            dbDirectory: dbDirectory
        )
        client = try await Client.create(
            account: XMTPSigningKeyAdapter(
                address: address,
                accountType: await signer.accountType,
                chainIdValue: await signer.chainId,
                signer: signer
            ),
            options: options
        )
    }

    public func authenticateMain(role: AuthenticatedRole) async throws {
        let dm = try await mainConversation()
        let walletAddress = await signer.address
        _ = try await dm.send(content: HelloPayload(role: role, walletAddress: walletAddress))
    }

    public func listGroups(languages: [String]?) async throws -> [GroupSummary] {
        let dm = try await mainConversation()
        _ = try await dm.send(content: ListGroupsRequestPayload(languages: languages))
        throw KharismaProtocolError(.internalError, "Awaiting typed XMTP response correlation for list-groups-response/2.")
    }

    public func join(group: GroupSummary, displayName: String?) async throws -> String {
        guard let client else { throw KharismaProtocolError(.internalError, "XMTP client is not bootstrapped") }
        let syncDM = try await client.conversations.findOrCreateDm(with: group.syncInboxId)
        _ = try await syncDM.send(content: JoinRequestPayload(groupId: group.groupId, walletAddress: await signer.address, name: displayName))
        return group.conversationId ?? syncDM.id
    }

    public func sendText(_ text: String, conversationId: String) async throws {
        let conversation = try await conversation(for: conversationId)
        _ = try await conversation.send(text: text)
    }

    public func messages(conversationId: String) async throws -> [KharismaMessage] {
        let conversation = try await conversation(for: conversationId)
        let messages = try await conversation.messages(limit: 100, direction: .ascending)
        return messages.map { message in
            KharismaMessage(
                id: message.id,
                conversationId: message.conversationId,
                senderInboxId: message.senderInboxId,
                sentAt: message.sentAt,
                text: (try? message.body) ?? (try? message.fallback) ?? ""
            )
        }
    }

    public func submitInvestment(_ payload: InvestmentSubmitPayload, syncInboxId: String) async throws -> WalletTransactionResult? {
        guard let client else { throw KharismaProtocolError(.internalError, "XMTP client is not bootstrapped") }
        let syncDM = try await client.conversations.findOrCreateDm(with: syncInboxId)
        _ = try await syncDM.send(content: payload)
        return nil
    }

    private var xmtpEnvironment: XMTPiOS.XMTPEnvironment {
        switch configuration.environment {
        case .local: return .local
        case .dev: return .dev
        case .production: return .production
        }
    }

    private func mainConversation() async throws -> Dm {
        if let mainDM { return mainDM }
        guard let client else { throw KharismaProtocolError(.internalError, "XMTP client is not bootstrapped") }
        let dm = try await client.conversations.findOrCreateDm(with: configuration.mainServiceInboxId)
        mainDM = dm
        return dm
    }

    private func conversation(for conversationId: String) async throws -> Conversation {
        if let conversation = conversationIds[conversationId] { return conversation }
        guard let client else { throw KharismaProtocolError(.internalError, "XMTP client is not bootstrapped") }
        let conversations = try await client.conversations.list()
        guard let conversation = conversations.first(where: { $0.id == conversationId }) else {
            throw KharismaProtocolError(.groupNotFound, "Conversation \(conversationId) was not found locally.")
        }
        conversationIds[conversationId] = conversation
        return conversation
    }
}

private struct XMTPSigningKeyAdapter: SigningKey {
    let address: String
    let accountType: WalletAccountType
    let chainIdValue: Int
    let signer: any KharismaSigner

    var identity: PublicIdentity {
        PublicIdentity(kind: .ethereum, identifier: address)
    }

    var type: SignerType {
        accountType == .smartContractWallet ? .SCW : .EOA
    }

    var chainId: Int64? {
        Int64(chainIdValue)
    }

    func sign(_ message: String) async throws -> SignedData {
        let signature = try await signer.signPersonalMessage(Data(message.utf8))
        return SignedData(rawData: Data(hexString: signature))
    }
}

private extension Data {
    init(hexString: String) {
        let hex = hexString.dropFirst(hexString.hasPrefix("0x") ? 2 : 0)
        var bytes = Data()
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            if let byte = UInt8(hex[index..<next], radix: 16) {
                bytes.append(byte)
            }
            index = next
        }
        self = bytes
    }
}
#else
public final class XMTPKharismaClient: KharismaXMTPClient, @unchecked Sendable {
    public init(configuration: XMTPClientConfiguration, signer: any KharismaSigner, storage: XMTPStorage) {}
    public var identity: XMTPClientIdentity { get async { XMTPClientIdentity(inboxId: "", walletAddress: "") } }
    public func bootstrap() async throws { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func authenticateMain(role: AuthenticatedRole) async throws { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func listGroups(languages: [String]?) async throws -> [GroupSummary] { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func join(group: GroupSummary, displayName: String?) async throws -> String { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func sendText(_ text: String, conversationId: String) async throws { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func messages(conversationId: String) async throws -> [KharismaMessage] { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
    public func submitInvestment(_ payload: InvestmentSubmitPayload, syncInboxId: String) async throws -> WalletTransactionResult? { throw KharismaProtocolError(.internalError, "XMTPiOS is not linked.") }
}
#endif
