import Foundation
import AVFoundation

/**
 * Conversa de interfone entre apartamentos 100% NATIVA (Full-Duplex), usada quando a chamada é atendida pela
 * tela nativa do iOS (CallKit) — inclusive com a tela bloqueada ou com o app fechado, situações em que o
 * WKWebView não tem acesso ao microfone.
 *
 * Fala exatamente o mesmo protocolo do React (`src/lib/interfoneAudio.ts`), então o outro lado (Android, iOS
 * ou navegador) não percebe diferença:
 *   - Microfone -> 8000 Hz mono -> ITU-T G.711 µ-law -> Base64 -> POST `morador_interfone_falar` (~180 ms por pacote)
 *   - GET `morador_interfone_escutar` a cada ~140 ms -> µ-law -> PCM -> alto-falante/fone
 *
 * Usa o processamento de voz do iOS (cancelamento de eco + supressão de ruído), essencial no viva-voz.
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

    // Estado acessado somente dentro de `fila`
    private var pendenteEnvio = Data()
    private var enviosEmVoo = 0
    private var cursorEscuta = 0
    private var escutaEmCurso = false
    private var framesNaFila = 0
    private var falhasSeguidas = 0
    private var timerEscuta: DispatchSourceTimer?

    private(set) var iniciado = false
    private var encerrado = false

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
    }

    // MARK: - Ciclo de vida

    /// Liga microfone + alto-falante. Deve ser chamado depois que o CallKit ativar a AVAudioSession.
    func iniciar() {
        guard !iniciado, !encerrado else { return }
        iniciado = true

        do {
            let input = engine.inputNode
            // Cancelamento de eco (AEC) + supressão de ruído nativos do iOS
            try? input.setVoiceProcessingEnabled(true)

            let formatoMic = input.outputFormat(forBus: 0)
            guard formatoMic.sampleRate > 0, formatoMic.channelCount > 0 else {
                throw NSError(domain: "SectrumInterfone", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Microfone indisponível (permissão negada?)"])
            }
            conversorMic = AVAudioConverter(from: formatoMic, to: formatoRede)

            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: formatoRede)

            input.installTap(onBus: 0, bufferSize: 1024, format: formatoMic) { [weak self] buffer, _ in
                self?.processarMicrofone(buffer)
            }

            // Troca de rota (viva-voz / fone / Bluetooth) pode parar o engine: religa automaticamente
            observadorConfig = NotificationCenter.default.addObserver(
                forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
            ) { [weak self] _ in
                guard let self = self, !self.encerrado else { return }
                if !self.engine.isRunning {
                    try? self.engine.start()
                }
                if !self.player.isPlaying {
                    self.player.play()
                }
            }

            engine.prepare()
            try engine.start()
            player.play()
            print("[SectrumiOS] Áudio nativo do interfone iniciado (\(formatoMic.sampleRate) Hz) para \(callId)")
        } catch {
            print("[SectrumiOS] Falha ao iniciar áudio nativo do interfone: \(error)")
        }

        iniciarLoopEscuta()
    }

    /// Desliga microfone, alto-falante e loops de rede.
    func encerrar() {
        guard !encerrado else { return }
        encerrado = true
        // Executado na mesma fila serial dos loops de rede: nenhuma requisição nova é criada após a invalidação
        fila.async { [weak self] in
            guard let self = self else { return }
            self.timerEscuta?.cancel()
            self.timerEscuta = nil
            self.sessaoHttp.finishTasksAndInvalidate()
        }
        if iniciado {
            engine.inputNode.removeTap(onBus: 0)
            player.stop()
            engine.stop()
            try? engine.inputNode.setVoiceProcessingEnabled(false)
        }
        if let obs = observadorConfig {
            NotificationCenter.default.removeObserver(obs)
            observadorConfig = nil
        }
    }

    // MARK: - Envio (microfone -> servidor)

    /// Executado na thread de áudio: converte para 8 kHz mono e codifica em µ-law.
    private func processarMicrofone(_ buffer: AVAudioPCMBuffer) {
        guard !encerrado, let conversor = conversorMic, buffer.frameLength > 0 else { return }

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
        if !mudo {
            for i in 0..<n {
                let v = max(-1.0, min(1.0, canal[i]))
                bytes[i] = Self.linearParaUlaw(Int16(v * 32767.0))
            }
        }
        fila.async { [weak self] in
            self?.enfileirarEnvio(bytes)
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
        sessaoHttp.dataTask(with: req) { [weak self] _, _, _ in
            guard let self = self else { return }
            self.fila.async {
                self.enviosEmVoo = max(0, self.enviosEmVoo - 1)
            }
        }.resume()
    }

    // MARK: - Escuta (servidor -> alto-falante)

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
            encerrarPorRemoto("sem_autorizacao")
            return
        }
        guard http == 200, let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // Sem rede por ~25 s seguidos: encerra a chamada
            falhasSeguidas += 1
            if falhasSeguidas > 180 {
                encerrarPorRemoto("sem_rede")
            }
            return
        }
        falhasSeguidas = 0

        if let c = json["cursor"] as? Int, c > 0 {
            cursorEscuta = c
        }
        if let b64 = json["audio_b64"] as? String, !b64.isEmpty, let bytes = Data(base64Encoded: b64) {
            reproduzir(bytes)
        }
        let status = ((json["call_status"] as? String) ?? "").lowercased()
        if Self.statusFinais.contains(status) {
            encerrarPorRemoto(status)
        }
    }

    private func reproduzir(_ bytes: Data) {
        // Se já houver mais de ~0,5 s aguardando para tocar, descarta para não acumular atraso na conversa
        guard framesNaFila <= 4000 else { return }
        let n = bytes.count
        guard n > 0,
              let buf = AVAudioPCMBuffer(pcmFormat: formatoRede, frameCapacity: AVAudioFrameCount(n)),
              let canal = buf.floatChannelData?[0] else { return }
        buf.frameLength = AVAudioFrameCount(n)
        bytes.withUnsafeBytes { (p: UnsafeRawBufferPointer) in
            for i in 0..<n {
                canal[i] = Self.tabelaUlaw[Int(p[i])]
            }
        }
        framesNaFila += n
        player.scheduleBuffer(buf) { [weak self] in
            guard let self = self else { return }
            self.fila.async {
                self.framesNaFila = max(0, self.framesNaFila - n)
            }
        }
        if engine.isRunning && !player.isPlaying {
            player.play()
        }
    }

    private func encerrarPorRemoto(_ motivo: String) {
        guard !encerrado else { return }
        timerEscuta?.cancel()
        timerEscuta = nil
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
