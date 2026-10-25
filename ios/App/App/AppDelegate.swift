import UIKit
import AVFoundation
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var monitorTimer: Timer?
    private var ultimoCallIdNotificado: String = ""
    private var ultimaEmergenciaIdNotificada: Int = 0

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configurarSessaoAudioNativa()
        configurarNotificacoesNativas(application)
        iniciarMonitoramentoInterfoneEmergencia()
        return true
    }

    private func configurarSessaoAudioNativa() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Categoria .playAndRecord com .defaultToSpeaker garante que o toque de interfone e a
            // sirene de emergência saiam no alto-falante principal mesmo com a chave Silencioso ativada no iPhone.
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[SectrumiOS] Falha ao configurar AVAudioSession: \(error)")
        }
    }

    private func configurarNotificacoesNativas(_ application: UIApplication) {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
    }

    private func iniciarMonitoramentoInterfoneEmergencia() {
        monitorTimer?.invalidate()
        monitorTimer = Timer.scheduledTimer(withTimeInterval: 2.8, repeats: true) { [weak self] _ in
            self?.verificarServidorEmBackground()
        }
    }

    private func verificarServidorEmBackground() {
        let defaults = UserDefaults.standard
        guard let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"

        // 1. Verifica Interfone
        if let urlCall = URL(string: "\(baseUrl)/api.php?route=morador_interfone_status") {
            var req = URLRequest(url: urlCall, timeoutInterval: 4.5)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
                guard let self = self, let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let chamada = json["chamada"] as? [String: Any],
                      let status = chamada["status"] as? String, status.lowercased() == "ringing" else {
                    self?.ultimoCallIdNotificado = ""
                    return
                }
                let callId = (chamada["call_id"] as? String) ?? ""
                let portaria = (chamada["nome_portaria"] as? String) ?? "Portaria"
                let unidade = (chamada["unidade"] as? String) ?? "Seu Apartamento"
                if !callId.isEmpty && callId != self.ultimoCallIdNotificado {
                    self.ultimoCallIdNotificado = callId
                    self.dispararNotificacaoLocalCritica(
                        id: "sectrum-call-\(callId)",
                        titulo: "📲 CHAMADA DE INTERFONE — \(portaria)",
                        corpo: "🔴 Chamando \(unidade) agora! Toque para atender e ver a câmera."
                    )
                }
            }.resume()
        }

        // 2. Verifica Emergência Ativa
        if let urlEm = URL(string: "\(baseUrl)/api.php?route=emergencia_status_ativo") {
            var req = URLRequest(url: urlEm, timeoutInterval: 4.5)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
                guard let self = self, let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let em = json["emergencia"] as? [String: Any],
                      let status = em["status"] as? String, status.lowercased() == "ativo" else {
                    self?.ultimaEmergenciaIdNotificada = 0
                    return
                }
                let idEm = (em["id"] as? Int) ?? 0
                let tipo = (em["tipo"] as? String) ?? "seguranca"
                let unidadeLabel = (em["unidade_label"] as? String) ?? "Condomínio"
                let autorNome = (em["autor_nome"] as? String) ?? "Morador"
                if idEm > 0 && idEm != self.ultimaEmergenciaIdNotificada {
                    self.ultimaEmergenciaIdNotificada = idEm
                    let titulo = tipo.lowercased() == "medica"
                        ? "🚑 EMERGÊNCIA MÉDICA — \(unidadeLabel)"
                        : "🚨 EMERGÊNCIA DE SEGURANÇA — \(unidadeLabel)"
                    self.dispararNotificacaoLocalCritica(
                        id: "sectrum-em-\(idEm)",
                        titulo: titulo,
                        corpo: "🆘 \(autorNome) pediu socorro imediato em \(unidadeLabel)! Toque para abrir!"
                    )
                }
            }.resume()
        }
    }

    private func dispararNotificacaoLocalCritica(id: String, titulo: String, corpo: String) {
        let content = UNMutableNotificationContent()
        content.title = titulo
        content.body = corpo
        content.sound = .defaultCritical
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.2, repeats: false)
        let req = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    // Exibe banner e som mesmo com o app aberto em primeiro plano
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        bgTask = application.beginBackgroundTask(withName: "SectrumVoipGuard") { [weak self] in
            if let task = self?.bgTask, task != .invalid {
                application.endBackgroundTask(task)
                self?.bgTask = .invalid
            }
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        if bgTask != .invalid {
            application.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
        configurarSessaoAudioNativa()
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
