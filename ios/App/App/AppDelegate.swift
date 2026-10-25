import UIKit
import AVFoundation
import UserNotifications
import CallKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, CXProviderDelegate {

    var window: UIWindow?
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var monitorTimer: Timer?
    private var sentinelaPlayer: AVAudioPlayer?

    // Estado CallKit (Chamada Nativa estilo WhatsApp)
    private var cxProvider: CXProvider?
    private var cxCallController = CXCallController()
    private var callUuidAtivo: UUID?
    private var callIdAtivo: String = ""
    private var chamadaAtivaDict: [String: Any]?
    private var chamadaAtendida: Bool = false

    private var ultimoCallIdNotificado: String = ""
    private var ultimaEmergenciaIdNotificada: Int = 0

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configurarSessaoAudioNativa()
        configurarCallKitNativo()
        configurarNotificacoesNativas(application)
        iniciarMonitoramentoInterfoneEmergencia()
        return true
    }

    private func configurarSessaoAudioNativa() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[SectrumiOS] Falha ao configurar AVAudioSession: \(error)")
        }
    }

    private func iniciarSentinelaBackground() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            if sentinelaPlayer == nil {
                let wavData = Self.gerarWavSilenciosoData()
                sentinelaPlayer = try AVAudioPlayer(data: wavData)
                sentinelaPlayer?.numberOfLoops = -1
                sentinelaPlayer?.volume = 0.01
                sentinelaPlayer?.prepareToPlay()
            }
            if sentinelaPlayer?.isPlaying == false {
                sentinelaPlayer?.play()
            }
        } catch {
            print("[SectrumiOS] Erro ao iniciar sentinela background: \(error)")
        }
    }

    private func pararSentinelaBackground() {
        if sentinelaPlayer?.isPlaying == true {
            sentinelaPlayer?.pause()
        }
    }

    /**
     * Gera um WAV PCM 8kHz mono de 1 segundo com amplitude 1 LSB (-90 dB, inaudível)
     * para manter o processo iOS acordado em background com UIBackgroundModes=audio.
     */
    private static func gerarWavSilenciosoData() -> Data {
        let header: [UInt8] = [
            0x52, 0x49, 0x46, 0x46, // "RIFF"
            0xA4, 0x3E, 0x00, 0x00, // 16036
            0x57, 0x41, 0x56, 0x45, // "WAVE"
            0x66, 0x6D, 0x74, 0x20, // "fmt "
            0x10, 0x00, 0x00, 0x00, // 16
            0x01, 0x00,             // PCM = 1
            0x01, 0x00,             // Channels = 1
            0x40, 0x1F, 0x00, 0x00, // 8000 Hz
            0x80, 0x3E, 0x00, 0x00, // 16000 B/s
            0x02, 0x00,             // BlockAlign = 2
            0x10, 0x00,             // 16-bit
            0x64, 0x61, 0x74, 0x61, // "data"
            0x80, 0x3E, 0x00, 0x00  // 16000 bytes
        ]
        var data = Data(header)
        data.append(Data(repeating: 0, count: 16000))
        return data
    }

    private func configurarCallKitNativo() {
        let config = CXProviderConfiguration(localizedName: "Sectrum Condomínio")
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true

        let provider = CXProvider(configuration: config)
        provider.setDelegate(self, queue: nil)
        self.cxProvider = provider
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
        let timer = Timer(timeInterval: 1.3, repeats: true) { [weak self] _ in
            self?.verificarServidorEmBackground()
        }
        RunLoop.main.add(timer, forMode: .common)
        monitorTimer = timer
    }

    private func verificarServidorEmBackground() {
        let defaults = UserDefaults.standard
        guard let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"

        // 1. Verifica Interfone
        if let urlCall = URL(string: "\(baseUrl)/api.php?route=morador_interfone_status") {
            var req = URLRequest(url: urlCall, timeoutInterval: 3.5)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
                guard let self = self, let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    return
                }

                guard let chamada = json["chamada"] as? [String: Any],
                      let status = chamada["status"] as? String, status.lowercased() == "ringing" else {
                    DispatchQueue.main.async {
                        self.ultimoCallIdNotificado = ""
                        if let uuid = self.callUuidAtivo, !self.chamadaAtendida {
                            self.cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
                            self.callUuidAtivo = nil
                            self.callIdAtivo = ""
                            self.chamadaAtivaDict = nil
                        }
                    }
                    return
                }

                let callId = (chamada["call_id"] as? String) ?? ""
                let origemNome = (chamada["origem_nome"] as? String) ?? (chamada["nome_portaria"] as? String) ?? "Portaria Sectrum"
                let unidade = (chamada["unidade"] as? String) ?? "Seu Apartamento"

                DispatchQueue.main.async {
                    let emBackground = UIApplication.shared.applicationState != .active
                    if !callId.isEmpty && callId != self.ultimoCallIdNotificado && emBackground {
                        self.ultimoCallIdNotificado = callId
                        self.apresentarChamadaCallKit(callId: callId, origemNome: origemNome, unidade: unidade, chamadaDict: chamada)
                    }
                }
            }.resume()
        }

        // 2. Verifica Emergência Ativa
        if let urlEm = URL(string: "\(baseUrl)/api.php?route=emergencia_status_ativo") {
            var req = URLRequest(url: urlEm, timeoutInterval: 4.0)
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

    private func apresentarChamadaCallKit(callId: String, origemNome: String, unidade: String, chamadaDict: [String: Any]) {
        if let uuidAntigo = callUuidAtivo {
            cxProvider?.reportCall(with: uuidAntigo, endedAt: Date(), reason: .remoteEnded)
        }

        let novoUuid = UUID()
        self.callUuidAtivo = novoUuid
        self.callIdAtivo = callId
        self.chamadaAtivaDict = chamadaDict
        self.chamadaAtendida = false

        let update = CXCallUpdate()
        update.localizedCallerName = "\(origemNome)"
        update.remoteHandle = CXHandle(type: .generic, value: "Interfone • \(unidade)")
        update.hasVideo = true
        update.supportsHolding = false
        update.supportsDTMF = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        cxProvider?.reportNewIncomingCall(with: novoUuid, update: update) { [weak self] error in
            if let error = error {
                print("[SectrumiOS] Erro ao exibir CallKit: \(error)")
                self?.dispararNotificacaoLocalCritica(
                    id: "sectrum-call-\(callId)",
                    titulo: "📲 CHAMADA DE INTERFONE — \(origemNome)",
                    corpo: "🔴 Chamando \(unidade) agora! Toque para atender."
                )
            }
        }
    }

    func encerrarChamadaCallKitAtiva() {
        DispatchQueue.main.async {
            if let uuid = self.callUuidAtivo {
                self.cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
                self.callUuidAtivo = nil
                self.callIdAtivo = ""
                self.chamadaAtivaDict = nil
                self.chamadaAtendida = false
            }
        }
    }

    // MARK: - CXProviderDelegate (CallKit Nativo estilo WhatsApp)

    func providerDidReset(_ provider: CXProvider) {
        callUuidAtivo = nil
        callIdAtivo = ""
        chamadaAtivaDict = nil
        chamadaAtendida = false
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        chamadaAtendida = true
        let chamada = chamadaAtivaDict
        let callId = callIdAtivo
        let deviceId = (chamada?["device_id"] as? String) ?? "APT:0"

        // 1. Sinaliza imediatamente no servidor que a chamada foi atendida
        sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "answer")

        // 2. Notifica o WebView React para abrir direto na tela de conversa em andamento ("Em conversa • 00:01")
        if let dict = chamada,
           let jsonData = try? JSONSerialization.data(withJSONObject: dict),
           let jsonStr = String(data: jsonData, encoding: .utf8) {
            let js = """
            window.__sectrumPendingCallKitAnswer = \(jsonStr);
            window.dispatchEvent(new CustomEvent('sectrum-callkit-atender', { detail: \(jsonStr) }));
            """
            SectrumBridgeViewController.shared?.executarJs(js)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                SectrumBridgeViewController.shared?.executarJs(js)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                SectrumBridgeViewController.shared?.executarJs(js)
            }
        }

        action.fulfill()

        // 3. Libera o wrapper do CallKit após trazer o app para o primeiro plano para que o WebView tenha controle total do microfone Full-Duplex
        let uuid = action.callUUID
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            self?.cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
            self?.callUuidAtivo = nil
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = callIdAtivo
        let deviceId = (chamadaAtivaDict?["device_id"] as? String) ?? "APT:0"

        if !chamadaAtendida && !callId.isEmpty {
            sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "reject")
            let js = "window.dispatchEvent(new CustomEvent('sectrum-callkit-recusar', { detail: { call_id: '\(callId)' } }));"
            SectrumBridgeViewController.shared?.executarJs(js)
        }

        callUuidAtivo = nil
        callIdAtivo = ""
        chamadaAtivaDict = nil
        chamadaAtendida = false
        action.fulfill()
    }

    private func sinalizarInterfoneServidor(callId: String, deviceId: String, acao: String) {
        guard !callId.isEmpty else { return }
        let defaults = UserDefaults.standard
        guard let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        guard let url = URL(string: "\(baseUrl)/api.php?route=morador_interfone_sinalizar") else { return }

        var req = URLRequest(url: url, timeoutInterval: 5.0)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "call_id": callId,
            "device_id": deviceId,
            "acao": acao
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
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

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Se uma chamada CallKit estiver ativa, suprime banners duplicados de texto
        if callUuidAtivo != nil {
            completionHandler([])
            return
        }
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        iniciarSentinelaBackground()
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
        pararSentinelaBackground()
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
