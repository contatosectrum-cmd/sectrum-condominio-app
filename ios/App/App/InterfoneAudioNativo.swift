import Foundation
import UIKit
import AVFoundation

/**
 * Trilha de diagnóstico do app iOS: registra os passos das chamadas e qualquer exceção nativa
 * (ex.: falhas do AVAudioEngine) e envia ao servidor na próxima abertura do app (rota `ios_diagnostico`).
 * Permite investigar falhas reais nos iPhones dos moradores sem depender do relatório da Apple.
 */
enum SectrumDiag {
    private static let chaveTrilha = "sectrum_diag_trilha"
    private static let chaveCrash = "sectrum_diag_crash"
    private static let fila = DispatchQueue(label: "br.seg.vps.cond.sectrum.diag")

    static func log(_ mensagem: String) {
        let linha = "\(ISO8601DateFormatter().string(from: Date())) \(mensagem)"
        print("[SectrumiOS] \(mensagem)")
        fila.sync {
            var trilha = UserDefaults.standard.stringArray(forKey: chaveTrilha) ?? []
            trilha.append(linha)
            if trilha.count > 150 {
                trilha.removeFirst(trilha.count - 150)
            }
            UserDefaults.standard.set(trilha, forKey: chaveTrilha)
        }
    }

    /// Captura exceções Objective-C não tratadas (AVFoundation, CallKit...) antes de o app encerrar.
    static func instalarCapturaDeCrash() {
        NSSetUncaughtExceptionHandler { excecao in
            let pilha = excecao.callStackSymbols.prefix(30).joined(separator: "\n")
            let info = "\(excecao.name.rawValue): \(excecao.reason ?? "-")\n\(pilha)"
            UserDefaults.standard.set(info, forKey: "sectrum_diag_crash")
            UserDefaults.standard.synchronize()
        }
    }

    /// Envia ao servidor a trilha + eventual crash da execução anterior e limpa o registro local.
    static func enviarPendentes() {
        let defaults = UserDefaults.standard
        let trilha = defaults.stringArray(forKey: chaveTrilha) ?? []
        let crash = defaults.string(forKey: chaveCrash) ?? ""
        guard !trilha.isEmpty || !crash.isEmpty,
              let token = defaults.string(forKey: "sectrum_interfone_token"), !token.isEmpty else { return }
        let baseUrl = defaults.string(forKey: "sectrum_base_url") ?? "https://cond.vps.seg.br"
        guard let url = URL(string: "\(baseUrl)/api.php?route=ios_diagnostico") else { return }

        let versao = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")
            + " (" + (Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?") + ")"
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "versao": versao,
            "ios": UIDevice.current.systemVersion,
            "modelo": UIDevice.current.model,
            "crash": crash,
            "trilha": trilha,
        ])
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            if (resp as? HTTPURLResponse)?.statusCode == 200 {
                fila.sync {
                    defaults.removeObject(forKey: chaveCrash)
                    defaults.removeObject(forKey: chaveTrilha)
                }
            }
        }.resume()
    }
}

/**
 * Conversa de interfone entre apartamentos 100% NATIVA (Full-Duplex).
 * Usada em TODAS as conversas entre apartamentos no iPhone:
 *   - atendidas pela tela nativa do iOS (CallKit) — inclusive com a tela bloqueada ou o app fechado;
 *   - feitas/atendidas dentro do app (o WKWebView no iPhone só toca no viva-voz e não usa o fone de ouvido).
 *
 * Fala exatamente o mesmo protocolo do React (`src/lib/interfoneAudio.ts`), então o outro lado (Android, iOS
 * ou navegador) não percebe diferença:
 *   - Microfone -> 8000 Hz mono -> ITU-T G.711 µ-law -> Base64 -> POST `morador_interfone_falar` (~180 ms por pacote)
 *   - GET `morador_interfone_escutar` a cada ~140 ms -> µ-law -> PCM -> fone de ouvido / viva-voz
 *
 * Usa o processamento de voz do iOS (cancelamento de eco + supressão de ruído) e o modo `.voiceChat`,
 * que por padrão toca no FONE DE OUVIDO (como uma ligação comum); o viva-voz é opcional.
 *
 * Robustez:
 *  - O iOS PARA o AVAudioEngine a cada mudança de configuração (troca fone/viva-voz/Bluetooth, ativação do CallKit).
 *    Nesses casos o motor é remontado por completo (tap do microfone, conversor e player), senão a voz recebida
 *    fica presa na fila e nada toca.
 *  - Um "cão de guarda" verifica a cada segundo se o motor e o player estão realmente rodando.
 *  - O AVAudioEngine lança exceções Objective-C (que derrubam o app) se usado fora de estado: toda operação no
 *    motor é feita na main thread e somente com o motor verificado.
 */
