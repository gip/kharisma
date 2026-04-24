---
name: wallet-signer-architecture
description: TypeScript reference for wallet login and signing across web/mobile web and World Mini Apps with MetaMask, Coinbase Wallet, Privy, MiniKit-derived keys, login persistence, key export, and a universal signer for XMTP.
---

# Wallet & Signer Integration SKILL

_Last updated: 2026-04-07_

This document defines the recommended TypeScript architecture for a wallet/signing stack that must work in two environments:

1. **Web / mobile web**: support external wallets such as **MetaMask** and **Coinbase Wallet**, plus **Privy** for social login and embedded wallets.
2. **World Mini App**: authenticate with `walletAuth()`, derive an app-scoped private key from a signed message, and expose a common signer interface.

It also covers:

- remembering the latest login method after logout,
- exporting the Mini App–derived key,
- a universal signer abstraction that can be used for **XMTP** or generic message signing,
- a concrete package baseline using current package versions as of 2026-04-07.

---

## 1) Recommended stack

### Primary libraries

```bash
pnpm add react react-dom typescript
pnpm add wagmi viem @wagmi/connectors
pnpm add @privy-io/react-auth @privy-io/wagmi
pnpm add @worldcoin/minikit-js @worldcoin/minikit-react
pnpm add @xmtp/browser-sdk
pnpm add @noble/hashes @noble/curves
```

### Version baseline

Use the latest stable releases available now:

- `wagmi`: **3.6.0** (the GitHub releases page already shows **3.6.1** released on 2026-04-06, so pinning `^3.6.1` is reasonable if your lockfile resolves it)
- `@wagmi/core`: **3.4.2**
- `@wagmi/connectors`: **8.0.1**
- `viem`: **2.47.10**
- `@privy-io/react-auth`: **3.18.0**
- `@privy-io/wagmi`: **4.0.3**
- `@worldcoin/minikit-js`: **1.11.0**
- `@worldcoin/minikit-react`: **1.9.12**
- `@xmtp/browser-sdk`: **6.5.0**

### Why this stack

- **wagmi + viem** provide the cleanest EIP-1193 and account tooling layer for web wallets.
- **Privy** covers social login + embedded wallet UX on web and mobile web.
- **MiniKit** is the native interface inside World App.
- **XMTP Browser SDK** is the browser-facing SDK for chat clients.
- **noble** packages are the simplest audited building blocks for HKDF/hash/curve utilities in the browser.

---

## 2) Core design decisions

### Web/mobile web

Use **wagmi** as the connection layer for:

- MetaMask
- Coinbase Wallet
- injected EIP-1193 wallets in general

Use **Privy** in parallel for:

- email / Google / Apple / social login
- embedded wallet creation
- a provider-backed signer when the user chooses the Privy path

### World Mini App

Inside World App, do **not** pretend MiniKit is just another injected provider.

Instead:

1. authenticate with `MiniKit.walletAuth()`;
2. request an EIP-191 signature with `MiniKit.signMessage()` over a canonical message;
3. derive an app-scoped secp256k1 private key from that signature;
4. wrap the result in the same `UniversalSigner` interface used everywhere else.

This gives you one app-scoped signer for XMTP and generic message signing.

### Exporting the derived key

Export is possible, but with an important limitation:

- you **can** export the raw private key or an encrypted JSON/keystore from your app;
- you **cannot** generally auto-import it into MetaMask or Coinbase Wallet from the browser.

So the realistic flow is:

- show **Export private key** or **Export encrypted JSON**,
- user manually imports it in the destination wallet.

---

## 3) Project structure

```text
src/
  auth/
    login-method.ts
  wallet/
    wagmi.ts
    privy.ts
    minikit.ts
    universal-signer.ts
    derived-key.ts
    export.ts
  xmtp/
    signer-to-xmtp.ts
```

---

## 4) Login method persistence

Persist the last successful login method, and keep it even after logout.

### Supported login methods

