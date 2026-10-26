package br.seg.vps.cond.sectrum;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Serviço "de plantão" do Sectrum Condomínio, ligado SOMENTE durante uma chamada de interfone ou emergência.
 *
 * Antes este serviço ficava em primeiro plano 24 h por dia consultando o servidor a cada 2,4 s (tipo `specialUse`),
 * o que a Google Play não aceita para esse caso e gastava bateria. Agora:
 *  - o servidor envia um push FCM de alta prioridade (SectrumMessagingService) no instante da chamada/emergência;
 *  - o push liga este serviço por no máximo ~2,5 min (tipo `shortService`, sem permissão especial);
 *  - ele toca a campainha/sirene, abre a tela cheia sobre o bloqueio e acompanha o servidor até a chamada
 *    ser atendida/encerrada (ou a emergência terminar) e então se desliga sozinho.
 */
public class SectrumGuardService extends Service {

    public static final String PREFS_NAME = "sectrum_prefs";
    public static final String KEY_TOKEN = "interfone_token";
    public static final String KEY_BASE_URL = "base_url";

    public static final String EXTRA_EVENTO = "evento";           // "interfone" ou "emergencia"
    public static final String EXTRA_CALL_ID = "call_id";
    public static final String EXTRA_ORIGEM = "origem";
    public static final String EXTRA_UNIDADE = "unidade";
    public static final String EXTRA_TIPO_EMERGENCIA = "tipo_emergencia";
    public static final String EXTRA_AUTOR = "autor";
    public static final String EXTRA_FURAR_DND = "furar_dnd";

    static final String CHANNEL_BG = "sectrum_plantao_v3";
    static final String CHANNEL_CALL = "sectrum_interfone_calls_v2";
    static final String CHANNEL_EMERGENCY = "sectrum_emergencia_alarm_v2";
    static final String CHANNEL_GERAL = "sectrum_avisos_v1";

    static final int NOTIF_ID_BG = 9100;
    static final int NOTIF_ID_CALL = 9101;
    static final int NOTIF_ID_EMERGENCY = 9102;

    /** Limite do serviço curto (o Android encerra `shortService` em 3 min). */
    private static final long DURACAO_MAX_MS = 150_000L;

    private volatile boolean rodando = false;
    private volatile long prazoFinal = 0L;
    private volatile boolean monitorarInterfone = false;
    private volatile boolean monitorarEmergencia = false;
    private Thread workerThread = null;
    private String ultimoCallIdNotificado = "";
    private int ultimaEmergenciaIdNotificada = 0;
    private int verificacoesSemEvento = 0;

