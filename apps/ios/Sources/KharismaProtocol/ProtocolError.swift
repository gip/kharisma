import Foundation

public enum ProtocolErrorCode: String, Codable, Sendable, CaseIterable {
    case unauthorizedRole = "unauthorized-role"
    case notRegistered = "not-registered"
    case verificationRequired = "verification-required"
    case verificationOrder = "verification-order"
    case unknownType = "unknown-type"
    case malformed
    case nameInvalid = "name-invalid"
    case nameTaken = "name-taken"
    case alreadyMember = "already-member"
    case groupNotFound = "group-not-found"
    case groupFull = "group-full"
    case internalError = "internal"
}

public struct KharismaProtocolError: Error, Codable, Equatable, Sendable {
    public let code: ProtocolErrorCode
    public let message: String

    public init(_ code: ProtocolErrorCode, _ message: String) {
        self.code = code
        self.message = message
    }
}

