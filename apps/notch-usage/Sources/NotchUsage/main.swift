import AppKit
import Combine
import DynamicNotchKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store: UsageStore
    private var notch: DynamicNotch<ExpandedView, CompactRings, CompactRings>!
    private var hoverSubscription: AnyCancellable?
    private var pendingHoverChange: Task<Void, Never>?

    // Hover intent: a pointer crossing the menu bar shouldn't open the panel; a brief exit shouldn't close it.
    private static let openDelay: Duration = .milliseconds(90)
    private static let closeDelay: Duration = .milliseconds(220)

    init(store: UsageStore) {
        self.store = store
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        let store = self.store
        notch = DynamicNotch(
            hoverBehavior: [.keepVisible],
            expanded: { ExpandedView(store: store) },
            compactLeading: { CompactRings(store: store, sevenDay: false) },
            compactTrailing: { CompactRings(store: store, sevenDay: true) }
        )
        notch.transitionConfiguration = Self.transitions()
        Task { await notch.compact() }

        hoverSubscription = notch.$isHovering
            .removeDuplicates()
            .sink { [weak self] hovering in self?.hoverChanged(hovering) }
    }

    /// Critically damped springs morph compact ⇄ expanded directly; the library default hides in between
    /// and bounces on open. Closing is quicker than opening: the user is done looking.
    private static func transitions() -> DynamicNotchTransitionConfiguration {
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            return .init(openingAnimation: .easeOut(duration: 0.15),
                         closingAnimation: .easeOut(duration: 0.12),
                         conversionAnimation: .easeOut(duration: 0.15),
                         skipIntermediateHides: true)
        }
        return .init(openingAnimation: .spring(response: 0.38, dampingFraction: 1),
                     closingAnimation: .spring(response: 0.3, dampingFraction: 1),
                     conversionAnimation: .spring(response: 0.34, dampingFraction: 1),
                     skipIntermediateHides: true)
    }

    private func hoverChanged(_ hovering: Bool) {
        pendingHoverChange?.cancel()
        pendingHoverChange = Task {
            try? await Task.sleep(for: hovering ? Self.openDelay : Self.closeDelay)
            guard !Task.isCancelled else { return }
            if hovering {
                await notch.expand()
            } else {
                await notch.compact()
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
MainActor.assumeIsolated {
    let store = CommandLine.arguments.contains("--worst-case") ? UsageStore(preview: .worstCase) : UsageStore()
    let delegate = AppDelegate(store: store)
    app.delegate = delegate
    app.run()
}
