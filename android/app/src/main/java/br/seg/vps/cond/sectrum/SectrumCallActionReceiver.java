package br.seg.vps.cond.sectrum;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Receptor de ações dos botões "ATENDER" e "RECUSAR" na Notificação Nativa de Chamada de Interfone.
 * Funciona mesmo com a tela bloqueada ou app fechado.
 */
public class SectrumCallActionReceiver extends BroadcastReceiver {

    public static final String ACTION_ATENDER = "br.seg.vps.cond.sectrum.ACTION_ATENDER";
    public static final String ACTION_RECUSAR = "br.seg.vps.cond.sectrum.ACTION_RECUSAR";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        String callId = intent.getStringExtra("call_id");
        String url = intent.getStringExtra("sectrum_url");

        if (ACTION_ATENDER.equals(action)) {
            // Para o toque sonoro do interfone
            SectrumAudioSynth.pararToqueInterfone(context);

            // Cancela a notificação de chamada
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(SectrumGuardService.NOTIF_ID_CALL);
            }

            // Acorda o dispositivo
            SectrumGuardService.acordarDispositivo(context);

            // Abre a MainActivity diretamente na tela do interfone
            Intent abrir = new Intent(context, MainActivity.class);
            abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            abrir.putExtra("sectrum_evento", "interfone");
            abrir.putExtra("call_id", callId != null ? callId : "");
            abrir.putExtra("sectrum_url", (url != null && !url.isEmpty()) ? url : ("/morador" + (callId != null && !callId.isEmpty() ? "?call_id=" + callId : "")));
            context.startActivity(abrir);

        } else if (ACTION_RECUSAR.equals(action)) {
            // Para o toque sonoro imediatamente
            SectrumAudioSynth.pararToqueInterfone(context);

            // Cancela a notificação de chamada
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(SectrumGuardService.NOTIF_ID_CALL);
            }

            // Desliga o serviço de plantão
            try {
                context.stopService(new Intent(context, SectrumGuardService.class));
            } catch (Exception ignored) {}

            // Envia rejeição ao servidor em background se tivermos call_id e token
            if (callId != null && !callId.isEmpty()) {
                rejeitarChamadaNoServidor(context, callId);
            }
        }
    }

    private void rejeitarChamadaNoServidor(Context context, String callId) {
        SharedPreferences prefs = context.getSharedPreferences(SectrumGuardService.PREFS_NAME, Context.MODE_PRIVATE);
        String token = prefs.getString(SectrumGuardService.KEY_TOKEN, "");
        String baseUrl = prefs.getString(SectrumGuardService.KEY_BASE_URL, "https://cond.vps.seg.br");
        if (token == null || token.isEmpty()) return;

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL u = new URL(baseUrl + "/api.php?route=morador_interfone_sinalizar");
                conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setConnectTimeout(4500);
                conn.setReadTimeout(4500);
                conn.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("call_id", callId);
                body.put("acao", "reject");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "SectrumCallRejectThread").start();
    }
}