final class InterfoneAudioNativo {

    /// Status do servidor que significam que a outra ponta encerrou a conversa.
    static let statusFinais: Set<String> = ["ended", "rejected", "canceled", "missed"]

    let callId: String
    private let baseUrl: String
    private let token: String

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let formatoRede: AVAudioFormat
    private var conversorMic: AVAudioConverter?
    private let fila = DispatchQueue(label: "br.seg.vps.cond.sectrum.interfone-audio")
    private let sessaoHttp: URLSession
    private var observadorConfig: NSObjectProtocol?
    private var timerGuarda: Timer?

    // Estado acessado somente dentro de `fila`
    private var pendenteEnvio = Data()
    private var enviosEmVoo = 0
    private var cursorEscuta = 0
    private var escutaEmCurso = false
    private var falhasSeguidas = 0
    private var timerEscuta: DispatchSourceTimer?
    private var estatMicSomaQuad: Double = 0
    private var estatMicAmostras = 0
    private var estatRxSomaQuad: Double = 0
    private var estatRxAmostras = 0
    private var estatPacotesEnviados = 0
    private var estatPacotesRecebidos = 0
    private var estatFalhasEnvio = 0

    // Estado do motor de áudio (main thread)
    private(set) var iniciado = false
    private var motorAtivo = false
    private var tapInstalado = false
    private var tentativasInicio = 0
    private var encerrado = false
    private var viaVozDesejado = false
    private var usarProcessamentoVoz = true
    private var framesNaFila = 0
    private var geracaoPlayer = 0
    private var ultimoConsumoPlayer = Date()
    private var segundosAtivo = 0
    private var reinicios = 0
    private var ultimaMontagem = Date.distantPast

    /// Quando true envia silêncio (mantém a chamada viva no servidor) em vez da voz do microfone.
    var mudo = false

    /// Chamado na main queue quando a outra ponta desligou/recusou ou a chamada deixou de existir no servidor.
    var aoEncerrarRemotamente: ((String) -> Void)?

    /// Tabela de decodificação µ-law -> Float32 pré-calculada (256 valores).
    private static let tabelaUlaw: [Float] = (0..<256).map { InterfoneAudioNativo.ulawParaFloat(UInt8($0)) }

