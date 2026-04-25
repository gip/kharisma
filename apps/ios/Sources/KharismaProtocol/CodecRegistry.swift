import Foundation

public enum KharismaCodecs {
    public static let walletStatusRequest = JSONContentCodec<WalletStatusRequestPayload>(contentType: ContentTypes.walletStatusRequest)
    public static let walletStatusResponse = JSONContentCodec<WalletStatusResponsePayload>(contentType: ContentTypes.walletStatusResponse)
    public static let hello = JSONContentCodec<HelloPayload>(contentType: ContentTypes.hello)
    public static let listGroupsRequest = JSONContentCodec<ListGroupsRequestPayload>(contentType: ContentTypes.listGroupsRequest)
    public static let listGroupsResponse = JSONContentCodec<ListGroupsResponsePayload>(contentType: ContentTypes.listGroupsResponse)
    public static let createGroupRequest = JSONContentCodec<CreateGroupRequestPayload>(contentType: ContentTypes.createGroupRequest)
    public static let createGroupResponse = JSONContentCodec<CreateGroupResponsePayload>(contentType: ContentTypes.createGroupResponse)
    public static let joinRequest = JSONContentCodec<JoinRequestPayload>(contentType: ContentTypes.joinRequest)
    public static let joinResponse = JSONContentCodec<JoinResponsePayload>(contentType: ContentTypes.joinResponse)
    public static let threadCatalogRequest = JSONContentCodec<ThreadCatalogRequestPayload>(contentType: ContentTypes.threadCatalogRequest)
    public static let threadCatalogResponse = JSONContentCodec<ThreadCatalogResponsePayload>(contentType: ContentTypes.threadCatalogResponse)
    public static let investmentConfigRequest = JSONContentCodec<InvestmentConfigRequestPayload>(contentType: ContentTypes.investmentConfigRequest)
    public static let investmentSubmit = JSONContentCodec<InvestmentSubmitPayload>(contentType: ContentTypes.investmentSubmit)
    public static let memberJoined = JSONContentCodec<MemberJoinedPayload>(contentType: ContentTypes.memberJoined)
    public static let threadCreate = JSONContentCodec<ThreadCreatePayload>(contentType: ContentTypes.threadCreate)
    public static let investmentRecorded = JSONContentCodec<InvestmentRecordedPayload>(contentType: ContentTypes.investmentRecorded)
}
