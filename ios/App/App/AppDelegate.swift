import UIKit
import AVFoundation
import UserNotifications
import CallKit
import PushKit
import CryptoKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, CXProviderDelegate, PKPushRegistryDelegate {

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
    private var ultimoStatusCallKit: String = "idle"

    private var ultimoCallIdNotificado: String = ""
    private var ultimaEmergenciaIdNotificada: Int = 0

    // VoIP Push (PushKit): acorda o app mesmo FECHADO e com a tela BLOQUEADA para exibir a chamada no CallKit
    private var voipRegistry: PKPushRegistry?
    private var voipEnvioEmCurso = false

    // Conversa nativa entre apartamentos (atendida pelo CallKit, sem depender do WebView)
    private var audioNativo: InterfoneAudioNativo?
    private var callUuidAudioNativo: UUID?

    // Conversa nativa iniciada pelo React com o app aberto (ligando ou atendendo dentro do app).
    // No iPhone o WKWebView só toca no viva-voz; o áudio nativo permite fone de ouvido + viva-voz.
    private var audioNativoApp: InterfoneAudioNativo?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        SectrumDiag.instalarCapturaDeCrash()
        SectrumDiag.log("app: iniciado (estado=\(application.applicationState.rawValue))")
        // O CallKit precisa existir ANTES do PushKit: ao ser acordado por um VoIP Push o iOS exige
        // que a chamada seja reportada imediatamente, senão encerra o app e para de entregar pushes.
        configurarCallKitNativo()
        registrarVoipPush()
        garantirSentinelaBackgroundAtiva()
        configurarNotificacoesNativas(application)
        registrarObservadoresCicloDeVida()
        iniciarMonitoramentoInterfoneEmergencia()
        // Envia ao servidor o diagnóstico (e eventual falha) da execução anterior
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            SectrumDiag.enviarPendentes()
        }
        return true
    }

    private func registrarObservadoresCicloDeVida() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.aoEntrarEmBackground()
        }
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.aoEntrarEmBackground()
        }
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            if UIApplication.shared.applicationState != .active {
                self?.garantirSentinelaBackgroundAtiva()
            }
        }
    }

    func garantirSentinelaBackgroundAtiva() {
        // Durante a conversa nativa a sessão de áudio pertence ao CallKit (.playAndRecord/.voiceChat);
        // trocar para .playback aqui desligaria o microfone no meio da ligação.
        if audioNativo != nil || audioNativoApp != nil { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            if sentinelaPlayer == nil {
                let wavData = Self.gerarWavSilenciosoData()
                sentinelaPlayer = try AVAudioPlayer(data: wavData)
                sentinelaPlayer?.numberOfLoops = -1
                sentinelaPlayer?.volume = 0.02
                sentinelaPlayer?.prepareToPlay()
            }
            if sentinelaPlayer?.isPlaying != true {
                sentinelaPlayer?.play()
            }
        } catch {
            print("[SectrumiOS] Erro ao ativar sentinela background: \(error)")
        }
    }

    func aoEntrarEmBackground() {
        garantirSentinelaBackgroundAtiva()
        let app = UIApplication.shared
        if bgTask == .invalid {
            bgTask = app.beginBackgroundTask(withName: "SectrumVoipGuard") { [weak self] in
                if let task = self?.bgTask, task != .invalid {
                    app.endBackgroundTask(task)
                    self?.bgTask = .invalid
                }
            }
        }
    }

    func aoVoltarParaForeground() {
        if bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
        garantirSentinelaBackgroundAtiva()
    }

    /**
     * Gera um WAV PCM 8kHz mono de 1 segundo com onda não-zero de ±4 LSB (-78 dB, 100% inaudível)
     * para evitar que o detector de silêncio digital do coreaudiod suspenda o processo em tela bloqueada.
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
        let padrao: [UInt8] = [0x04, 0x00, 0xFC, 0xFF]
        for _ in 0..<4000 {
            data.append(contentsOf: padrao)
        }
        return data
    }

    private func configurarCallKitNativo() {
        let config = CXProviderConfiguration()
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
        if UIApplication.shared.applicationState != .active {
            garantirSentinelaBackgroundAtiva()
        }

        let defaults = UserDefaults.standard
        guard let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        let bgState = UIApplication.shared.applicationState.rawValue
        let ckInfo = ultimoStatusCallKit.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "idle"

        // 1. Verifica Interfone
        if let urlCall = URL(string: "\(baseUrl)/api.php?route=morador_interfone_status&ios_bg=\(bgState)&ck=\(ckInfo)") {
            var req = URLRequest(url: urlCall, timeoutInterval: 3.5)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
                guard let self = self, let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    return
                }

                // Resposta de erro (401/403/500 etc.) não traz a chave "chamada": não derruba nenhuma chamada por engano
                guard json.keys.contains("chamada") else { return }

                guard let chamada = json["chamada"] as? [String: Any],
                      let status = chamada["status"] as? String, status.lowercased() == "ringing" else {
                    let statusAtual = ((json["chamada"] as? [String: Any])?["status"] as? String ?? "").lowercased()
                    DispatchQueue.main.async {
                        self.ultimoCallIdNotificado = ""
                        if let uuid = self.callUuidAtivo, !self.chamadaAtendida {
                            // Atendida em outro aparelho da unidade / pelo app aberto, ou cancelada por quem ligou
                            let motivo: CXCallEndedReason = statusAtual == "answered" ? .answeredElsewhere : .remoteEnded
                            self.cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: motivo)
                            self.callUuidAtivo = nil
                            self.callIdAtivo = ""
                            self.chamadaAtivaDict = nil
                            self.ultimoStatusCallKit = "ended"
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

    /**
     * Exibe a chamada recebida na tela nativa do iOS (CallKit) — funciona com app fechado e tela bloqueada.
     * Usada tanto pelo VoIP Push (PushKit) quanto pelo monitoramento em background (polling).
     * O UUID é derivado do call_id, então a mesma chamada nunca toca duas vezes.
     *
     * - Parameter completion: obrigatório no fluxo do PushKit (deve ser chamado após reportar a chamada).
     */
    private func apresentarChamadaCallKit(callId: String, origemNome: String, unidade: String, chamadaDict: [String: Any], completion: (() -> Void)? = nil) {
        let uuid = Self.uuidDaChamada(callId)
        let ehApt = Self.ehChamadaApartamento(chamadaDict)
        let update = montarUpdateCallKit(origemNome: origemNome, unidade: unidade, temVideo: !ehApt)
        ultimoCallIdNotificado = callId

        // Mesma chamada já exibida (ex.: polling chegou antes do VoIP Push). Todo VoIP Push precisa ser reportado
        // ao CallKit; com o mesmo UUID o iOS apenas ignora (callUUIDAlreadyExists) sem tocar duas vezes.
        if callUuidAtivo == uuid {
            cxProvider?.reportNewIncomingCall(with: uuid, update: update) { _ in completion?() }
            return
        }

        // Já existe uma conversa nativa em andamento: a nova chamada recebe "ocupado"
        if audioNativo != nil && chamadaAtendida {
            cxProvider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] _ in
                self?.cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                completion?()
            }
            let deviceId = (chamadaDict["device_id"] as? String) ?? "APT:0"
            sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "reject")
            return
        }

        if let uuidAntigo = callUuidAtivo {
            cxProvider?.reportCall(with: uuidAntigo, endedAt: Date(), reason: .remoteEnded)
        }

        self.callUuidAtivo = uuid
        self.callIdAtivo = callId
        self.chamadaAtivaDict = chamadaDict
        self.chamadaAtendida = false
        self.ultimoStatusCallKit = "reporting"

        cxProvider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                self?.ultimoStatusCallKit = "err_\((error as NSError).code)"
                SectrumDiag.log("callkit: erro ao exibir chamada \(callId) (código \((error as NSError).code))")
                // Ex.: Não Perturbe / Foco bloqueou a tela de chamada: avisa com notificação crítica
                if self?.callUuidAtivo == uuid {
                    self?.callUuidAtivo = nil
                }
                self?.dispararNotificacaoLocalCritica(
                    id: "sectrum-call-\(callId)",
                    titulo: "📲 CHAMADA DE INTERFONE — \(origemNome)",
                    corpo: "🔴 Chamando \(unidade) agora! Toque para atender."
                )
            } else {
                self?.ultimoStatusCallKit = "ringing_ok"
                SectrumDiag.log("callkit: tocando \(callId)")
                // O iOS já está tocando: o React (se aberto) não toca a própria campainha por cima
                let idJs = callId.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
                SectrumBridgeViewController.shared?.executarJs("window.__sectrumCallKitTocando = '\(idJs)';")
            }
            completion?()
        }
    }

    private func montarUpdateCallKit(origemNome: String, unidade: String, temVideo: Bool) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.localizedCallerName = "\(origemNome)"
        update.remoteHandle = CXHandle(type: .generic, value: "Interfone • \(unidade)")
        update.hasVideo = temVideo
        update.supportsHolding = false
        update.supportsDTMF = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        return update
    }

    /// UUID determinístico (MD5 versão 3) a partir do call_id do servidor.
    static func uuidDaChamada(_ callId: String) -> UUID {
        var b = Array(Insecure.MD5.hash(data: Data(callId.utf8)))
        b[6] = (b[6] & 0x0F) | 0x30
        b[8] = (b[8] & 0x3F) | 0x80
        return UUID(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
                           b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]))
    }

    /// Chamada entre apartamentos (ramal -> ramal), cujo áudio pode ser 100% nativo.
    static func ehChamadaApartamento(_ dict: [String: Any]) -> Bool {
        let tipo = ((dict["tipo"] as? String) ?? "").lowercased()
        let deviceId = ((dict["device_id"] as? String) ?? "").uppercased()
        let callId = (dict["call_id"] as? String) ?? ""
        return tipo == "apartamento" || deviceId.hasPrefix("APT:") || callId.hasPrefix("apt_")
    }

    func encerrarChamadaCallKitAtiva() {
        DispatchQueue.main.async {
            // Conversa nativa em andamento: o React (ex.: ao fechar a tela de toque) não pode derrubar a ligação
            if self.audioNativo != nil { return }
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
        finalizarAudioNativo()
        callUuidAtivo = nil
        callIdAtivo = ""
        chamadaAtivaDict = nil
        chamadaAtendida = false
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        chamadaAtendida = true
        ultimoStatusCallKit = "answered"
        let chamada = chamadaAtivaDict
        let callId = callIdAtivo
        let deviceId = (chamada?["device_id"] as? String) ?? "APT:0"
        SectrumDiag.log("callkit: ATENDER \(callId) (estado app=\(UIApplication.shared.applicationState.rawValue), dict=\(chamada != nil))")

        // Se havia uma conversa iniciada pelo app, ela dá lugar à chamada atendida pelo iOS
        if audioNativoApp != nil {
            encerrarAudioInterfoneApp()
        }

        // 1. Sinaliza imediatamente no servidor que a chamada foi atendida
        sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "answer")

        // 2a. Chamada entre apartamentos: conversa 100% NATIVA mantendo a tela de chamada do iOS.
        //     Funciona com a tela bloqueada e com o app fechado (o WebView não tem microfone em background).
        if let dict = chamada, Self.ehChamadaApartamento(dict), let audio = criarAudioNativo(callId: callId) {
            sentinelaPlayer?.pause()
            configurarSessaoAudioChamada()
            audioNativo = audio
            callUuidAudioNativo = action.callUUID
            audio.aoEncerrarRemotamente = { [weak self] _ in
                self?.encerrarConversaNativaPorRemoto()
            }

            // Se o app estiver aberto, avisa o React para NÃO abrir a própria tela/microfone para esta chamada
            let callIdJs = callId.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
            SectrumBridgeViewController.shared?.executarJs(
                "window.__sectrumChamadaNativaAtiva = '\(callIdJs)';"
                + "window.dispatchEvent(new CustomEvent('sectrum-callkit-atendida-nativa', { detail: { call_id: '\(callIdJs)' } }));"
            )

            action.fulfill()

            // O áudio inicia em provider(_:didActivate:). Fallback caso o iOS não dispare a ativação em 1,5 s.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let a = self?.audioNativo, !a.iniciado else { return }
                try? AVAudioSession.sharedInstance().setActive(true)
                a.iniciar()
            }
            return
        }

        // 2b. Chamada da portaria / leitor facial: notifica o WebView React para abrir direto na tela de conversa em andamento ("Em conversa • 00:01")
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
            self?.garantirSentinelaBackgroundAtiva()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = callIdAtivo
        let deviceId = (chamadaAtivaDict?["device_id"] as? String) ?? "APT:0"

        if audioNativo != nil && action.callUUID == callUuidAudioNativo {
            // Usuário desligou a conversa nativa pela tela do iOS
            ultimoStatusCallKit = "ended"
            sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "hangUp")
            finalizarAudioNativo()
        } else if !chamadaAtendida && !callId.isEmpty {
            ultimoStatusCallKit = "rejected"
            sinalizarInterfoneServidor(callId: callId, deviceId: deviceId, acao: "reject")
            let js = "window.dispatchEvent(new CustomEvent('sectrum-callkit-recusar', { detail: { call_id: '\(callId)' } }));"
            SectrumBridgeViewController.shared?.executarJs(js)
        }

        callUuidAtivo = nil
        callIdAtivo = ""
        chamadaAtivaDict = nil
        chamadaAtendida = false
        action.fulfill()
        // Aguarda o CallKit liberar a sessão de áudio antes de religar a sentinela
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.garantirSentinelaBackgroundAtiva()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        audioNativo?.mudo = action.isMuted
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // O CallKit entregou a sessão de áudio com prioridade de ligação: liga microfone e fone de ouvido
        SectrumDiag.log("callkit: sessão de áudio ATIVADA (conversa nativa=\(audioNativo != nil))")
        audioNativo?.iniciar()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Sessão liberada pelo CallKit; a sentinela é religada ao final da chamada
        SectrumDiag.log("callkit: sessão de áudio desativada")
    }

    // MARK: - Conversa nativa iniciada pelo React (app aberto)

    /// Chamado pelo React (ponte `iniciarAudioInterfoneNativo`) quando a conversa entre apartamentos é atendida
    /// dentro do app (ligando ou recebendo). Usa o mesmo motor nativo do CallKit, com fone de ouvido ou viva-voz.
    func iniciarAudioInterfoneApp(callId: String, viaVoz: Bool) {
        guard !callId.isEmpty else { return }
        // Já existe conversa nativa pelo CallKit para esta mesma chamada: só ajusta a saída
        if let a = audioNativo, a.callId == callId {
            a.definirViaVoz(viaVoz)
            return
        }
        if let atual = audioNativoApp {
            if atual.callId == callId {
                atual.definirViaVoz(viaVoz)
                return
            }
            atual.encerrar()
            audioNativoApp = nil
        }
        guard let audio = criarAudioNativo(callId: callId) else {
            SectrumDiag.log("app-audio: sem sessão salva para iniciar \(callId)")
            return
        }
        SectrumDiag.log("app-audio: iniciar \(callId) viaVoz=\(viaVoz)")
        sentinelaPlayer?.pause()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            try session.setActive(true)
        } catch {
            SectrumDiag.log("app-audio: erro na sessão de áudio (\(error.localizedDescription))")
        }
        audioNativoApp = audio
        audio.aoEncerrarRemotamente = { [weak self] status in
            // Avisa o React para fechar a tela de conversa
            let idJs = callId.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
            let stJs = status.filter { $0.isLetter || $0 == "_" }
            SectrumBridgeViewController.shared?.executarJs(
                "window.dispatchEvent(new CustomEvent('sectrum-audio-nativo-status', { detail: { call_id: '\(idJs)', status: '\(stJs)' } }));"
            )
            self?.encerrarAudioInterfoneApp()
        }
        audio.definirViaVoz(viaVoz)
        audio.iniciar()
    }

    func encerrarAudioInterfoneApp() {
        guard let audio = audioNativoApp else { return }
        SectrumDiag.log("app-audio: encerrar \(audio.callId)")
        audio.encerrar()
        audioNativoApp = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self, self.audioNativo == nil, self.audioNativoApp == nil else { return }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            self.garantirSentinelaBackgroundAtiva()
        }
    }

    func mudoAudioInterfoneApp(_ mudo: Bool) {
        audioNativoApp?.mudo = mudo
    }

    func saidaAudioInterfoneApp(viaVoz: Bool) {
        if let a = audioNativoApp {
            a.definirViaVoz(viaVoz)
        } else {
            audioNativo?.definirViaVoz(viaVoz)
        }
    }

    // MARK: - Conversa nativa (apartamento <-> apartamento)

    private func criarAudioNativo(callId: String) -> InterfoneAudioNativo? {
        let defaults = UserDefaults.standard
        guard !callId.isEmpty,
              let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return nil }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        return InterfoneAudioNativo(callId: callId, baseUrl: baseUrl, token: token)
    }

    private func configurarSessaoAudioChamada() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        } catch {
            print("[SectrumiOS] Erro ao configurar sessão de áudio da chamada: \(error)")
        }
    }

    private func finalizarAudioNativo() {
        audioNativo?.encerrar()
        audioNativo = nil
        callUuidAudioNativo = nil
    }

    /// A outra ponta desligou (ou a chamada expirou no servidor): fecha a tela de chamada do iOS.
    private func encerrarConversaNativaPorRemoto() {
        if let uuid = callUuidAudioNativo {
            cxProvider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        }
        finalizarAudioNativo()
        callUuidAtivo = nil
        callIdAtivo = ""
        chamadaAtivaDict = nil
        chamadaAtendida = false
        ultimoStatusCallKit = "ended"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.garantirSentinelaBackgroundAtiva()
        }
    }

    // MARK: - PushKit (VoIP Push): faz o iPhone tocar com o app FECHADO e a tela BLOQUEADA

    private func registrarVoipPush() {
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
    }

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: "sectrum_voip_token")
        enviarVoipTokenAoServidor(forcar: true)
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        UserDefaults.standard.removeObject(forKey: "sectrum_voip_token")
        UserDefaults.standard.removeObject(forKey: "sectrum_voip_token_enviado")
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }
        // REGRA DO iOS 13+: todo VoIP Push precisa virar uma chamada no CallKit imediatamente,
        // senão o sistema encerra o app e deixa de entregar novos VoIP Pushes.
        let d = payload.dictionaryPayload
        let callIdRecebido = (d["call_id"] as? String) ?? ""
        let origemNome = (d["origem_nome"] as? String) ?? "Interfone"
        let unidade = (d["unidade"] as? String) ?? "Seu Apartamento"
        let deviceId = (d["device_id"] as? String) ?? "APT:0"
        let tipoChamada = (d["tipo_chamada"] as? String) ?? "apartamento"
        let callId = callIdRecebido.isEmpty ? "voip_\(UUID().uuidString)" : callIdRecebido
        SectrumDiag.log("voip: push recebido \(callId) (estado app=\(UIApplication.shared.applicationState.rawValue))")

        let chamada: [String: Any] = [
            "call_id": callId,
            "status": "ringing",
            "tipo": tipoChamada,
            "device_id": deviceId,
            "controlador_id": 0,
            "porta": "",
            "nome_portaria": "Interfone — \(origemNome)",
            "origem_nome": origemNome,
            "unidade": unidade,
            "source": tipoChamada,
        ]

        apresentarChamadaCallKit(callId: callId, origemNome: origemNome, unidade: unidade, chamadaDict: chamada) { [weak self] in
            completion()
            if callIdRecebido.isEmpty {
                // Push sem identificação de chamada: cumpre a regra do iOS e encerra imediatamente
                self?.cxProvider?.reportCall(with: Self.uuidDaChamada(callId), endedAt: Date(), reason: .failed)
                self?.callUuidAtivo = nil
            }
        }

        // Mantém o processo vivo e confere no servidor se a chamada ainda está tocando
        // (se quem ligou desistir, o monitoramento encerra a tela de chamada sozinho)
        garantirSentinelaBackgroundAtiva()
        aoEntrarEmBackground()
        verificarServidorEmBackground()
    }

    /// Envia o token VoIP do aparelho ao servidor (somente quando muda o token ou o usuário logado).
    func enviarVoipTokenAoServidor(forcar: Bool = false) {
        let defaults = UserDefaults.standard
        guard let voip = defaults.string(forKey: "sectrum_voip_token"), !voip.isEmpty,
              let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let chave = "\(voip)|\(String(token.suffix(24)))"
        if !forcar && defaults.string(forKey: "sectrum_voip_token_enviado") == chave { return }
        if voipEnvioEmCurso { return }

        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        guard let url = URL(string: "\(baseUrl)/api.php?route=salvar_voip_token") else { return }
        #if DEBUG
        let ambiente = "sandbox"
        #else
        let ambiente = "production"
        #endif

        var req = URLRequest(url: url, timeoutInterval: 10.0)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["voip_token": voip, "ambiente": ambiente])
        voipEnvioEmCurso = true
        URLSession.shared.dataTask(with: req) { [weak self] _, resp, _ in
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                self?.voipEnvioEmCurso = false
                if ok {
                    UserDefaults.standard.set(chave, forKey: "sectrum_voip_token_enviado")
                }
            }
        }.resume()
    }

    /// Logout: desvincula este iPhone do usuário no servidor para ele parar de receber chamadas.
    func removerVoipTokenDoServidor() {
        let defaults = UserDefaults.standard
        defer { defaults.removeObject(forKey: "sectrum_voip_token_enviado") }
        guard let voip = defaults.string(forKey: "sectrum_voip_token"), !voip.isEmpty,
              let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        guard let url = URL(string: "\(baseUrl)/api.php?route=remover_voip_token") else { return }
        var req = URLRequest(url: url, timeoutInterval: 8.0)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["voip_token": voip])
        URLSession.shared.dataTask(with: req).resume()
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

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
