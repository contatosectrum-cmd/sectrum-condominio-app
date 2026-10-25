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
 * Serviço Nativo em Primeiro Plano (Foreground Service) do Sectrum Condomínio:
 * - Mantém a escuta de chamadas VoIP (Interfone da Portaria e entre Apartamentos) e
 *   Alertas de Emergência SOS 24h por dia, mesmo com o aplicativo fechado ou tela bloqueada.
 * - Acorda a tela bloqueada (WakeLock + FullScreenIntent) e dispara o toque de chamada ou a
 *   Sirene da Defesa Civil nativa no canal de Alarme (furando o modo Silencioso/Não Perturbe).
 */
public class SectrumGuardService extends Service {

    public static final String PREFS_NAME = "sectrum_prefs";
    public static final String KEY_TOKEN = "interfone_token";
    public static final String KEY_BASE_URL = "base_url";

    private static final String CHANNEL_BG = "sectrum_guard_bg";
    private static final String CHANNEL_CALL = "sectrum_interfone_calls_v2";
    private static final String CHANNEL_EMERGENCY = "sectrum_emergencia_alarm_v2";

    private static final int NOTIF_ID_BG = 9100;
    private static final int NOTIF_ID_CALL = 9101;
    private static final int NOTIF_ID_EMERGENCY = 9102;

