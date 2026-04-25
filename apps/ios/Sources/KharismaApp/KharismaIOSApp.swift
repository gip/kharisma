import SwiftUI
import KharismaFeatures
import KharismaXMTP

public struct KharismaIOSApp: App {
    @State private var model: KharismaAppModel

    public init() {
        _model = State(initialValue: KharismaAppModel(configuration: XMTPClientConfiguration(mainServiceInboxId: "configure-main-service-inbox-id")))
    }

    public init(mainServiceInboxId: String) {
        _model = State(initialValue: KharismaAppModel(configuration: XMTPClientConfiguration(mainServiceInboxId: mainServiceInboxId)))
    }

    public var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}
