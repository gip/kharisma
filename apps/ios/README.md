# Kharisma iOS

Native Swift implementation of the mobile Kharisma client. This package is the first implementation slice for replacing mobile web plus `clients-service` with an app-owned wallet, signer, XMTP client, protocol state machine, and feature layer.

## Structure

- `KharismaApp`: SwiftUI application shell.
- `KharismaWallet`: wallet/signing abstraction plus Privy and WalletConnect integration boundaries.
- `KharismaXMTP`: app-owned XMTP lifecycle, storage paths, and local client facade.
- `KharismaProtocol`: Swift port of Kharisma wire models, content type IDs, JSON codecs, and pure reducers from `packages/protocol`.
- `KharismaFeatures`: view models and use cases for onboarding, groups, joins, chat, and investments.

## Current SDK Policy

Privy is the primary native wallet path. Privy's current Swift SDK requires iOS 17 and Xcode 16, so this package targets iOS 17+. WalletConnect/Reown remains the external wallet path. MetaMask and Coinbase/Base wallets should be reached through WalletConnect first.

The package now links the production SDK dependency lines directly:

- XMTP iOS from `https://github.com/xmtp/xmtp-ios`
- Privy Swift from `https://github.com/privy-io/privy-ios`
- Reown Swift from `https://github.com/reown-com/reown-swift`

The concrete SDK adapters stay isolated behind provider protocols. Test doubles live under test targets only; the app target is wired to `ProductionPrivyWalletProvider`, `ProductionWalletConnectProvider`, and `ProductionXMTPClientFactory`.

Privy email OTP is the first native login flow. The app sends codes through `privy.email.sendCode(to:)`, verifies them through `privy.email.loginWithCode(_:sentTo:)`, then creates or reuses the embedded Ethereum wallet before XMTP bootstrap.

Current implementation caveat: Privy email OTP and XMTP are wired as production code paths, but WalletConnect/Reown session UI and full XMTP response correlation are still incomplete. The app requires real SDK credentials and a real Kharisma main service inbox before it can complete end-to-end flows.

## Commands

```sh
swift test --package-path apps/ios
swift build --package-path apps/ios
pnpm build:ios:app
```

## Running In Simulator

Open `apps/ios/Kharisma.xcodeproj` in Xcode, choose the shared `Kharisma` scheme, select an iPhone simulator, and press Run.

The Xcode target reads app configuration from:

- `Config/Debug.xcconfig`
- `Config/Release.xcconfig`

Those values are injected into the generated `Info.plist` and read through `Bundle.main`. Keep only public client configuration there; do not put private keys or server secrets in the app bundle.

Release builds assert that these required values are not left as `configure-*` placeholders:

- `KHARISMA_MAIN_SERVICE_INBOX_ID`
- `KHARISMA_PRIVY_APP_ID`
- `KHARISMA_PRIVY_APP_CLIENT_ID`
- `KHARISMA_REOWN_PROJECT_ID`
