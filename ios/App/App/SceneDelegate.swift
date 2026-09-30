import UIKit
import Capacitor

@objc(ScreenProtectionPlugin)
final class ScreenProtectionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ScreenProtectionPlugin"
    let jsName = "ScreenProtection"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setProtected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isCaptured", returnType: CAPPluginReturnPromise)
    ]

    private var protectionEnabled = false
    private var privacyShield: UIView?
    private var observers: [NSObjectProtocol] = []

    @objc override func load() {
        let center = NotificationCenter.default
        observers.append(
            center.addObserver(
                forName: UIScreen.capturedDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.captureStateDidChange()
            }
        )
        observers.append(
            center.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard self?.protectionEnabled == true else { return }
                self?.showPrivacyShield()
            }
        )
        observers.append(
            center.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.updatePrivacyShield()
            }
        )
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc func setProtected(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        DispatchQueue.main.async {
            self.protectionEnabled = enabled
            self.updatePrivacyShield()
            call.resolve()
        }
    }

    @objc func isCaptured(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["isCaptured": UIScreen.main.isCaptured])
        }
    }

    private func captureStateDidChange() {
        let isCaptured = UIScreen.main.isCaptured
        notifyListeners(
            "screenCaptureChanged",
            data: ["isCaptured": isCaptured],
            retainUntilConsumed: true
        )
        updatePrivacyShield()
    }

    private func updatePrivacyShield() {
        let appIsActive = UIApplication.shared.applicationState == .active
        if protectionEnabled && !appIsActive {
            showPrivacyShield()
        } else {
            hidePrivacyShield()
        }
    }

    private func showPrivacyShield() {
        guard privacyShield == nil,
              let window = bridge?.viewController?.view.window else { return }

        let shield = UIView(frame: window.bounds)
        shield.backgroundColor = .black
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.accessibilityIdentifier = "materials-screen-protection-shield"
        window.addSubview(shield)
        privacyShield = shield
    }

    private func hidePrivacyShield() {
        privacyShield?.removeFromSuperview()
        privacyShield = nil
    }
}

final class DostupBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ScreenProtectionPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = DostupBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