    init(callId: String, baseUrl: String, token: String) {
        self.callId = callId
        self.baseUrl = baseUrl.hasSuffix("/") ? String(baseUrl.dropLast()) : baseUrl
        self.token = token
        self.formatoRede = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 8000, channels: 1, interleaved: false)!
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 4
        cfg.httpMaximumConnectionsPerHost = 4
        cfg.waitsForConnectivity = false
        self.sessaoHttp = URLSession(configuration: cfg)
    }

    deinit {
        if let obs = observadorConfig {
            NotificationCenter.default.removeObserver(obs)
        }
        timerGuarda?.invalidate()
    }

    // MARK: - Ciclo de vida

    /// Liga microfone + saída de áudio. Deve ser chamado com a AVAudioSession já ativa (.playAndRecord).
    /// Se o microfone ainda não estiver disponível (comum logo após o app ser acordado pelo VoIP Push),
    /// tenta novamente algumas vezes em vez de falhar.
    func iniciar() {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in self?.iniciar() }
            return
        }
        guard !iniciado, !encerrado else { return }
        iniciado = true
        tentativasInicio += 1
        // Se já falhou algumas vezes, tenta sem o processamento de voz (alguns aparelhos/rotas não suportam)
        usarProcessamentoVoz = tentativasInicio <= 3

        // A saída (fone/viva-voz) é aplicada ANTES de ligar o motor para não provocar uma
        // mudança de configuração logo em seguida (que parava o motor).
        aplicarSaida()

        guard montarEIniciarMotor(contexto: "iniciar tentativa \(tentativasInicio)") else {
            agendarNovaTentativa()
            return
        }

        motorAtivo = true
        observarMudancasDeConfiguracao()
        iniciarCaoDeGuarda()
        iniciarLoopEscuta()
        SectrumDiag.log("audio: conversa nativa ATIVA (\(callId))")
    }

    /// Monta o grafo de áudio do zero (processamento de voz, player, tap do microfone) e liga o motor.
    /// Retorna false se o microfone ainda não estiver disponível ou o motor não ligar.
    @discardableResult
    private func montarEIniciarMotor(contexto: String) -> Bool {
        desmontarMotor()

        let input = engine.inputNode
        do {
            try input.setVoiceProcessingEnabled(usarProcessamentoVoz)
        } catch {
            SectrumDiag.log("audio: voice processing indisponível (\(error.localizedDescription))")
        }

        let formatoMic = input.outputFormat(forBus: 0)
        let sessao = AVAudioSession.sharedInstance()
        SectrumDiag.log("audio: \(contexto) vp=\(usarProcessamentoVoz) mic=\(formatoMic.sampleRate)Hz/\(formatoMic.channelCount)ch categoria=\(sessao.category.rawValue) modo=\(sessao.mode.rawValue) permissao=\(AppDelegate.descreverPermissaoMicrofone()) rota=\(Self.descreverRota())")
        guard formatoMic.sampleRate > 0, formatoMic.channelCount > 0 else {
            SectrumDiag.log("audio: microfone ainda sem formato")
            return false
        }

        if player.engine == nil {
            engine.attach(player)
        }
        engine.connect(player, to: engine.mainMixerNode, format: formatoRede)
        engine.mainMixerNode.outputVolume = 1.0
        player.volume = 1.0

        conversorMic = nil
        // format: nil => usa exatamente o formato atual do barramento (evita exceção por formato divergente)
        input.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
            self?.processarMicrofone(buffer)
        }
        tapInstalado = true

        engine.prepare()
        do {
            try engine.start()
        } catch {
            SectrumDiag.log("audio: engine.start falhou (\(error.localizedDescription))")
            desmontarMotor()
            return false
        }
        guard engine.isRunning else {
            SectrumDiag.log("audio: engine não ficou rodando")
            desmontarMotor()
            return false
        }

        reiniciarPlayer()
        ultimaMontagem = Date()
        return true
    }

    /// Desfaz o grafo (tap + motor) para remontar do zero.
    private func desmontarMotor() {
        if tapInstalado {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalado = false
        }
        if player.engine != nil {
            player.stop()
        }
        if engine.isRunning {
            engine.stop()
        }
    }

    /// Zera a fila do player e volta a tocar (descarta áudio atrasado que ficou preso).
    private func reiniciarPlayer() {
        geracaoPlayer += 1
        framesNaFila = 0
        ultimoConsumoPlayer = Date()
        if player.engine != nil {
            player.stop()
            if engine.isRunning {
                player.play()
            }
        }
    }

    private func agendarNovaTentativa() {
        iniciado = false
        guard tentativasInicio < 8, !encerrado else {
            SectrumDiag.log("audio: desistiu após \(tentativasInicio) tentativas")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self = self, !self.encerrado else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
            self.iniciar()
        }
    }

    /// Remonta o motor após o iOS pará-lo (mudança de rota/configuração ou interrupção).
    private func remontarMotor(motivo: String) {
        guard !encerrado, motorAtivo else { return }
        reinicios += 1
        if montarEIniciarMotor(contexto: "remontar (\(motivo)) #\(reinicios)") {
            SectrumDiag.log("audio: motor remontado com sucesso (rota=\(Self.descreverRota()))")
        } else {
            SectrumDiag.log("audio: falha ao remontar motor - nova tentativa no cão de guarda")
        }
    }

    private func observarMudancasDeConfiguracao() {
        guard observadorConfig == nil else { return }
        observadorConfig = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            guard let self = self, !self.encerrado, self.motorAtivo else { return }
            // A própria remontagem gera esta notificação: ignora logo após montar (o cão de guarda cobre o resto)
            if Date().timeIntervalSince(self.ultimaMontagem) < 1.0 && self.engine.isRunning { return }
            SectrumDiag.log("audio: mudança de configuração (rota=\(Self.descreverRota()), rodando=\(self.engine.isRunning))")
            // Pequena espera para o iOS terminar de trocar a rota antes de remontar
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.remontarMotor(motivo: "configuração")
            }
        }
    }

    /// Verifica a cada segundo se o motor e o player estão realmente funcionando e registra os níveis de áudio.
    private func iniciarCaoDeGuarda() {
        timerGuarda?.invalidate()
        let t = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.verificarSaude()
        }
        RunLoop.main.add(t, forMode: .common)
        timerGuarda = t
    }

    private func verificarSaude() {
        guard !encerrado, motorAtivo else { return }
        segundosAtivo += 1

        if !engine.isRunning {
            remontarMotor(motivo: "motor parado")
            return
        }
        if !player.isPlaying {
            SectrumDiag.log("audio: player parado - religando")
            reiniciarPlayer()
        } else if framesNaFila > 0 && Date().timeIntervalSince(ultimoConsumoPlayer) > 1.5 {
            // Há áudio na fila, mas o player não consome há 1,5 s: travou
            SectrumDiag.log("audio: player travado (fila=\(framesNaFila)) - religando")
            reiniciarPlayer()
        }

        // Níveis (0-100) a cada 5 s nos primeiros 30 s e depois a cada 30 s
        let deveRegistrar = (segundosAtivo <= 30 && segundosAtivo % 5 == 0) || segundosAtivo % 30 == 0
        if deveRegistrar {
            let est = fila.sync { () -> (Double, Double, Int, Int, Int) in
                let mic = estatMicAmostras > 0 ? sqrt(estatMicSomaQuad / Double(estatMicAmostras)) : 0
                let rx = estatRxAmostras > 0 ? sqrt(estatRxSomaQuad / Double(estatRxAmostras)) : 0
                let r = (mic, rx, estatPacotesEnviados, estatPacotesRecebidos, estatFalhasEnvio)
                estatMicSomaQuad = 0; estatMicAmostras = 0; estatRxSomaQuad = 0; estatRxAmostras = 0
                estatPacotesEnviados = 0; estatPacotesRecebidos = 0; estatFalhasEnvio = 0
                return r
            }
            SectrumDiag.log(String(
                format: "audio: t=%ds mic=%.1f%% rx=%.1f%% env=%d rec=%d falhasEnv=%d fila=%d player=%@ mudo=%@ rota=%@",
                segundosAtivo, est.0 * 100, est.1 * 100, est.2, est.3, est.4, framesNaFila,
                player.isPlaying ? "on" : "off", mudo ? "sim" : "nao", Self.descreverRota()
            ))
        }
    }

    /// Fone de ouvido (padrão, como uma ligação comum) ou viva-voz.
    func definirViaVoz(_ ativo: Bool) {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in self?.definirViaVoz(ativo) }
            return
        }
        viaVozDesejado = ativo
        aplicarSaida()
    }

    private func aplicarSaida() {
        do {
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(viaVozDesejado ? .speaker : .none)
        } catch {
            SectrumDiag.log("audio: falha ao trocar saída (\(error.localizedDescription))")
        }
    }

    /// Desliga microfone, saída de áudio e loops de rede.
    func encerrar() {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in self?.encerrar() }
            return
        }
        guard !encerrado else { return }
        encerrado = true
        timerGuarda?.invalidate()
        timerGuarda = nil
        // Executado na mesma fila serial dos loops de rede: nenhuma requisição nova é criada após a invalidação
        fila.async { [weak self] in
            guard let self = self else { return }
            self.timerEscuta?.cancel()
            self.timerEscuta = nil
            self.sessaoHttp.finishTasksAndInvalidate()
        }
        if let obs = observadorConfig {
            NotificationCenter.default.removeObserver(obs)
            observadorConfig = nil
        }
        desmontarMotor()
        motorAtivo = false
        try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.none)
        SectrumDiag.log("audio: conversa nativa encerrada (\(callId)) após \(segundosAtivo)s, remontagens=\(reinicios)")
    }

    static func descreverRota() -> String {
        AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
    }

    // MARK: - Envio (microfone -> servidor)

    /// Executado na thread de áudio: converte para 8 kHz mono e codifica em µ-law.
    private func processarMicrofone(_ buffer: AVAudioPCMBuffer) {
        guard !encerrado, buffer.frameLength > 0, buffer.format.sampleRate > 0 else { return }

        // (Re)cria o conversor se o formato do microfone mudou (ex.: troca para Bluetooth)
        if conversorMic == nil || conversorMic?.inputFormat != buffer.format {
            conversorMic = AVAudioConverter(from: buffer.format, to: formatoRede)
        }
        guard let conversor = conversorMic else { return }

        let razao = formatoRede.sampleRate / buffer.format.sampleRate
        let capacidade = AVAudioFrameCount(Double(buffer.frameLength) * razao) + 64
        guard let saida = AVAudioPCMBuffer(pcmFormat: formatoRede, frameCapacity: capacidade) else { return }

        var entregue = false
        var erro: NSError?
        let status = conversor.convert(to: saida, error: &erro) { _, statusEntrada in
            if entregue {
                // `.noDataNow` preserva o estado do reamostrador entre blocos (sem estalos)
                statusEntrada.pointee = .noDataNow
                return nil
            }
            entregue = true
            statusEntrada.pointee = .haveData
            return buffer
        }
        guard status != .error, saida.frameLength > 0, let canal = saida.floatChannelData?[0] else { return }

        let n = Int(saida.frameLength)
        var bytes = [UInt8](repeating: 0xFF, count: n) // 0xFF = silêncio em µ-law
        var somaQuad: Double = 0
        for i in 0..<n {
            let v = canal[i].isFinite ? max(-1.0, min(1.0, canal[i])) : 0
            somaQuad += Double(v * v)
            if !mudo {
                bytes[i] = Self.linearParaUlaw(Int16(v * 32767.0))
            }
        }
        fila.async { [weak self] in
            guard let self = self else { return }
            self.estatMicSomaQuad += somaQuad
            self.estatMicAmostras += n
            self.enfileirarEnvio(bytes)
        }
    }

    private func enfileirarEnvio(_ bytes: [UInt8]) {
        guard !encerrado else { return }
        pendenteEnvio.append(contentsOf: bytes)
        // Rede lenta: nunca acumula mais que ~0,6 s pendente (descarta o mais antigo para não criar atraso)
        if pendenteEnvio.count > 4800 {
            pendenteEnvio.removeFirst(pendenteEnvio.count - 4800)
        }
        // ~180 ms por pacote (1440 bytes a 8 kHz), igual ao modo Full-Duplex do React
        guard pendenteEnvio.count >= 1440, enviosEmVoo < 3 else { return }
        let pacote = pendenteEnvio
        pendenteEnvio = Data()
        enviarPacote(pacote)
    }

    private func enviarPacote(_ pacote: Data) {
        guard let url = URL(string: "\(baseUrl)/api.php?route=morador_interfone_falar") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "call_id": callId,
            "audio_base64": pacote.base64EncodedString(),
        ])
        enviosEmVoo += 1
        sessaoHttp.dataTask(with: req) { [weak self] _, resp, _ in
            guard let self = self else { return }
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200
            self.fila.async {
                self.enviosEmVoo = max(0, self.enviosEmVoo - 1)
                if ok {
                    self.estatPacotesEnviados += 1
                } else {
                    self.estatFalhasEnvio += 1
                }
            }
        }.resume()
    }

    // MARK: - Escuta (servidor -> fone/viva-voz)

    private func iniciarLoopEscuta() {
        fila.async { [weak self] in
            guard let self = self, self.timerEscuta == nil, !self.encerrado else { return }
            let t = DispatchSource.makeTimerSource(queue: self.fila)
            t.schedule(deadline: .now(), repeating: .milliseconds(140))
            t.setEventHandler { [weak self] in
                self?.cicloEscuta()
            }
            t.resume()
            self.timerEscuta = t
        }
    }

    private func cicloEscuta() {
        guard !encerrado, !escutaEmCurso else { return }
        var comp = URLComponents(string: "\(baseUrl)/api.php")
        comp?.queryItems = [
            URLQueryItem(name: "route", value: "morador_interfone_escutar"),
            URLQueryItem(name: "call_id", value: callId),
            URLQueryItem(name: "cursor", value: String(cursorEscuta)),
        ]
        guard let url = comp?.url else { return }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        escutaEmCurso = true
        sessaoHttp.dataTask(with: req) { [weak self] data, resp, _ in
            guard let self = self else { return }
            let http = (resp as? HTTPURLResponse)?.statusCode ?? 0
            self.fila.async {
                self.escutaEmCurso = false
                self.processarRespostaEscuta(data: data, http: http)
            }
        }.resume()
    }

    private func processarRespostaEscuta(data: Data?, http: Int) {
        guard !encerrado else { return }

        if http == 401 || http == 403 {
            encerrarPorRemoto("ended")
            return
        }
        guard http == 200, let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // Sem rede por ~25 s seguidos: encerra a chamada
            falhasSeguidas += 1
            if falhasSeguidas > 180 {
                encerrarPorRemoto("ended")
            }
            return
        }
        falhasSeguidas = 0

        if let c = json["cursor"] as? Int, c > 0 {
            cursorEscuta = c
        }
        if let b64 = json["audio_b64"] as? String, !b64.isEmpty, let bytes = Data(base64Encoded: b64), !bytes.isEmpty {
            estatPacotesRecebidos += 1
            // Decodifica aqui (fora da main thread) e mede o nível da voz recebida
            let amostras = bytes.map { Self.tabelaUlaw[Int($0)] }
            estatRxSomaQuad += amostras.reduce(0) { $0 + Double($1 * $1) }
            estatRxAmostras += amostras.count
            DispatchQueue.main.async { [weak self] in
                self?.reproduzir(amostras)
            }
        }
        let status = ((json["call_status"] as? String) ?? "").lowercased()
        if Self.statusFinais.contains(status) {
            encerrarPorRemoto(status)
        }
    }

    /// Executado na main thread (mesma thread que liga/desliga o motor), evitando usar o player com o motor parado.
    private func reproduzir(_ amostras: [Float]) {
        let n = amostras.count
        guard !encerrado, motorAtivo, engine.isRunning, player.engine != nil, n > 0 else { return }
        // Se já houver mais de ~0,5 s aguardando para tocar, descarta para não acumular atraso na conversa
        guard framesNaFila <= 4000 else { return }
        guard let buf = AVAudioPCMBuffer(pcmFormat: formatoRede, frameCapacity: AVAudioFrameCount(n)),
              let canal = buf.floatChannelData?[0] else { return }
        buf.frameLength = AVAudioFrameCount(n)
        for i in 0..<n {
            canal[i] = amostras[i]
        }
        framesNaFila += n
        let geracao = geracaoPlayer
        player.scheduleBuffer(buf) { [weak self] in
            DispatchQueue.main.async {
                guard let self = self, geracao == self.geracaoPlayer else { return }
                self.framesNaFila = max(0, self.framesNaFila - n)
                self.ultimoConsumoPlayer = Date()
            }
        }
        if !player.isPlaying {
            player.play()
        }
    }

    private func encerrarPorRemoto(_ motivo: String) {
        guard !encerrado else { return }
        timerEscuta?.cancel()
        timerEscuta = nil
        SectrumDiag.log("audio: outra ponta encerrou (\(motivo))")
        DispatchQueue.main.async { [weak self] in
            self?.aoEncerrarRemotamente?(motivo)
        }
    }

    // MARK: - Codec ITU-T G.711 µ-law (idêntico ao de src/lib/interfoneAudio.ts)

    static func linearParaUlaw(_ amostra: Int16) -> UInt8 {
        let bias = 0x84
        let clip = 32635
        var s = Int(amostra)
        var sinal = 0
        if s < 0 {
            sinal = 0x80
            s = -s
        }
        if s > clip {
            s = clip
        }
        s += bias
        var expoente = 7
        var mascara = 0x4000
        while (s & mascara) == 0 && expoente > 0 {
            expoente -= 1
            mascara >>= 1
        }
        let mantissa = (s >> (expoente + 3)) & 0x0F
        return UInt8(~(sinal | (expoente << 4) | mantissa) & 0xFF)
    }

    static func ulawParaFloat(_ byte: UInt8) -> Float {
        let u = Int(~byte & 0xFF)
        let sinal = u & 0x80
        let expoente = (u >> 4) & 0x07
        let mantissa = u & 0x0F
        var amostra = ((mantissa << 3) + 0x84) << expoente
        amostra -= 0x84
        return Float(sinal != 0 ? -amostra : amostra) / 32768.0
    }
}
