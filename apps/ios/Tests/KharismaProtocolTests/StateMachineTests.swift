import XCTest
@testable import KharismaProtocol

final class StateMachineTests: XCTestCase {
    func testMainRequiresHelloForUnknownFirstMessage() {
        let transition = reduceMain(state: .new, contentType: ContentTypes.createGroupRequest)
        XCTAssertEqual(transition, .rejected(nextState: .new, error: KharismaProtocolError(.malformed, "first message on this DM must be hello/1")))
    }

    func testMainOnlyHumanCanCreateGroups() {
        let human = reduceMain(state: .authenticated(.human), contentType: ContentTypes.createGroupRequest)
        XCTAssertEqual(human, .ok(nextState: .authenticated(.human), command: .createGroup))

        let humanAgent = reduceMain(state: .authenticated(.humanAgent), contentType: ContentTypes.createGroupRequest)
        XCTAssertEqual(humanAgent, .rejected(nextState: .authenticated(.humanAgent), error: KharismaProtocolError(.unauthorizedRole, "only role H may create groups")))
    }

    func testSyncThreadCatalogRequiresJoinedState() {
        let rejected = reduceSync(state: .new, contentType: ContentTypes.threadCatalogRequest)
        XCTAssertEqual(rejected, .rejected(nextState: .new, error: KharismaProtocolError(.verificationRequired, "join this group before requesting its thread catalog")))

        let joined = reduceSync(state: .joined, contentType: ContentTypes.threadCatalogRequest)
        XCTAssertEqual(joined, .ok(nextState: .joined, command: .threadCatalog))
    }

    func testSyncJoinResultIsRetryableAfterFailure() {
        XCTAssertEqual(applySyncJoinResult(state: .new, ok: false), .rejected)
        XCTAssertEqual(reduceSync(state: .rejected, contentType: ContentTypes.joinRequest), .ok(nextState: .rejected, command: .attemptJoin))
    }
}

