package br.seg.vps.cond.sectrum;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * Reinicia automaticamente o serviço de proteção Sectrum (Interfone VoIP e Emergência)
 * quando o celular Android é ligado/reiniciado ou após atualização do aplicativo.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                SharedPreferences prefs = context.getSharedPreferences(
                        SectrumGuardService.PREFS_NAME,
                        Context.MODE_PRIVATE
                );
                String token = prefs.getString(SectrumGuardService.KEY_TOKEN, "");
                if (token != null && !token.isEmpty()) {
                    Intent svc = new Intent(context, SectrumGuardService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(svc);
                    } else {
                        context.startService(svc);
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
