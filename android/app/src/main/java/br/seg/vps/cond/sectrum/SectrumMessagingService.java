package br.seg.vps.cond.sectrum;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Recebe os pushes FCM de alta prioridade enviados pelo servidor do Sectrum (formato "fcmapp:<token>").
 *  - interfone  -> liga o serviço de plantão: toca, abre a tela cheia e acompanha até atender/encerrar;
 *  - emergencia -> sirene + tela cheia de alarme;
 *  - demais     -> notificação comum (avisos, encomendas, visitantes...).
 * Substitui o antigo serviço que ficava ligado 24 h consultando o servidor.
 */
public class SectrumMessagingService extends FirebaseMessagingService {

    private static final String KEY_FCM_TOKEN = "fcm_app_token";
    private static final String KEY_FCM_ENVIADO = "fcm_app_token_enviado";

    @Override
    public void onNewToken(@NonNull String token) {
        getSharedPreferences(SectrumGuardService.PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_FCM_TOKEN, token).apply();
        enviarTokenAoServidor(this, true);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage mensagem) {
        Map<String, String> d = mensagem.getData();
        String tipo = valor(d, "tipo");
        String deviceId = valor(d, "device_id");
        int pulso = 1;
        try {
            pulso = Integer.parseInt(valor(d, "pulso").isEmpty() ? "1" : valor(d, "pulso"));
        } catch (Exception ignored) {}

        switch (tipo) {
            case "interfone": {
                if (pulso > 1) return; // repetições: o serviço de plantão já está acompanhando
                Intent dados = new Intent();
                dados.putExtra(SectrumGuardService.EXTRA_EVENTO, "interfone");
                dados.putExtra(SectrumGuardService.EXTRA_CALL_ID, valor(d, "call_id"));
                dados.putExtra(SectrumGuardService.EXTRA_ORIGEM, extrairOrigem(d));
                dados.putExtra(SectrumGuardService.EXTRA_UNIDADE, valor(d, "unidade"));
                if (!SectrumGuardService.iniciar(this, dados)) {
                    SectrumGuardService.dispararChamada(this, extrairOrigem(d), valor(d, "unidade"));
                }
                return;
            }
            case "interfone_encerrado": {
                SectrumAudioSynth.pararToqueInterfone(this);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(SectrumGuardService.NOTIF_ID_CALL);
                mostrarNotificacaoComum(d);
                return;
            }
            case "emergencia": {
                if (pulso > 1) return;
                Intent dados = new Intent();
                dados.putExtra(SectrumGuardService.EXTRA_EVENTO, "emergencia");
                dados.putExtra("emergencia_id", valor(d, "emergencia_id"));
                dados.putExtra(SectrumGuardService.EXTRA_TIPO_EMERGENCIA, valor(d, "subtipo"));
                dados.putExtra(SectrumGuardService.EXTRA_UNIDADE, valor(d, "unidade_label"));
                dados.putExtra(SectrumGuardService.EXTRA_AUTOR, "");
                dados.putExtra(SectrumGuardService.EXTRA_FURAR_DND, valor(d, "furar_nao_perturbe"));
                if (!SectrumGuardService.iniciar(this, dados)) {
                    SectrumGuardService.dispararEmergencia(this, valor(d, "subtipo"), valor(d, "unidade_label"), "",
                            !"0".equals(valor(d, "furar_nao_perturbe")));
                }
                return;
            }
            case "emergencia_encerrada": {
                SectrumAudioSynth.pararSireneEmergencia(this);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(SectrumGuardService.NOTIF_ID_EMERGENCY);
                mostrarNotificacaoComum(d);
                return;
            }
            default:
                mostrarNotificacaoComum(d);
        }
    }

    private static String valor(Map<String, String> d, String chave) {
        String v = d.get(chave);
        return v == null ? "" : v;
    }

    private static String extrairOrigem(Map<String, String> d) {
        String origem = valor(d, "origem_nome");
        if (!origem.isEmpty()) return origem;
        String titulo = valor(d, "titulo");
        int i = titulo.indexOf(':');
        if (i < 0) i = titulo.indexOf('—');
        return i >= 0 ? titulo.substring(i + 1).trim() : "Interfone";
    }

    /** Notificação comum: toque abre o app na tela indicada pelo servidor (campo "url"). */
    private void mostrarNotificacaoComum(Map<String, String> d) {
        String titulo = valor(d, "titulo");
        String corpo = valor(d, "corpo");
        if (titulo.isEmpty() && corpo.isEmpty()) return;
        SectrumGuardService.criarCanaisNotificacao(this);

        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String url = valor(d, "url");
        if (url.startsWith("/") && !url.startsWith("//")) {
            abrir.putExtra("sectrum_url", url);
        }
        int id = (int) (System.currentTimeMillis() % 100000) + 10000;
        PendingIntent pi = PendingIntent.getActivity(this, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, SectrumGuardService.CHANNEL_GERAL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo.isEmpty() ? "Sectrum Condomínio" : titulo)
                .setContentText(corpo)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(corpo))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pi);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(id, b.build());
    }

    /**
     * Registra o token FCM deste aparelho no servidor (lista de dispositivos do usuário, formato "fcmapp:<token>").
     * Chamado quando o Firebase gera/renova o token e quando o morador faz login.
     */
    public static void enviarTokenAoServidor(Context ctx, boolean forcar) {
        SharedPreferences prefs = ctx.getSharedPreferences(SectrumGuardService.PREFS_NAME, MODE_PRIVATE);
        String fcm = prefs.getString(KEY_FCM_TOKEN, "");
        if (fcm == null || fcm.isEmpty()) {
            // Ainda não temos o token: pede ao Firebase e tenta de novo quando chegar
            try {
                FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> {
                    if (t != null && !t.isEmpty()) {
                        prefs.edit().putString(KEY_FCM_TOKEN, t).apply();
                        enviarTokenAoServidor(ctx, true);
                    }
                });
            } catch (Exception ignored) {}
            return;
        }
        String sessao = prefs.getString(SectrumGuardService.KEY_TOKEN, "");
        if (sessao == null || sessao.isEmpty()) return;
        String baseUrl = prefs.getString(SectrumGuardService.KEY_BASE_URL, "https://cond.vps.seg.br");
        String chave = fcm + "|" + (sessao.length() > 24 ? sessao.substring(sessao.length() - 24) : sessao);
        if (!forcar && chave.equals(prefs.getString(KEY_FCM_ENVIADO, ""))) return;

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(baseUrl + "/api.php?route=salvar_fcm_token").openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + sessao);
                JSONObject corpo = new JSONObject();
                corpo.put("fcm_token", "fcmapp:" + fcm);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
                }
                if (conn.getResponseCode() == 200) {
                    prefs.edit().putString(KEY_FCM_ENVIADO, chave).apply();
                }
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "SectrumFcmRegistro").start();
    }
}
