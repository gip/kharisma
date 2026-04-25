import XCTest
@testable import KharismaProtocol

final class CodecTests: XCTestCase {
    func testContentTypeIDsMatchProtocolPackage() {
        XCTAssertEqual(ContentTypes.walletStatusRequest.typeID, "wallet-status-request")
        XCTAssertEqual(ContentTypes.walletStatusRequest.versionMajor, 2)
        XCTAssertEqual(ContentTypes.hello.typeID, "hello")
        XCTAssertEqual(ContentTypes.all.count, 25)
    }

    func testHelloRoundTripUsesProtocolWireShape() throws {
        let payload = HelloPayload(role: .human, walletAddress: "0x1111111111111111111111111111111111111111")
        let data = try KharismaCodecs.hello.encode(payload)
        XCTAssertEqual(String(data: data, encoding: .utf8), #"{"role":"H","walletAddress":"0x1111111111111111111111111111111111111111"}"#)
        XCTAssertEqual(try KharismaCodecs.hello.decode(data), payload)
    }

    func testJoinResponseDiscriminatedUnionRoundTrip() throws {
        let payload = JoinResponsePayload.ok(groupId: "g1", name: "Ada", conversationId: "c1")
        let data = try KharismaCodecs.joinResponse.encode(payload)
        XCTAssertEqual(try KharismaCodecs.joinResponse.decode(data), payload)
    }
}

