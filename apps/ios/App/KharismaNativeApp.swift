import SwiftUI
import KharismaApp
import KharismaFeatures
import KharismaWallet
import KharismaXMTP

@main
struct KharismaNativeApp: App {
    @State private var model = KharismaAppModel(
        configuration: XMTPClientConfiguration(
            environment: AppConfig.xmtpEnvironment,
            appVersion: AppConfig.appVersion,
            mainServiceInboxId: AppConfig.mainServiceInboxId
        ),
        privyProvider: ProductionPrivyWalletProvider(
            configuration: PrivyWalletConfiguration(
                appId: AppConfig.privyAppId,
                appClientId: AppConfig.privyAppClientId,
                defaultChainId: AppConfig.defaultChainId
            )
        ),
        walletConnectProvider: ProductionWalletConnectProvider(
            configuration: ReownWalletConfiguration(
                projectId: AppConfig.reownProjectId,
                requiredChainIds: AppConfig.supportedChainIds
            )
        ),
        xmtpClientFactory: ProductionXMTPClientFactory()
    )

    init() {
        AppConfig.validateOrFail()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

private enum AppConfig {
    static var mainServiceInboxId: String {
        string("KHARISMA_MAIN_SERVICE_INBOX_ID", fallback: "configure-main-service-inbox-id")
    }

    static var privyAppId: String {
        string("KHARISMA_PRIVY_APP_ID", fallback: "configure-privy-app-id")
    }

    static var privyAppClientId: String {
        string("KHARISMA_PRIVY_APP_CLIENT_ID", fallback: "configure-privy-app-client-id")
    }

    static var reownProjectId: String {
        string("KHARISMA_REOWN_PROJECT_ID", fallback: "configure-reown-project-id")
    }

    static var defaultChainId: Int {
        int("KHARISMA_DEFAULT_CHAIN_ID", fallback: 480)
    }

    static var supportedChainIds: [Int] {
        string("KHARISMA_SUPPORTED_CHAIN_IDS", fallback: "480,8453")
            .split(separator: ",")
            .compactMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }

    static var appVersion: String {
        string("KHARISMA_APP_VERSION", fallback: "kharisma-ios/0.1.0")
    }

    static var xmtpEnvironment: XMTPEnvironment {
        XMTPEnvironment(rawValue: string("KHARISMA_XMTP_ENV", fallback: "dev")) ?? .dev
    }

    static func validateOrFail() {
        #if !DEBUG
        let requiredValues = [
            ("KHARISMA_MAIN_SERVICE_INBOX_ID", mainServiceInboxId),
            ("KHARISMA_PRIVY_APP_ID", privyAppId),
            ("KHARISMA_PRIVY_APP_CLIENT_ID", privyAppClientId),
            ("KHARISMA_REOWN_PROJECT_ID", reownProjectId)
        ]
        let placeholderKeys = requiredValues
            .filter { _, value in value.hasPrefix("configure-") || value.isEmpty }
            .map { $0.0 }

        precondition(placeholderKeys.isEmpty, "Missing required Kharisma iOS configuration: \(placeholderKeys.joined(separator: ", "))")
        #endif
    }

    private static func string(_ key: String, fallback: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty,
              !value.hasPrefix("$(")
        else {
            return fallback
        }
        return value
    }

    private static func int(_ key: String, fallback: Int) -> Int {
        Int(string(key, fallback: "\(fallback)")) ?? fallback
    }
}
