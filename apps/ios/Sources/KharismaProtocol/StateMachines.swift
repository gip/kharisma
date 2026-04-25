import Foundation

public enum MainChannelState: Equatable, Sendable {
    case new
    case authenticated(AuthenticatedRole)
}

public enum MainChannelCommand: Equatable, Sendable {
    case walletStatus
    case submitIdentity
    case submitHuman
    case submitHumanAgent
    case authenticate(AuthenticatedRole)
    case skill
    case listGroups
    case createGroup
}

public enum ChannelTransition<State: Equatable & Sendable, Command: Equatable & Sendable>: Equatable, Sendable {
    case ok(nextState: State, command: Command)
    case rejected(nextState: State, error: KharismaProtocolError)
}

public func reduceMain(state: MainChannelState, contentType: ContentTypeID, helloRole: AuthenticatedRole? = nil) -> ChannelTransition<MainChannelState, MainChannelCommand> {
    if contentType == ContentTypes.hello {
        guard let helloRole else {
            return .rejected(nextState: state, error: KharismaProtocolError(.malformed, "hello/1 missing role"))
        }
        return .ok(nextState: .authenticated(helloRole), command: .authenticate(helloRole))
    }

    if contentType == ContentTypes.listGroupsRequest {
        return .ok(nextState: state, command: .listGroups)
    }
    if contentType == ContentTypes.skillRequest {
        return .ok(nextState: state, command: .skill)
    }
    if contentType == ContentTypes.walletStatusRequest {
        return .ok(nextState: state, command: .walletStatus)
    }
    if contentType == ContentTypes.identitySubmit {
        return .ok(nextState: state, command: .submitIdentity)
    }
    if contentType == ContentTypes.humanSubmit {
        return .ok(nextState: state, command: .submitHuman)
    }
    if contentType == ContentTypes.humanAgentSubmit {
        return .ok(nextState: state, command: .submitHumanAgent)
    }

    if state == .new {
        return .rejected(nextState: state, error: KharismaProtocolError(.malformed, "first message on this DM must be hello/1"))
    }

    if contentType == ContentTypes.createGroupRequest {
        if case .authenticated(.human) = state {
            return .ok(nextState: state, command: .createGroup)
        }
        return .rejected(nextState: state, error: KharismaProtocolError(.unauthorizedRole, "only role H may create groups"))
    }

    return .rejected(nextState: state, error: KharismaProtocolError(.unknownType, "unsupported content type on main channel: \(contentType.authorityID)/\(contentType.typeID)"))
}

public enum SyncChannelState: Equatable, Sendable {
    case new
    case joined
    case rejected
}

public enum SyncChannelCommand: Equatable, Sendable {
    case walletStatus
    case skill
    case submitIdentity
    case submitHuman
    case submitHumanAgent
    case investmentConfig
    case investmentSubmit
    case threadCatalog
    case attemptJoin
}

public func reduceSync(state: SyncChannelState, contentType: ContentTypeID) -> ChannelTransition<SyncChannelState, SyncChannelCommand> {
    if contentType == ContentTypes.walletStatusRequest {
        return .ok(nextState: state, command: .walletStatus)
    }
    if contentType == ContentTypes.skillRequest {
        return .ok(nextState: state, command: .skill)
    }
    if contentType == ContentTypes.investmentConfigRequest {
        return .ok(nextState: state, command: .investmentConfig)
    }
    if contentType == ContentTypes.investmentSubmit {
        return .ok(nextState: state, command: .investmentSubmit)
    }
    if contentType == ContentTypes.threadCatalogRequest {
        guard state == .joined else {
            return .rejected(nextState: state, error: KharismaProtocolError(.verificationRequired, "join this group before requesting its thread catalog"))
        }
        return .ok(nextState: state, command: .threadCatalog)
    }
    if contentType == ContentTypes.identitySubmit {
        return reducePreJoinVerification(state: state, command: .submitIdentity)
    }
    if contentType == ContentTypes.humanSubmit {
        return reducePreJoinVerification(state: state, command: .submitHuman)
    }
    if contentType == ContentTypes.humanAgentSubmit {
        return reducePreJoinVerification(state: state, command: .submitHumanAgent)
    }
    if contentType == ContentTypes.joinRequest {
        guard state != .joined else {
            return .rejected(nextState: state, error: KharismaProtocolError(.alreadyMember, "sender is already a member of this group"))
        }
        return .ok(nextState: state, command: .attemptJoin)
    }
    return .rejected(nextState: state, error: KharismaProtocolError(.unknownType, "unsupported content type on sync channel: \(contentType.authorityID)/\(contentType.typeID)"))
}

private func reducePreJoinVerification(state: SyncChannelState, command: SyncChannelCommand) -> ChannelTransition<SyncChannelState, SyncChannelCommand> {
    guard state != .joined else {
        return .rejected(nextState: state, error: KharismaProtocolError(.alreadyMember, "sender is already a member of this group"))
    }
    return .ok(nextState: state, command: command)
}

public func applySyncJoinResult(state: SyncChannelState, ok: Bool) -> SyncChannelState {
    if ok { return .joined }
    return state == .joined ? state : .rejected
}

