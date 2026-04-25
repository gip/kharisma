import XCTest
import KharismaProtocol
import KharismaWallet
@testable import KharismaXMTP

final class LocalXMTPClientTests: XCTestCase {
    func testBootstrapListJoinAndSend() async throws {
        let storage = XMTPStorage(rootURL: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
        let client = FakeXMTPClientFactory().makeClient(
            configuration: XMTPClientConfiguration(mainServiceInboxId: "main"),
            signer: MockSigner(),
            storage: storage
        )

        try await client.bootstrap()
        try await client.authenticateMain(role: .human)
        let groups = try await client.listGroups(languages: ["en"])
        XCTAssertEqual(groups.count, 1)

        let conversationId = try await client.join(group: groups[0], displayName: "Ada")
        try await client.sendText("hello", conversationId: conversationId)
        let messages = try await client.messages(conversationId: conversationId)
        XCTAssertEqual(messages.map(\.text), ["Ada joined the group", "hello"])
    }
}
