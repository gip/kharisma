import Foundation

public struct WalletStatusRequestPayload: Codable, Equatable, Sendable {
    public let walletAddress: String
    public init(walletAddress: String) { self.walletAddress = walletAddress }
}

public struct WalletStatusResponsePayload: Codable, Equatable, Sendable {
    public let walletAddress: String
    public let status: RegistrationStatus
    public let verificationLevel: VerificationLevel
    public let humanId: String?
    public let agentId: String?
    public let handle: String?

    public init(walletAddress: String, status: RegistrationStatus, verificationLevel: VerificationLevel, humanId: String?, agentId: String?, handle: String?) {
        self.walletAddress = walletAddress
        self.status = status
        self.verificationLevel = verificationLevel
        self.humanId = humanId
        self.agentId = agentId
        self.handle = handle
    }
}

public struct IdentitySubmitPayload: Codable, Equatable, Sendable {
    public let walletAddress: String
    public let proof: AnyJSON
    public init(walletAddress: String, proof: AnyJSON) {
        self.walletAddress = walletAddress
        self.proof = proof
    }
}

public struct HumanSubmitPayload: Codable, Equatable, Sendable {
    public let walletAddress: String
    public let handle: String
    public let proof: AnyJSON
    public init(walletAddress: String, handle: String, proof: AnyJSON) {
        self.walletAddress = walletAddress
        self.handle = handle
        self.proof = proof
    }
}

public struct HumanAgentSubmitPayload: Codable, Equatable, Sendable {
    public let walletAddress: String
    public let ownerHumanId: String
    public let handle: String
    public let proof: AnyJSON
    public init(walletAddress: String, ownerHumanId: String, handle: String, proof: AnyJSON) {
        self.walletAddress = walletAddress
        self.ownerHumanId = ownerHumanId
        self.handle = handle
        self.proof = proof
    }
}

public enum VerificationAction: String, Codable, Sendable {
    case identity
    case human
    case humanAgent = "human-agent"
}

public enum VerificationAckStatus: String, Codable, Sendable {
    case ok
    case error
}

public struct VerificationAckPayload: Codable, Equatable, Sendable {
    public let action: VerificationAction
    public let walletAddress: String
    public let status: VerificationAckStatus
    public let resolvedStatus: RegistrationStatus
    public let verificationLevel: VerificationLevel
    public let humanId: String?
    public let agentId: String?
    public let handle: String?
    public let error: KharismaProtocolError?

    public init(action: VerificationAction, walletAddress: String, status: VerificationAckStatus, resolvedStatus: RegistrationStatus, verificationLevel: VerificationLevel, humanId: String?, agentId: String?, handle: String?, error: KharismaProtocolError? = nil) {
        self.action = action
        self.walletAddress = walletAddress
        self.status = status
        self.resolvedStatus = resolvedStatus
        self.verificationLevel = verificationLevel
        self.humanId = humanId
        self.agentId = agentId
        self.handle = handle
        self.error = error
    }
}

public struct HelloPayload: Codable, Equatable, Sendable {
    public let role: AuthenticatedRole
    public let walletAddress: String
    public init(role: AuthenticatedRole, walletAddress: String) {
        self.role = role
        self.walletAddress = walletAddress
    }
}

public struct SkillRequestPayload: Codable, Equatable, Sendable {
    public init() {}
}

public struct ListGroupsRequestPayload: Codable, Equatable, Sendable {
    public let languages: [String]?
    public init(languages: [String]? = nil) { self.languages = languages }
}

public struct GroupSenderSummary: Codable, Equatable, Identifiable, Sendable {
    public var id: String { inboxId }
    public let inboxId: String
    public let name: String
    public let role: Role
    public let walletAddress: String?
    public let humanId: String?
    public let agentId: String?
    public let verificationLevel: VerificationLevel

    public init(inboxId: String, name: String, role: Role, walletAddress: String?, humanId: String?, agentId: String?, verificationLevel: VerificationLevel) {
        self.inboxId = inboxId
        self.name = name
        self.role = role
        self.walletAddress = walletAddress
        self.humanId = humanId
        self.agentId = agentId
        self.verificationLevel = verificationLevel
    }
}

public struct GroupSummary: Codable, Equatable, Identifiable, Sendable {
    public var id: String { groupId }
    public let groupId: String
    public let title: String
    public let description: String
    public let mediaUrl: String?
    public let thumbnailUrl: String?
    public let languages: [String]
    public let syncInboxId: String
    public let memberCount: Int
    public let maxMembers: Int
    public let availableSeats: Int
    public let joinPolicy: GroupJoinPolicy
    public let isMember: Bool
    public let conversationId: String?
    public let senders: [GroupSenderSummary]

    public init(groupId: String, title: String, description: String, mediaUrl: String?, thumbnailUrl: String?, languages: [String], syncInboxId: String, memberCount: Int, maxMembers: Int, availableSeats: Int, joinPolicy: GroupJoinPolicy, isMember: Bool, conversationId: String?, senders: [GroupSenderSummary]) {
        self.groupId = groupId
        self.title = title
        self.description = description
        self.mediaUrl = mediaUrl
        self.thumbnailUrl = thumbnailUrl
        self.languages = languages
        self.syncInboxId = syncInboxId
        self.memberCount = memberCount
        self.maxMembers = maxMembers
        self.availableSeats = availableSeats
        self.joinPolicy = joinPolicy
        self.isMember = isMember
        self.conversationId = conversationId
        self.senders = senders
    }
}

public struct ListGroupsResponsePayload: Codable, Equatable, Sendable {
    public let groups: [GroupSummary]
    public init(groups: [GroupSummary]) { self.groups = groups }
}

public struct CreateGroupRequestPayload: Codable, Equatable, Sendable {
    public let title: String
    public let description: String
    public let mediaUrl: String
    public let thumbnailUrl: String
    public let languages: [String]
    public let joinPolicy: GroupJoinPolicy
    public let maxMembers: Int

    public init(title: String, description: String, mediaUrl: String, thumbnailUrl: String, languages: [String], joinPolicy: GroupJoinPolicy, maxMembers: Int) {
        self.title = title
        self.description = description
        self.mediaUrl = mediaUrl
        self.thumbnailUrl = thumbnailUrl
        self.languages = languages
        self.joinPolicy = joinPolicy
        self.maxMembers = maxMembers
    }
}

public enum CreateGroupResponsePayload: Codable, Equatable, Sendable {
    case ok(groupId: String, syncInboxId: String, conversationId: String)
    case error(KharismaProtocolError)

    private enum CodingKeys: String, CodingKey { case status, groupId, syncInboxId, conversationId, error }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .status) {
        case "ok":
            self = .ok(
                groupId: try container.decode(String.self, forKey: .groupId),
                syncInboxId: try container.decode(String.self, forKey: .syncInboxId),
                conversationId: try container.decode(String.self, forKey: .conversationId)
            )
        case "error":
            self = .error(try container.decode(KharismaProtocolError.self, forKey: .error))
        default:
            throw DecodingError.dataCorruptedError(forKey: .status, in: container, debugDescription: "Unknown create group status")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .ok(groupId, syncInboxId, conversationId):
            try container.encode("ok", forKey: .status)
            try container.encode(groupId, forKey: .groupId)
            try container.encode(syncInboxId, forKey: .syncInboxId)
            try container.encode(conversationId, forKey: .conversationId)
        case let .error(error):
            try container.encode("error", forKey: .status)
            try container.encode(error, forKey: .error)
        }
    }
}