```ts
// src/auth/login-method.ts
export type LoginMethod =
  | 'metamask'
  | 'coinbase'
  | 'privy-google'
  | 'privy-email'
  | 'privy-wallet'
  | 'world-miniapp';

const LAST_LOGIN_METHOD_KEY = 'app:last-login-method';

export function setLastLoginMethod(method: LoginMethod) {
  localStorage.setItem(LAST_LOGIN_METHOD_KEY, method);
}

export function getLastLoginMethod(): LoginMethod | null {
  const value = localStorage.getItem(LAST_LOGIN_METHOD_KEY);
  return (value as LoginMethod | null) ?? null;
}

export function clearSessionButKeepLoginHint() {
  // intentionally do not remove LAST_LOGIN_METHOD_KEY
  sessionStorage.clear();
  // remove app auth/session tokens here
}
```

### UX rule

On app boot:

- read `getLastLoginMethod()`;
- show it as the default/recommended reconnect option;
- never silently reconnect to a wallet the user explicitly disconnected, unless that is a product decision.

---

## 5) Web wallet connections with wagmi

Use wagmi connectors for MetaMask and Coinbase Wallet.

```ts
// src/wallet/wagmi.ts
import { createConfig, http } from 'wagmi';
import { mainnet, base, optimism } from 'wagmi/chains';
import { injected, coinbaseWallet } from '@wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, base, optimism],
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'My App',
      preference: 'smartWalletOnly',
    }),
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    [optimism.id]: http(process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL),
  },
});
```

A selector can connect either wallet explicitly:

```ts
// src/wallet/connect-web-wallet.ts
import { connect } from '@wagmi/core';
import { wagmiConfig } from './wagmi';
import { setLastLoginMethod } from '@/auth/login-method';

export async function connectMetaMask() {
  const connector = wagmiConfig.connectors.find((x) => x.id === 'injected');
  if (!connector) throw new Error('MetaMask connector not configured');
  const result = await connect(wagmiConfig, { connector });
  setLastLoginMethod('metamask');
  return result;
}

export async function connectCoinbase() {
  const connector = wagmiConfig.connectors.find((x) => x.id === 'coinbaseWalletSDK');
  if (!connector) throw new Error('Coinbase connector not configured');
  const result = await connect(wagmiConfig, { connector });
  setLastLoginMethod('coinbase');
  return result;
}
```

---

## 6) Privy for social login

Wrap the app with `PrivyProvider` and enable embedded wallets.

```tsx
// src/wallet/privy.tsx
import { PrivyProvider } from '@privy-io/react-auth';

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['google', 'email', 'wallet'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        appearance: {
          theme: 'light',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

Login helpers:

```ts
// src/wallet/privy-login.ts
import { useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { setLastLoginMethod } from '@/auth/login-method';

export function usePrivyGoogleLogin() {
  const { login } = useLogin({
    onComplete: () => setLastLoginMethod('privy-google'),
  });

  return () => login({ loginMethod: 'google' });
}

export function usePrivyEmailLogin() {
  const { login } = useLogin({
    onComplete: () => setLastLoginMethod('privy-email'),
  });

  return () => login({ loginMethod: 'email' });
}

export function usePrimaryPrivyWallet() {
  const { wallets } = useWallets();
  return wallets[0] ?? null;
}
```

Get a standard EIP-1193 provider from Privy:

```ts
// src/wallet/privy-provider.ts
import type { ConnectedWallet } from '@privy-io/react-auth';

export async function getPrivyProvider(wallet: ConnectedWallet) {
  return wallet.getEthereumProvider();
}
```

---

## 7) Mini App flow: derive a private key from a signed message

### Security model

The derivation should be:

- **app-scoped**,
- **stable per wallet**,
- **different across environments/apps**,
- **domain separated**.

### Canonical message

Use a canonical string like this:

```ts
// src/wallet/minikit-message.ts
export function buildMiniAppDerivationMessage(input: {
  appId: string;
  appDomain: string;
  purpose: 'xmtp' | 'universal-signer';
  version: number;
  nonce: string;
}) {
  return [
    'Derive app-scoped key',
    `app_id: ${input.appId}`,
    `domain: ${input.appDomain}`,
    `purpose: ${input.purpose}`,
    `version: ${input.version}`,
    `nonce: ${input.nonce}`,
  ].join('\n');
}
```

The nonce should come from your backend if you want replay resistance or server-side verification linkage. If you need a deterministic key that survives sessions, keep the nonce fixed per `(wallet, app, purpose, version)` record on your backend, not random per request.

### Derivation function

```ts
// src/wallet/derived-key.ts
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes, utf8ToBytes } from 'viem';

