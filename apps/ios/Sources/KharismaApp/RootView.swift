import SwiftUI
import KharismaFeatures

public struct RootView: View {
    @Environment(KharismaAppModel.self) private var model

    public init() {}

    public var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            GroupDetailView()
        }
    }
}

private struct SidebarView: View {
    @Environment(KharismaAppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        List(selection: Binding(
            get: { model.selectedGroup?.groupId },
            set: { groupId in
                guard let group = model.groups.first(where: { $0.groupId == groupId }) else { return }
                Task { await model.join(group) }
            }
        )) {
            Section {
                switch model.phase {
                case .signedOut:
                    EmailOTPLoginView()
                    Button("Connect external wallet") {
                        Task { await model.connectExternalWallet(requiredChainIds: [480, 8453]) }
                    }
                    if let error = model.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                case .connectingWallet:
                    Label("Connecting wallet", systemImage: "wallet.pass")
                case .bootstrappingXMTP:
                    Label("Starting XMTP", systemImage: "message")
                case .ready:
                    if let walletAddress = model.walletAddress {
                        Text(walletAddress)
                            .font(.caption)
                            .textSelection(.enabled)
                    }
                    Button("Refresh") {
                        Task { try? await model.refreshGroups() }
                    }
                case .failed:
                    if let error = model.errorMessage {
                        Text(error).foregroundStyle(.red)
                    }
                    Button("Retry") {
                        Task { await model.signInWithPrivy() }
                    }
                }
            }

            Section("Groups") {
                ForEach(model.groups) { group in
                    NavigationLink(value: group.groupId) {
                        VStack(alignment: .leading) {
                            Text(group.title)
                            Text("\(group.memberCount)/\(group.maxMembers) members")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Kharisma")
    }
}

private struct EmailOTPLoginView: View {
    @Environment(KharismaAppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        VStack(alignment: .leading, spacing: 10) {
            TextField("Email", text: $model.loginEmail)
                .textContentType(.emailAddress)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                #endif
                .disabled(isBusy)

            switch model.emailOTPPhase {
            case .enteringEmail:
                Button("Send email code") {
                    Task { await model.sendPrivyEmailCode() }
                }
            case .sendingCode:
                Label("Sending code", systemImage: "envelope")
            case .enteringCode:
                TextField("Code", text: $model.loginCode)
                    .textContentType(.oneTimeCode)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    #endif
                HStack {
                    Button("Verify") {
                        Task { await model.verifyPrivyEmailCode() }
                    }
                    Button("Resend") {
                        Task { await model.sendPrivyEmailCode() }
                    }
                    .buttonStyle(.borderless)
                }
            case .verifyingCode:
                Label("Verifying code", systemImage: "checkmark.shield")
            }
        }
    }

    private var isBusy: Bool {
        switch model.emailOTPPhase {
        case .sendingCode, .verifyingCode:
            return true
        case .enteringEmail, .enteringCode:
            return false
        }
    }
}

private struct GroupDetailView: View {
    @Environment(KharismaAppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            if let group = model.selectedGroup {
                VStack(alignment: .leading, spacing: 8) {
                    Text(group.title).font(.title2).bold()
                    Text(group.description).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()

                List(model.messages) { message in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(message.text)
                        Text(message.senderInboxId)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    TextField("Message", text: $model.composeText)
                        .textFieldStyle(.roundedBorder)
                    Button("Send") {
                        Task { await model.sendComposedMessage() }
                    }
                }
                .padding()
            } else {
                ContentUnavailableView("Select a group", systemImage: "person.3")
            }
        }
    }
}
