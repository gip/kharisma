import Foundation

public struct XMTPWalletSignature: Equatable, Sendable {
    public let walletAddress: String
    public let signatureHex: String

    public init(walletAddress: String, signatureHex: String) {
        self.walletAddress = walletAddress
        self.signatureHex = signatureHex
    }
}

public struct XMTPSigningAdapter: Sendable {
    private let signer: any KharismaSigner

    public init(signer: any KharismaSigner) {
        self.signer = signer
    }

    public func sign(_ message: Data) async throws -> XMTPWalletSignature {
        let address = await signer.address
        let signature = try await signer.signPersonalMessage(message)
        return XMTPWalletSignature(walletAddress: address, signatureHex: signature)
    }
}