function normalizeSignatureHex(signature: `0x${string}`): Uint8Array {
  return hexToBytes(signature);
}

function toValidSecp256k1PrivateKey(bytes: Uint8Array): `0x${string}` {
  const n = secp256k1.CURVE.n;
  let value = BigInt('0x' + bytesToHex(bytes));

  // reduce into [1, n-1]
  value = (value % (n - 1n)) + 1n;
  const hex = value.toString(16).padStart(64, '0');
  return `0x${hex}`;
}

export function derivePrivateKeyFromMiniAppSignature(input: {
  signature: `0x${string}`;
  appId: string;
  purpose: 'xmtp' | 'universal-signer';
  version: number;
}) {
  const ikm = normalizeSignatureHex(input.signature);
  const salt = utf8ToBytes(`world-miniapp:${input.appId}`);
  const info = utf8ToBytes(`purpose:${input.purpose}:v${input.version}`);

  const okm = hkdf(sha256, ikm, salt, info, 32);
  return toValidSecp256k1PrivateKey(okm);
}
```

### Why derive from the signature, not the plaintext message

Because the signed message binds the output to the wallet actually controlled by the user in World App. The message alone is public text; the signature is the user-specific secret material available to your app after consent.

### Mini App auth + derive

```ts
// src/wallet/minikit.ts
import { MiniKit } from '@worldcoin/minikit-js';
import { privateKeyToAccount } from 'viem/accounts';
import { setLastLoginMethod } from '@/auth/login-method';
import { buildMiniAppDerivationMessage } from './minikit-message';
import { derivePrivateKeyFromMiniAppSignature } from './derived-key';

export async function createMiniAppDerivedAccount() {
  const authResult = await MiniKit.walletAuth();
  if (authResult.finalPayload.status !== 'success') {
    throw new Error('MiniKit wallet auth failed');
  }

  const nonce = 'stable-xmtp-derivation-v1'; // ideally from backend
  const message = buildMiniAppDerivationMessage({
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID!,
    appDomain: window.location.host,
    purpose: 'xmtp',
    version: 1,
    nonce,
  });

  const signatureResult = await MiniKit.signMessage({ message });
  if (signatureResult.finalPayload.status !== 'success') {
    throw new Error('MiniKit signMessage failed');
  }

  const privateKey = derivePrivateKeyFromMiniAppSignature({
    signature: signatureResult.finalPayload.signature as `0x${string}`,
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID!,
    purpose: 'xmtp',
    version: 1,
  });

  const account = privateKeyToAccount(privateKey);
  setLastLoginMethod('world-miniapp');

  return {
    privateKey,
    account,
    walletAddress: authResult.finalPayload.address,
  };
}
```

---

## 8) Exporting the Mini App–derived key

### Recommended export formats

Support two export modes:

1. **raw hex private key** for advanced users;
2. **encrypted JSON** for safer transport/storage.

### Raw export

```ts
// src/wallet/export.ts
export function exportRawPrivateKey(privateKey: `0x${string}`) {
  return privateKey;
}
```

### Encrypted JSON export

This is preferable to copying raw key material.

```ts
// src/wallet/export-json.ts
import { randomBytes } from 'crypto';

export async function encryptPrivateKeyForExport(
  privateKey: `0x${string}`,
  password: string,
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(privateKey),
  );

  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: 600_000,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
}
```

### Product note

Do not promise one-click import into MetaMask/Coinbase Wallet from browser JS. The realistic browser-side UX is:

- export key,
- show wallet-specific instructions,
- user imports manually.

---

## 9) Universal signer interface

This is the key abstraction.

```ts
// src/wallet/universal-signer.ts
export type Hex = `0x${string}`;

