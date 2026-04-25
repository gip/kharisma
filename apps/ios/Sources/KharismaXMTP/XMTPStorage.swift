import Foundation
import CryptoKit

public struct XMTPStorage: Sendable {
    public let rootURL: URL

    public init(rootURL: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!.appending(path: "Kharisma/XMTP")) {
        self.rootURL = rootURL
    }

    public func databaseURL(walletAddress: String) throws -> URL {
        let directory = rootURL.appending(path: sanitized(walletAddress))
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "client.db3")
    }

    public func encryptionKey(walletAddress: String) throws -> Data {
        let keyURL = rootURL.appending(path: sanitized(walletAddress)).appending(path: "db.key")
        if FileManager.default.fileExists(atPath: keyURL.path) {
            return try Data(contentsOf: keyURL)
        }
        var key = Data(count: 32)
        let result = key.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
        }
        guard result == errSecSuccess else {
            throw CocoaError(.fileWriteUnknown)
        }
        try FileManager.default.createDirectory(at: keyURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try key.write(to: keyURL, options: .atomic)
        return key
    }

    private func sanitized(_ walletAddress: String) -> String {
        walletAddress.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "-", options: .regularExpression)
    }
}

