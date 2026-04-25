import Foundation

public struct ContentTypeID: Hashable, Codable, Sendable {
    public let authorityID: String
    public let typeID: String
    public let versionMajor: Int
    public let versionMinor: Int

    public init(authorityID: String = ContentTypes.authority, typeID: String, versionMajor: Int = 1, versionMinor: Int = 0) {
        self.authorityID = authorityID
        self.typeID = typeID
        self.versionMajor = versionMajor
        self.versionMinor = versionMinor
    }
}

public enum ContentTypes {
    public static let authority = "kharisma.xyz"

    public static let walletStatusRequest = ContentTypeID(typeID: "wallet-status-request", versionMajor: 2)
    public static let walletStatusResponse = ContentTypeID(typeID: "wallet-status-response", versionMajor: 2)
    public static let identitySubmit = ContentTypeID(typeID: "identity-submit", versionMajor: 2)
    public static let humanSubmit = ContentTypeID(typeID: "human-submit", versionMajor: 2)
    public static let humanAgentSubmit = ContentTypeID(typeID: "human-agent-submit", versionMajor: 2)
    public static let verificationAck = ContentTypeID(typeID: "verification-ack", versionMajor: 2)
    public static let hello = ContentTypeID(typeID: "hello", versionMajor: 2)
    public static let skillRequest = ContentTypeID(typeID: "skill-request")
    public static let skillResponse = ContentTypeID(typeID: "skill-response")
    public static let listGroupsRequest = ContentTypeID(typeID: "list-groups-request")
    public static let listGroupsResponse = ContentTypeID(typeID: "list-groups-response", versionMajor: 2)
    public static let createGroupRequest = ContentTypeID(typeID: "create-group-request", versionMajor: 2)
    public static let createGroupResponse = ContentTypeID(typeID: "create-group-response")
    public static let error = ContentTypeID(typeID: "error")
    public static let joinRequest = ContentTypeID(typeID: "join-request", versionMajor: 2)
    public static let joinResponse = ContentTypeID(typeID: "join-response")
    public static let investmentConfigRequest = ContentTypeID(typeID: "investment-config-request")
    public static let investmentConfigResponse = ContentTypeID(typeID: "investment-config-response")
    public static let investmentSubmit = ContentTypeID(typeID: "investment-submit")
    public static let investmentSubmitResponse = ContentTypeID(typeID: "investment-submit-response")
    public static let threadCatalogRequest = ContentTypeID(typeID: "thread-catalog-request")
    public static let threadCatalogResponse = ContentTypeID(typeID: "thread-catalog-response")
    public static let memberJoined = ContentTypeID(typeID: "member-joined")
    public static let threadCreate = ContentTypeID(typeID: "thread-create")
    public static let investmentRecorded = ContentTypeID(typeID: "investment-recorded")

    public static let all: [ContentTypeID] = [
        walletStatusRequest,
        walletStatusResponse,
        identitySubmit,
        humanSubmit,
        humanAgentSubmit,
        verificationAck,
        hello,
        skillRequest,
        skillResponse,
        listGroupsRequest,
        listGroupsResponse,
        createGroupRequest,
        createGroupResponse,
        error,
        joinRequest,
        joinResponse,
        investmentConfigRequest,
        investmentConfigResponse,
        investmentSubmit,
        investmentSubmitResponse,
        threadCatalogRequest,
        threadCatalogResponse,
        memberJoined,
        threadCreate,
        investmentRecorded
    ]
}