export interface UniversalSigner {
  kind: 'eip1193' | 'local-account';
  getAddress(): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  signTypedData?<TTypedData extends Record<string, unknown>>(typedData: TTypedData): Promise<Hex>;
}
```

### EIP-1193 adapter

This covers MetaMask, Coinbase Wallet, and Privy.

```ts
// src/wallet/eip1193-signer.ts
import type { UniversalSigner, Hex } from './universal-signer';
import { bytesToHex, stringToBytes } from 'viem';

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class Eip1193Signer implements UniversalSigner {
  kind = 'eip1193' as const;

  constructor(
    private readonly provider: Eip1193Provider,
    private readonly address: Hex,
  ) {}

  async getAddress(): Promise<Hex> {
    return this.address;
  }

  async signMessage(message: string): Promise<Hex> {
    const messageHex = bytesToHex(stringToBytes(message));
    const signature = await this.provider.request({
      method: 'personal_sign',
      params: [messageHex, this.address],
    });
    return signature as Hex;
  }

  async signTypedData<TTypedData extends Record<string, unknown>>(typedData: TTypedData): Promise<Hex> {
    const signature = await this.provider.request({
      method: 'eth_signTypedData_v4',
      params: [this.address, JSON.stringify(typedData)],
    });
    return signature as Hex;
  }
}
```

### Local-account adapter

This covers the Mini App–derived key.

```ts
// src/wallet/local-account-signer.ts
import type { Account } from 'viem';
import { hashMessage, serializeTypedData } from 'viem';
import type { UniversalSigner, Hex } from './universal-signer';

export class LocalAccountSigner implements UniversalSigner {
  kind = 'local-account' as const;

  constructor(private readonly account: Account) {}

  async getAddress(): Promise<Hex> {
    return this.account.address;
  }

  async signMessage(message: string): Promise<Hex> {
    return this.account.signMessage({ message });
  }

  async signTypedData<TTypedData extends Record<string, unknown>>(typedData: TTypedData): Promise<Hex> {
    return this.account.signTypedData(typedData as never);
  }
}
```

### Factory helpers

```ts
// src/wallet/signer-factory.ts
import { privateKeyToAccount } from 'viem/accounts';
import { Eip1193Signer } from './eip1193-signer';
import { LocalAccountSigner } from './local-account-signer';

export async function signerFromPrivy(wallet: {
  address: `0x${string}`;
  getEthereumProvider(): Promise<{ request(args: { method: string; params?: unknown[] }): Promise<unknown> }>;
}) {
  const provider = await wallet.getEthereumProvider();
  return new Eip1193Signer(provider, wallet.address);
}

export function signerFromPrivateKey(privateKey: `0x${string}`) {
  return new LocalAccountSigner(privateKeyToAccount(privateKey));
}
```

---

## 10) Universal signer selection

```ts
// src/wallet/resolve-signer.ts
import { createMiniAppDerivedAccount } from './minikit';
import { signerFromPrivateKey, signerFromPrivy } from './signer-factory';
import { Eip1193Signer } from './eip1193-signer';

export async function resolveUniversalSigner(input:
  | { type: 'privy'; wallet: any }
  | { type: 'eip1193'; provider: any; address: `0x${string}` }
  | { type: 'world-miniapp' }
) {
  switch (input.type) {
    case 'privy':
      return signerFromPrivy(input.wallet);
    case 'eip1193':
      return new Eip1193Signer(input.provider, input.address);
    case 'world-miniapp': {
      const { privateKey } = await createMiniAppDerivedAccount();
      return signerFromPrivateKey(privateKey);
    }
  }
}
```

---

## 11) Hooking the universal signer into XMTP

The exact XMTP signer adapter surface changes more often than the wallet layer, so isolate it behind one translation boundary.

```ts
// src/xmtp/signer-to-xmtp.ts
import type { UniversalSigner } from '@/wallet/universal-signer';