    /** Liga o serviço de plantão a partir do push (ou da tela). */
    public static boolean iniciar(Context ctx, Intent dados) {
        try {
            Intent svc = new Intent(ctx, SectrumGuardService.class);
            if (dados != null && dados.getExtras() != null) {
                svc.putExtras(dados.getExtras());
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svc);
            } else {
                ctx.startService(svc);
            }
            return true;
        } catch (Exception e) {
            // Ex.: Android não permitiu iniciar serviço em segundo plano -> quem chamou mostra a notificação direto
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanaisNotificacao(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notifBg = construirNotificacaoPlantao();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID_BG, notifBg, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            } else {
                startForeground(NOTIF_ID_BG, notifBg);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String evento = intent != null ? intent.getStringExtra(EXTRA_EVENTO) : null;
        if ("emergencia".equals(evento)) {
            monitorarEmergencia = true;
            int idEm = 0;
            try {
                idEm = Integer.parseInt(intent.getStringExtra("emergencia_id"));
            } catch (Exception ignored) {}
            if (idEm > 0 && idEm != ultimaEmergenciaIdNotificada) {
                ultimaEmergenciaIdNotificada = idEm;
                dispararEmergencia(
                        this,
                        intent.getStringExtra(EXTRA_TIPO_EMERGENCIA),
                        intent.getStringExtra(EXTRA_UNIDADE),
                        intent.getStringExtra(EXTRA_AUTOR),
                        !"0".equals(intent.getStringExtra(EXTRA_FURAR_DND))
                );
            }
        } else {
            monitorarInterfone = true;
            String callId = intent != null ? intent.getStringExtra(EXTRA_CALL_ID) : null;
            if (callId != null && !callId.isEmpty() && !callId.equals(ultimoCallIdNotificado)) {
                ultimoCallIdNotificado = callId;
                dispararChamada(this, intent.getStringExtra(EXTRA_ORIGEM), intent.getStringExtra(EXTRA_UNIDADE));
            }
        }

        prazoFinal = System.currentTimeMillis() + DURACAO_MAX_MS;
        verificacoesSemEvento = 0;
        if (!rodando) {
            rodando = true;
            workerThread = new Thread(this::loopPlantao, "SectrumPlantao");
            workerThread.setDaemon(true);
            workerThread.start();
        }
        return START_NOT_STICKY;
    }

    /** Android 14: limite do `shortService` atingido. */
    @Override
    public void onTimeout(int startId) {
        encerrar();
    }

    /** Android 15+: limite do serviço atingido. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        encerrar();
    }

    @Override
    public void onDestroy() {
        rodando = false;
        if (workerThread != null) {
            workerThread.interrupt();
            workerThread = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void encerrar() {
        rodando = false;
        SectrumAudioSynth.pararToqueInterfone(this);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {}
        stopSelf();
    }

    /** Acompanha o servidor até a chamada/emergência terminar; depois se desliga. */
    private void loopPlantao() {
        try {
            Thread.sleep(1500);
        } catch (InterruptedException ie) {
            return;
        }
        while (rodando && !Thread.currentThread().isInterrupted()) {
            try {
                if (System.currentTimeMillis() > prazoFinal) {
                    break;
                }
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                String token = prefs.getString(KEY_TOKEN, "");
                String baseUrl = prefs.getString(KEY_BASE_URL, "https://cond.vps.seg.br");
                if (token == null || token.isEmpty()) {
                    break;
                }

                boolean algoAtivo = false;
                if (monitorarInterfone) {
                    algoAtivo |= verificarInterfoneServidor(baseUrl, token);
                }
                if (monitorarEmergencia) {
                    algoAtivo |= verificarEmergenciaServidor(baseUrl, token);
                }
                // Sem chamada/emergência ativa por ~6 s seguidos: missão cumprida
                verificacoesSemEvento = algoAtivo ? 0 : verificacoesSemEvento + 1;
                if (verificacoesSemEvento >= 3) {
                    break;
                }
                Thread.sleep(2000);
            } catch (InterruptedException ie) {
                return;
            } catch (Exception ignored) {
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
        encerrar();
    }

    /** @return true se ainda há chamada tocando para a unidade */
    private boolean verificarInterfoneServidor(String baseUrl, String token) {
        JSONObject resp = requisitarGetJson(baseUrl + "/api.php?route=morador_interfone_status", token);
        if (resp == null) return true; // sem rede: continua tentando até o prazo
        JSONObject chamada = resp.optJSONObject("chamada");
        if (chamada != null && "ringing".equalsIgnoreCase(chamada.optString("status"))) {
            String callId = chamada.optString("call_id", "");
            if (!callId.isEmpty() && !callId.equals(ultimoCallIdNotificado)) {
                ultimoCallIdNotificado = callId;
                dispararChamada(this, chamada.optString("nome_portaria", "Interfone"), chamada.optString("unidade", "Seu Apartamento"));
            }
            return true;
        }
        if (!ultimoCallIdNotificado.isEmpty()) {
            ultimoCallIdNotificado = "";
            SectrumAudioSynth.pararToqueInterfone(this);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID_CALL);
        }
        return false;
    }

    /** @return true se a emergência continua ativa */
    private boolean verificarEmergenciaServidor(String baseUrl, String token) {
        JSONObject resp = requisitarGetJson(baseUrl + "/api.php?route=emergencia_status_ativo", token);
        if (resp == null) return true;
        JSONObject em = resp.optJSONObject("emergencia");
        if (em != null && "ativo".equalsIgnoreCase(em.optString("status"))) {
            int idEm = em.optInt("id", 0);
            if (idEm > 0 && idEm != ultimaEmergenciaIdNotificada) {
                ultimaEmergenciaIdNotificada = idEm;
                dispararEmergencia(this, em.optString("tipo", "seguranca"), em.optString("unidade_label", "Condomínio"),
                        em.optString("autor_nome", "Morador"), resp.optBoolean("furar_nao_perturbe", true));
            }
            return true;
        }
        if (ultimaEmergenciaIdNotificada != 0) {
            ultimaEmergenciaIdNotificada = 0;
            SectrumAudioSynth.pararSireneEmergencia(this);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID_EMERGENCY);
        }
        return false;
    }

    // ===================== Notificações (usadas pelo serviço e pelo push) =====================

    static void criarCanaisNotificacao(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Remove o canal da antiga notificação fixa 24 h
        try {
            nm.deleteNotificationChannel("sectrum_guard_bg");
        } catch (Exception ignored) {}

        NotificationChannel chBg = new NotificationChannel(CHANNEL_BG, "Chamada em andamento", NotificationManager.IMPORTANCE_LOW);
        chBg.setDescription("Aparece só enquanto uma chamada de interfone ou emergência está sendo recebida.");
        chBg.setShowBadge(false);
        nm.createNotificationChannel(chBg);

        NotificationChannel chCall = new NotificationChannel(CHANNEL_CALL, "Chamadas de Interfone", NotificationManager.IMPORTANCE_HIGH);
        chCall.setDescription("Toque e abertura de tela em chamadas de interfone da portaria ou apartamentos.");
        chCall.enableVibration(true);
        chCall.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(chCall);

        NotificationChannel chEm = new NotificationChannel(CHANNEL_EMERGENCY, "Alarme de Emergência (SOS)", NotificationManager.IMPORTANCE_HIGH);
        chEm.setDescription("Sirene de socorro médico ou segurança no condomínio.");
        chEm.enableVibration(true);
        chEm.setBypassDnd(true);
        chEm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(chEm);

        NotificationChannel chGeral = new NotificationChannel(CHANNEL_GERAL, "Avisos do condomínio", NotificationManager.IMPORTANCE_DEFAULT);
        chGeral.setDescription("Avisos, encomendas, visitantes e comunicados.");
        nm.createNotificationChannel(chGeral);
    }

    private Notification construirNotificacaoPlantao() {
        Intent intentApp = new Intent(this, MainActivity.class);
        intentApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 100, intentApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_BG)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("Sectrum Condomínio")
                .setContentText("Recebendo chamada / alerta do condomínio…")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    static void dispararChamada(Context ctx, String nomeOrigem, String unidade) {
        criarCanaisNotificacao(ctx);
        acordarDispositivo(ctx);
        if (!MainActivity.estaEmPrimeiroPlano) {
            SectrumAudioSynth.iniciarToqueInterfone(ctx);
        }
        String origem = (nomeOrigem == null || nomeOrigem.isEmpty()) ? "Interfone" : nomeOrigem;
        String unid = (unidade == null || unidade.isEmpty()) ? "Seu Apartamento" : unidade;

        Intent fullScreenIntent = new Intent(ctx, MainActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("sectrum_evento", "interfone");
        PendingIntent fullScreenPi = PendingIntent.getActivity(ctx, 201, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_CALL)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("📲 Chamada de interfone — " + origem)
                .setContentText("Chamando " + unid + ". Toque para atender.")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setTimeoutAfter(60_000L)
                .setContentIntent(fullScreenPi)
                .setFullScreenIntent(fullScreenPi, true);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID_CALL, builder.build());
    }

    static void dispararEmergencia(Context ctx, String tipo, String unidadeLabel, String autorNome, boolean furarDnd) {
        criarCanaisNotificacao(ctx);
        acordarDispositivo(ctx);
        SectrumAudioSynth.iniciarSireneEmergencia(ctx, furarDnd);
        String unid = (unidadeLabel == null || unidadeLabel.isEmpty()) ? "Condomínio" : unidadeLabel;
        String autor = (autorNome == null || autorNome.isEmpty()) ? "Morador" : autorNome;
        String titulo = "medica".equalsIgnoreCase(tipo) ? "🚑 EMERGÊNCIA MÉDICA — " + unid : "🚨 EMERGÊNCIA DE SEGURANÇA — " + unid;
        String texto = "🆘 " + autor + " pediu socorro em " + unid + "! Toque para abrir.";

        Intent fullScreenIntent = new Intent(ctx, MainActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("sectrum_evento", "emergencia");
        PendingIntent fullScreenPi = PendingIntent.getActivity(ctx, 202, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_EMERGENCY)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(fullScreenPi)
                .setFullScreenIntent(fullScreenPi, true);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID_EMERGENCY, builder.build());
    }

    @SuppressWarnings("deprecation")
    static void acordarDispositivo(Context ctx) {
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "sectrum:WakeAlertLock");
                wl.acquire(15000L);
            }
        } catch (Exception ignored) {}
    }

    private JSONObject requisitarGetJson(String urlStr, String bearerToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(4500);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            int code = conn.getResponseCode();
            if (code != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