    private volatile boolean rodando = false;
    private Thread workerThread = null;
    private String ultimoCallIdNotificado = "";
    private int ultimaEmergenciaIdNotificada = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanaisNotificacao();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notifBg = construirNotificacaoMonitoramento();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                        NOTIF_ID_BG,
                        notifBg,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(NOTIF_ID_BG, notifBg);
            }
        } catch (Exception e) {
            try {
                startForeground(NOTIF_ID_BG, notifBg);
            } catch (Exception ignored) {}
        }

        if (!rodando) {
            rodando = true;
            workerThread = new Thread(this::loopMonitoramento, "SectrumGuardWorker");
            workerThread.setDaemon(true);
            workerThread.start();
        }

        return START_STICKY;
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

    private void criarCanaisNotificacao() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel chBg = new NotificationChannel(
                CHANNEL_BG,
                "Proteção de Interfone e Emergência",
                NotificationManager.IMPORTANCE_LOW
        );
        chBg.setDescription("Mantém o recebimento instantâneo de interfone e SOS mesmo com o app fechado.");
        chBg.setShowBadge(false);
        nm.createNotificationChannel(chBg);

        NotificationChannel chCall = new NotificationChannel(
                CHANNEL_CALL,
                "Chamadas de Interfone (VoIP)",
                NotificationManager.IMPORTANCE_HIGH
        );
        chCall.setDescription("Toque e abertura de tela em chamadas de interfone da portaria ou apartamentos.");
        chCall.enableVibration(true);
        chCall.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(chCall);

        NotificationChannel chEm = new NotificationChannel(
                CHANNEL_EMERGENCY,
                "Alarme Crítico de Emergência (SOS)",
                NotificationManager.IMPORTANCE_HIGH
        );
        chEm.setDescription("Sirene crítica de socorro médico ou segurança no condomínio.");
        chEm.enableVibration(true);
        chEm.setBypassDnd(true);
        chEm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(chEm);
    }

    private Notification construirNotificacaoMonitoramento() {
        Intent intentApp = new Intent(this, MainActivity.class);
        intentApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                100,
                intentApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_BG)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setContentTitle("Sectrum Condomínio Ativo")
                .setContentText("Interfone VoIP e Alerta de Emergência protegidos em 2º plano")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void loopMonitoramento() {
        while (rodando && !Thread.currentThread().isInterrupted()) {
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                String token = prefs.getString(KEY_TOKEN, "");
                String baseUrl = prefs.getString(KEY_BASE_URL, "https://cond.vps.seg.br");

                if (token != null && !token.isEmpty()) {
                    verificarInterfoneServidor(baseUrl, token);
                    verificarEmergenciaServidor(baseUrl, token);
                }

                Thread.sleep(2400);
            } catch (InterruptedException ie) {
                break;
            } catch (Exception ignored) {
                try {
                    Thread.sleep(4000);
                } catch (InterruptedException ie) {
                    break;
                }
            }
        }
    }

    private void verificarInterfoneServidor(String baseUrl, String token) {
        try {
            JSONObject resp = requisitarGetJson(baseUrl + "/api.php?route=morador_interfone_status", token);
            if (resp == null) return;

            JSONObject chamada = resp.optJSONObject("chamada");
            if (chamada != null && "ringing".equalsIgnoreCase(chamada.optString("status"))) {
                String callId = chamada.optString("call_id", "");
                String nomePortaria = chamada.optString("nome_portaria", "Portaria");
                String unidade = chamada.optString("unidade", "Seu Apartamento");

                if (!callId.isEmpty() && !callId.equals(ultimoCallIdNotificado)) {
                    ultimoCallIdNotificado = callId;
                    acordarTelaEDispararChamada(nomePortaria, unidade);
                }
            } else {
                if (!ultimoCallIdNotificado.isEmpty()) {
                    ultimoCallIdNotificado = "";
                    SectrumAudioSynth.pararToqueInterfone(this);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(NOTIF_ID_CALL);
                }
            }
        } catch (Exception ignored) {}
    }

    private void verificarEmergenciaServidor(String baseUrl, String token) {
        try {
            JSONObject resp = requisitarGetJson(baseUrl + "/api.php?route=emergencia_status_ativo", token);
            if (resp == null) return;

            JSONObject em = resp.optJSONObject("emergencia");
            boolean furarDnd = resp.optBoolean("furar_nao_perturbe", true);

            if (em != null && "ativo".equalsIgnoreCase(em.optString("status"))) {
                int idEm = em.optInt("id", 0);
                String tipo = em.optString("tipo", "seguranca");
                String unidadeLabel = em.optString("unidade_label", "Condomínio");
                String autorNome = em.optString("autor_nome", "Morador");

                if (idEm > 0 && idEm != ultimaEmergenciaIdNotificada) {
                    ultimaEmergenciaIdNotificada = idEm;
                    acordarTelaEDispararEmergencia(tipo, unidadeLabel, autorNome, furarDnd);
                }
            } else {
                if (ultimaEmergenciaIdNotificada != 0) {
                    ultimaEmergenciaIdNotificada = 0;
                    SectrumAudioSynth.pararSireneEmergencia(this);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(NOTIF_ID_EMERGENCY);
                }
            }
        } catch (Exception ignored) {}
    }

    private void acordarTelaEDispararChamada(String nomeOrigem, String unidade) {
        acordarDispositivo();
        if (!MainActivity.estaEmPrimeiroPlano) {
            SectrumAudioSynth.iniciarToqueInterfone(this);
        }

        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        fullScreenIntent.putExtra("sectrum_evento", "interfone");

        PendingIntent fullScreenPi = PendingIntent.getActivity(
                this,
                201,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_CALL)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("📲 CHAMADA DE INTERFONE — " + nomeOrigem)
                .setContentText("🔴 Chamando " + unidade + " agora! Toque para atender e ver câmera.")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(fullScreenPi)
                .setFullScreenIntent(fullScreenPi, true);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID_CALL, builder.build());
        }

        if (!MainActivity.estaEmPrimeiroPlano) {
            try {
                startActivity(fullScreenIntent);
            } catch (Exception ignored) {}
        }
    }

    private void acordarTelaEDispararEmergencia(String tipo, String unidadeLabel, String autorNome, boolean furarDnd) {
        acordarDispositivo();
        SectrumAudioSynth.iniciarSireneEmergencia(this, furarDnd);

        String titulo = "medica".equalsIgnoreCase(tipo)
                ? "🚑 EMERGÊNCIA MÉDICA — " + unidadeLabel
                : "🚨 EMERGÊNCIA DE SEGURANÇA — " + unidadeLabel;
        String texto = "🆘 " + autorNome + " pediu socorro imediato em " + unidadeLabel + "! Toque para abrir!";

        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        fullScreenIntent.putExtra("sectrum_evento", "emergencia");

        PendingIntent fullScreenPi = PendingIntent.getActivity(
                this,
                202,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_EMERGENCY)
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

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID_EMERGENCY, builder.build());
        }

        if (!MainActivity.estaEmPrimeiroPlano) {
            try {
                startActivity(fullScreenIntent);
            } catch (Exception ignored) {}
        }
    }

    @SuppressWarnings("deprecation")
    private void acordarDispositivo() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
                        PowerManager.ACQUIRE_CAUSES_WAKEUP |
                        PowerManager.ON_AFTER_RELEASE,
                        "sectrum:WakeAlertLock"
                );
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
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
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
