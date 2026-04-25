import Foundation
import KharismaWallet

actor MockSigner: KharismaSigner {
    let addressValue: String
    let accountTypeValue: WalletAccountType
    let chainIdValue: Int

    init(address: String = "0x1111111111111111111111111111111111111111", accountType: WalletAccountType = .eoa, chainId: Int = 480) {
        self.addressValue = address
        self.accountTypeValue = accountType
        self.chainIdValue = chainId
    }

    var address: String { addressValue }
    var accountType: WalletAccountType { accountTypeValue }
    var chainId: Int { chainIdValue }

    func signPersonalMessage(_ message: Data) async throws -> String {
        "0xmock\(message.count)"
    }

    func sendTransaction(_ request: WalletTransactionRequest) async throws -> WalletTransactionResult {
        WalletTransactionResult(txHash: "0xmocktx\(request.chainId)")
    }
}
