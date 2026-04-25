import Foundation

public enum Role: String, Codable, Sendable, CaseIterable {
    case human = "H"
    case humanAgent = "HA"
    case agent = "A"
}

public enum AuthenticatedRole: String, Codable, Sendable, CaseIterable {
    case human = "H"
    case humanAgent = "HA"
}

public enum RegistrationStatus: String, Codable, Sendable, CaseIterable {
    case human = "H"
    case humanAgent = "HA"
    case agent = "A"
    case unknown = "UNKNOWN"
}

public enum VerificationLevel: String, Codable, Sendable, CaseIterable {
    case none
    case identity
    case human
    case humanAgent = "human-agent"
}

public enum GroupJoinPolicy: String, Codable, Sendable, CaseIterable {
    case humanOnly = "H_ONLY"
    case humanAndHumanAgent = "H_AND_HA"
    case humanHumanAgentAndAgent = "H_HA_AND_A"
}

