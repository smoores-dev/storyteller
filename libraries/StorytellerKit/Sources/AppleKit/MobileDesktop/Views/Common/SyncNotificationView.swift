#if os(iOS) || os(macOS)
import SwiftUI

struct SyncNotificationView: View {
    let notification: SyncNotification
    let onDismiss: () -> Void
    var onIgnore: (([BookID]) -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            icon
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(iconColor)
                .frame(width: 32, height: 32)

            Text(notification.message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            if !notification.failedBookIDs.isEmpty {
                Button {
                    onIgnore?(notification.failedBookIDs)
                } label: {
                    Text("Ignore")
                        .font(.system(size: 13, weight: .medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.red)
            }

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .opacity(0.8)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        #if os(macOS)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
        )
        #else
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(.systemBackground))
        )
        #endif
        .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var icon: some View {
        switch notification.type {
            case .success:
                Image(systemName: "checkmark.circle.fill")
            case .queued:
                Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
            case .error:
                Image(systemName: "exclamationmark.triangle.fill")
        }
    }

    private var iconColor: Color {
        switch notification.type {
            case .success:
                .green
            case .queued:
                .orange
            case .error:
                .red
        }
    }
}

#endif
