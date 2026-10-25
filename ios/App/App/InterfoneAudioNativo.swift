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
            if trilha.count > 60 {
                trilha.removeFirst(trilha.count - 60)
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
 * Robustez: o AVAudioEngine lança exceções Objective-C (que derrubam o app e não podem ser capturadas em Swift)
 * se for usado fora de estado. Por isso toda operação no motor verifica antes se ele está realmente rodando.
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

    // Estado do motor de áudio (main thread)
    private(set) var iniciado = false
    private var motorAtivo = false
    private var tapInstalado = false
    private var tentativasInicio = 0
    private var encerrado = false
    private var viaVozDesejado = false

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

        let input = engine.inputNode
        // Cancelamento de eco (AEC) + supressão de ruído nativos do iOS
        do {
            try input.setVoiceProcessingEnabled(true)
        } catch {
            SectrumDiag.log("audio: voice processing indisponível (\(error.localizedDescription))")
        }

        let formatoMic = input.outputFormat(forBus: 0)
        SectrumDiag.log("audio: iniciar tentativa \(tentativasInicio) mic=\(formatoMic.sampleRate)Hz/\(formatoMic.channelCount)ch rota=\(Self.descreverRota())")
        guard formatoMic.sampleRate > 0, formatoMic.channelCount > 0 else {
            agendarNovaTentativa(motivo: "microfone sem formato")
            return
        }

        if player.engine == nil {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: formatoRede)
        }

        if !tapInstalado {
            // format: nil => usa exatamente o formato atual do barramento (evita exceção por formato divergente)
            input.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
                self?.processarMicrofone(buffer)
            }
            tapInstalado = true
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            agendarNovaTentativa(motivo: "engine.start: \(error.localizedDescription)")
            return
        }
        guard engine.isRunning else {
            agendarNovaTentativa(motivo: "engine não está rodando")
            return
        }

        motorAtivo = true
        player.play()
        aplicarSaida()
        observarMudancasDeConfiguracao()
        iniciarLoopEscuta()
        SectrumDiag.log("audio: conversa nativa ATIVA (\(callId))")
    }

    private func agendarNovaTentativa(motivo: String) {
        SectrumDiag.log("audio: falha ao iniciar (\(motivo))")
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

    private func observarMudancasDeConfiguracao() {
        guard observadorConfig == nil else { return }
        // Troca de rota (fone / viva-voz / Bluetooth) pode parar o engine: religa com segurança
        observadorConfig = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            guard let self = self, !self.encerrado, self.motorAtivo else { return }
            SectrumDiag.log("audio: mudança de configuração (rota=\(Self.descreverRota()))")
            if !self.engine.isRunning {
                self.engine.prepare()
                do {
                    try self.engine.start()
                } catch {
                    SectrumDiag.log("audio: falha ao religar engine (\(error.localizedDescription))")
                    return
                }
            }
            if self.engine.isRunning && !self.player.isPlaying {
                self.player.play()
            }
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
        if tapInstalado {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalado = false
        }
        if motorAtivo {
            player.stop()
        }
        if engine.isRunning {
            engine.stop()
        }
        motorAtivo = false
        try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.none)
        SectrumDiag.log("audio: conversa nativa encerrada (\(callId))")
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
        if !mudo {
            for i in 0..<n {
                let v = canal[i].isFinite ? max(-1.0, min(1.0, canal[i])) : 0
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
        if let b64 = json["audio_b64"] as? String, !b64.isEmpty, let bytes = Data(base64Encoded: b64) {
            let n = bytes.count
            DispatchQueue.main.async { [weak self] in
                self?.reproduzir(bytes, frames: n)
            }
        }
        let status = ((json["call_status"] as? String) ?? "").lowercased()
        if Self.statusFinais.contains(status) {
            encerrarPorRemoto(status)
        }
    }

    /// Executado na main thread (mesma thread que liga/desliga o motor), evitando usar o player com o motor parado.
    private func reproduzir(_ bytes: Data, frames n: Int) {
        guard !encerrado, motorAtivo, engine.isRunning, n > 0 else { return }
        // Se já houver mais de ~0,5 s aguardando para tocar, descarta para não acumular atraso na conversa
        guard framesNaFilaAtual() <= 4000 else { return }
        guard let buf = AVAudioPCMBuffer(pcmFormat: formatoRede, frameCapacity: AVAudioFrameCount(n)),
              let canal = buf.floatChannelData?[0] else { return }
        buf.frameLength = AVAudioFrameCount(n)
        bytes.withUnsafeBytes { (p: UnsafeRawBufferPointer) in
            for i in 0..<n {
                canal[i] = Self.tabelaUlaw[Int(p[i])]
            }
        }
        fila.sync { framesNaFila += n }
        player.scheduleBuffer(buf) { [weak self] in
            guard let self = self else { return }
            self.fila.async {
                self.framesNaFila = max(0, self.framesNaFila - n)
            }
        }
        if !player.isPlaying {
            player.play()
        }
    }

    private func framesNaFilaAtual() -> Int {
        fila.sync { framesNaFila }
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