export async function createXmtpIdentity(signer: UniversalSigner) {
  const address = await signer.getAddress();

  return {
    type: 'EOA',
    address,
    signMessage: async (message: string) => signer.signMessage(message),
  };
}
```

The important architectural choice is not the exact helper shape but the rule:

- the rest of the app only talks to `UniversalSigner`;
- XMTP integration code translates from `UniversalSigner` into whatever the current XMTP SDK expects.

---

## 12) End-to-end login picker example

```tsx
// src/components/LoginPicker.tsx
import { getLastLoginMethod } from '@/auth/login-method';
import { connectMetaMask, connectCoinbase } from '@/wallet/connect-web-wallet';
import { usePrivyGoogleLogin, usePrivyEmailLogin } from '@/wallet/privy-login';
import { MiniKit } from '@worldcoin/minikit-js';

export function LoginPicker() {
  const preferred = typeof window !== 'undefined' ? getLastLoginMethod() : null;
  const loginWithGoogle = usePrivyGoogleLogin();
  const loginWithEmail = usePrivyEmailLogin();

  return (
    <div>
      <p>Last used: {preferred ?? 'none'}</p>

      <button onClick={() => connectMetaMask()}>Continue with MetaMask</button>
      <button onClick={() => connectCoinbase()}>Continue with Coinbase Wallet</button>
      <button onClick={() => loginWithGoogle()}>Continue with Google</button>
      <button onClick={() => loginWithEmail()}>Continue with Email</button>

      {MiniKit.isInstalled() && (
        <button onClick={() => {/* resolveUniversalSigner({ type: 'world-miniapp' }) */}}>
          Continue with World App
        </button>
      )}
    </div>
  );
}
```

---

## 13) Operational guidance

### Web/mobile web

Prefer this order:

1. Privy social login
2. Coinbase Wallet
3. MetaMask

Reason: on mobile web, Privy gives the smoothest in-browser flow; external wallets often switch apps or deep-link.

### Mini App

Prefer this order:

1. `walletAuth()`
2. derive app-scoped key from `signMessage()`
3. wrap as local account signer
4. offer optional export

### Export UX

Offer:

- `Copy private key`
- `Download encrypted JSON`
- `How to import into MetaMask`
- `How to import into Coinbase Wallet`

### Logout UX

Logout should:

- clear session/auth tokens,
- disconnect providers if needed,
- keep `last-login-method` intact.

---

## 14) Security notes

1. **Do not derive the Mini App key from public text alone.** Derive from the **signature**, not just the message.
2. **Do not use one random nonce per launch** if you want a stable exported identity. Stability requires a stable derivation input.
3. **Do not auto-export private keys** without an explicit user action and confirmation.
4. **Do not store raw derived private keys in localStorage.** If persistence is required, encrypt them first.
5. **Do not let the rest of the app depend directly on wallet SDKs.** Depend only on `UniversalSigner`.

---

## 15) Final recommendation

### Web/mobile web

- Use **wagmi + viem** for MetaMask / Coinbase Wallet.
- Use **Privy** for social login and embedded wallets.
- Convert all provider-backed wallets into `Eip1193Signer`.

### Mini App

- Use **MiniKit.walletAuth()** for authentication.
- Use **MiniKit.signMessage()** with a canonical derivation statement.
- Derive a secp256k1 private key from the resulting signature using **HKDF-SHA256** with domain separation.
- Wrap the derived account in `LocalAccountSigner`.
- Offer manual export only.

### Shared abstraction

Everything in the application, including XMTP, should depend on exactly one surface:

```ts
interface UniversalSigner {
  getAddress(): Promise<`0x${string}`>;
  signMessage(message: string): Promise<`0x${string}`>;
  signTypedData?(typedData: unknown): Promise<`0x${string}`>;
}
```

That is the architecture that keeps the product simple while still supporting:

- MetaMask
- Coinbase Wallet
- Privy
- World Mini App
- exported app-scoped keys
- XMTP integration

