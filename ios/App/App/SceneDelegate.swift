import UIKit
import WebKit
import LocalAuthentication
import Capacitor

/**
 * ViewController principal do iOS com ponte nativa (Face ID / Touch ID + Persistência de Sessão de Interfone)
 * compatível com a mesma interface `window.SectrumAndroid` usada no React (`src/lib/nativo.ts`).
 */
class SectrumBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for instanceConfiguration)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let contentController = config.userContentController
        contentController.add(self, name: "SectrumIos")

        let temBio = Self.dispositivoTemFaceIdOuTouchId() ? "true" : "false"
        let jsBridge = """
        (function() {
          try { document.documentElement.classList.add('sectrum-ios-native'); } catch (e) {}
          window.SectrumAndroid = {
            ehAppNativo: function() { return true; },
            obterVersaoApp: function() { return '1.0.0-ios-native'; },
            salvarSessaoNativa: function(token, usuarioJson, baseUrl) {
              window.webkit.messageHandlers.SectrumIos.postMessage({
                acao: 'salvarSessao',
                token: token || '',
                usuarioJson: usuarioJson || '',
                baseUrl: baseUrl || 'https://cond.vps.seg.br'
              });
            },
            limparSessaoNativa: function() {
              window.webkit.messageHandlers.SectrumIos.postMessage({ acao: 'limparSessao' });
            },
            iniciarSireneNativa: function(tipo, titulo, mensagem, furarDnd) {
              window.webkit.messageHandlers.SectrumIos.postMessage({
                acao: 'iniciarSirene',
                tipo: tipo || 'emergencia',
                titulo: titulo || '',
                mensagem: mensagem || ''
              });
            },
            pararSireneNativa: function() {},
            iniciarToqueInterfoneNativo: function() {},
            pararToqueInterfoneNativo: function() {},
            temBiometriaNativa: function() { return \(temBio); },
            salvarCredencialBiometriaNativa: function(login, token, usuarioJson) {
              window.webkit.messageHandlers.SectrumIos.postMessage({
                acao: 'salvarBiometria',
                login: login || '',
                token: token || '',
                usuarioJson: usuarioJson || ''
              });
              return true;
            },
            autenticarBiometriaNativa: function(login, titulo, subtitulo) {
              window.webkit.messageHandlers.SectrumIos.postMessage({
                acao: 'autenticarBiometria',
                login: login || '',
                titulo: titulo || 'Face ID / Touch ID',
                subtitulo: subtitulo || 'Confirme sua identidade para acessar o Sectrum'
              });
            }
          };
        })();
        """
        let userScript = WKUserScript(source: jsBridge, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        contentController.addUserScript(userScript)
        return config
    }

    static func dispositivoTemFaceIdOuTouchId() -> Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "SectrumIos",
              let body = message.body as? [String: Any],
              let acao = body["acao"] as? String else { return }

        let defaults = UserDefaults.standard

        switch acao {
        case "salvarSessao":
            let token = (body["token"] as? String) ?? ""
            let baseUrl = (body["baseUrl"] as? String) ?? "https://cond.vps.seg.br"
            defaults.set(token, forKey: "sectrum_interfone_token")
            defaults.set(baseUrl, forKey: "sectrum_base_url")

        case "salvarBiometria":
            let login = normalizarLogin((body["login"] as? String) ?? "")
            let token = (body["token"] as? String) ?? ""
            let usuarioJson = (body["usuarioJson"] as? String) ?? ""
            if !token.isEmpty && !usuarioJson.isEmpty,
               let dataUsu = usuarioJson.data(using: .utf8),
               let objUsu = try? JSONSerialization.jsonObject(with: dataUsu) {
                let payloadObj: [String: Any] = ["token": token, "usuario": objUsu]
                if let payloadData = try? JSONSerialization.data(withJSONObject: payloadObj),
                   let payloadStr = String(data: payloadData, encoding: .utf8) {
                    defaults.set(payloadStr, forKey: "sectrum_bio_\(login)")
                    defaults.set(payloadStr, forKey: "sectrum_bio_ultima")
                }
            }

        case "autenticarBiometria":
            let login = normalizarLogin((body["login"] as? String) ?? "")
            let subtitulo = (body["subtitulo"] as? String) ?? "Acesse o Sectrum com Face ID ou Touch ID"
            let credSalva = defaults.string(forKey: "sectrum_bio_\(login)") ?? defaults.string(forKey: "sectrum_bio_ultima")
            guard let cred = credSalva, !cred.isEmpty else {
                enviarResultadoBiometria(sucesso: false, payload: "Faça login com seu CPF e senha uma primeira vez neste iPhone para ativar o Face ID.")
                return
            }
            let context = LAContext()
            context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: subtitulo) { [weak self] success, authError in
                DispatchQueue.main.async {
                    if success {
                        self?.enviarResultadoBiometria(sucesso: true, payload: cred)
                    } else {
                        self?.enviarResultadoBiometria(sucesso: false, payload: authError?.localizedDescription ?? "Face ID cancelado.")
                    }
                }
            }

        default:
            break
        }
    }

    private func normalizarLogin(_ login: String) -> String {
        let limpo = login.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let digitos = limpo.filter { $0.isNumber }
        if digitos.count == 11 { return digitos }
        return limpo.isEmpty ? "padrao" : limpo
    }

    private func enviarResultadoBiometria(sucesso: Bool, payload: String) {
        guard let dados = try? JSONSerialization.data(withJSONObject: [payload]),
              let arrStr = String(data: dados, encoding: .utf8),
              arrStr.count >= 2 else { return }
        let escapado = String(arrStr.dropFirst().dropLast())
        let js = "if(window.__sectrumOnBiometricResult){window.__sectrumOnBiometricResult(\(sucesso ? "true" : "false"),\(escapado));}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SectrumBridgeViewController()
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
