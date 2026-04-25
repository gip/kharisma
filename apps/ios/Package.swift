// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "KharismaIOS",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "KharismaApp", targets: ["KharismaApp"]),
        .library(name: "KharismaFeatures", targets: ["KharismaFeatures"]),
        .library(name: "KharismaProtocol", targets: ["KharismaProtocol"]),
        .library(name: "KharismaWallet", targets: ["KharismaWallet"]),
        .library(name: "KharismaXMTP", targets: ["KharismaXMTP"])
    ],
    dependencies: [
        .package(url: "https://github.com/xmtp/xmtp-ios", from: "4.9.0"),
        .package(url: "https://github.com/privy-io/privy-ios", branch: "main"),
        .package(url: "https://github.com/reown-com/reown-swift", branch: "develop")
    ],
    targets: [
        .target(
            name: "KharismaProtocol"
        ),
        .target(
            name: "KharismaWallet",
            dependencies: [
                .product(name: "Privy", package: "privy-ios"),
                .product(name: "WalletConnect", package: "reown-swift", condition: .when(platforms: [.iOS])),
                .product(name: "ReownAppKit", package: "reown-swift", condition: .when(platforms: [.iOS]))
            ]
        ),
        .target(
            name: "KharismaXMTP",
            dependencies: [
                "KharismaProtocol",
                "KharismaWallet",
                .product(name: "XMTPiOS", package: "xmtp-ios")
            ]
        ),
        .target(
            name: "KharismaFeatures",
            dependencies: [
                "KharismaProtocol",
                "KharismaWallet",
                "KharismaXMTP"
            ]
        ),
        .target(
            name: "KharismaApp",
            dependencies: [
                "KharismaFeatures",
                "KharismaProtocol",
                "KharismaWallet",
                "KharismaXMTP"
            ]
        ),
        .testTarget(
            name: "KharismaProtocolTests",
            dependencies: ["KharismaProtocol"]
        ),
        .testTarget(
            name: "KharismaWalletTests",
            dependencies: ["KharismaWallet"]
        ),
        .testTarget(
            name: "KharismaXMTPTests",
            dependencies: [
                "KharismaProtocol",
                "KharismaWallet",
                "KharismaXMTP"
            ]
        )
    ]
)
