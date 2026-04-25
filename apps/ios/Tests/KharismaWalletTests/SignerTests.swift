import XCTest
@testable import KharismaWallet

final class SignerTests: XCTestCase {
    func testXMTPAdapterSignsWithWalletAddress() async throws {
        let signer = MockSigner(address: "0xabc", chainId: 480)
        let adapter = XMTPSigningAdapter(signer: signer)
        let signature = try await adapter.sign(Data("hello".utf8))
        XCTAssertEqual(signature.walletAddress, "0xabc")
        XCTAssertEqual(signature.signatureHex, "0xmock5")
    }
}

