package br.seg.vps.cond.sectrum;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Activity Principal Nativa do Sectrum Condomínio (Android):
 * - Carrega todas as 39 telas do sistema via Capacitor WebView com aceleração de hardware;
 * - Acende sobre a tela de bloqueio (ShowWhenLocked + TurnScreenOn) para chamadas de Interfone e Emergências;
 * - Expõe a ponte Javascript `window.SectrumAndroid` para controle nativo de Sirene, Toque VoIP,
 *   push FCM (SectrumMessagingService) e Biometria Nativa (BiometricPrompt).
 * - Chamadas e emergências chegam por push FCM de alta prioridade; o antigo serviço 24 h foi removido
 *   (exigência da Google Play e economia de bateria).
 */
public class MainActivity extends BridgeActivity {

    public static volatile boolean estaEmPrimeiroPlano = false;
    private static final String BIO_PREFS = "sectrum_bio_prefs";
    private static final int REQ_PERMISSOES = 5001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        configurarJanelaSobreTelaBloqueio();
        super.onCreate(savedInstanceState);

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView wv = getBridge().getWebView();
                WebSettings ws = wv.getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
                ws.setDomStorageEnabled(true);
                ws.setJavaScriptEnabled(true);
                wv.addJavascriptInterface(new SectrumNativeBridge(), "SectrumAndroid");
            }
        } catch (Exception ignored) {}

        solicitarPermissoesEssenciais();
        desligarServicoLegado24h();
        SectrumMessagingService.enviarTokenAoServidor(this, false);
        configurarBotaoVoltarAndroid();
        abrirUrlDaNotificacao(getIntent());
    }

    /**
     * Versões antigas deixavam um serviço em primeiro plano ligado 24 h. Ao atualizar, desliga-o:
     * agora o serviço só liga durante uma chamada/emergência, acordado pelo push FCM.
     */
    private void desligarServicoLegado24h() {
        try {
            stopService(new Intent(this, SectrumGuardService.class));
        } catch (Exception ignored) {}
    }

    /** Notificação tocada: abre a tela indicada pelo servidor (ex.: /morador?emergencia_id=10). */
    private void abrirUrlDaNotificacao(Intent intent) {
        if (intent == null) return;
        final String url = intent.getStringExtra("sectrum_url");
        if (url == null || !url.startsWith("/") || url.startsWith("//")) return;
        intent.removeExtra("sectrum_url");
        final String js = "try{var u=" + JSONObject.quote(url) + ";if(location.pathname+location.search!==u){location.href=u;}}catch(e){}";
        for (long atraso : new long[]{400L, 1800L}) {
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, atraso);
        }
    }

    private void configurarBotaoVoltarAndroid() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        WebView wv = getBridge().getWebView();
                        String url = wv.getUrl() != null ? wv.getUrl() : "";
                        boolean naRaiz = url.endsWith("/morador")
                                || url.endsWith("/morador/")
                                || url.endsWith("/login")
                                || url.endsWith("localhost/")
                                || url.endsWith("localhost");
                        if (!naRaiz && wv.canGoBack()) {
                            wv.goBack();
                            return;
                        }
                    }
                } catch (Exception ignored) {}
                moveTaskToBack(true);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        estaEmPrimeiroPlano = true;
        // Se abriu a tela vindo de uma chamada tocando, o próprio modal React assume o som/atendimento
        SectrumAudioSynth.pararToqueInterfone(this);
    }

    @Override
    public void onPause() {
        estaEmPrimeiroPlano = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        configurarJanelaSobreTelaBloqueio();
        abrirUrlDaNotificacao(intent);
    }

    @SuppressWarnings("deprecation")
    private void configurarJanelaSobreTelaBloqueio() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                );
            }
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } catch (Exception ignored) {}
    }

    private void solicitarPermissoesEssenciais() {
        List<String> faltando = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                faltando.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            faltando.add(Manifest.permission.CAMERA);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            faltando.add(Manifest.permission.RECORD_AUDIO);
        }
        if (!faltando.isEmpty()) {
            ActivityCompat.requestPermissions(
                    this,
                    faltando.toArray(new String[0]),
                    REQ_PERMISSOES
            );
        }
    }

    private String normalizarChaveLogin(String login) {
        if (login == null) return "padrao";
        String limpo = login.trim().toLowerCase();
        String apenasDigitos = limpo.replaceAll("\\D", "");
        if (apenasDigitos.length() == 11) {
            return apenasDigitos;
        }
        return limpo.isEmpty() ? "padrao" : limpo;
    }

    private void enviarResultadoBiometriaJs(final boolean sucesso, final String payloadOuErro) {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    String escapado = JSONObject.quote(payloadOuErro != null ? payloadOuErro : "");
                    String js = "if(window.__sectrumOnBiometricResult){window.__sectrumOnBiometricResult("
                            + (sucesso ? "true" : "false") + "," + escapado + ");}";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            } catch (Exception ignored) {}
        });
    }

    public class SectrumNativeBridge {

        @JavascriptInterface
        public boolean ehAppNativo() {
            return true;
        }

        @JavascriptInterface
        public String obterVersaoApp() {
            return "1.3.0-android-native";
        }

        @JavascriptInterface
        public void salvarSessaoNativa(String token, String usuarioJson, String baseUrl) {
            try {
                SharedPreferences prefs = getSharedPreferences(SectrumGuardService.PREFS_NAME, MODE_PRIVATE);
                prefs.edit()
                        .putString(SectrumGuardService.KEY_TOKEN, token != null ? token : "")
                        .putString("usuario_json", usuarioJson != null ? usuarioJson : "")
                        .putString(
                                SectrumGuardService.KEY_BASE_URL,
                                (baseUrl != null && !baseUrl.isEmpty()) ? baseUrl : "https://cond.vps.seg.br"
                        )
                        .apply();

                if (token != null && !token.isEmpty()) {
                    // Registra este aparelho para receber chamadas e alertas por push FCM
                    SectrumMessagingService.enviarTokenAoServidor(MainActivity.this, false);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void limparSessaoNativa() {
            try {
                SectrumAudioSynth.pararSireneEmergencia(MainActivity.this);
                SectrumAudioSynth.pararToqueInterfone(MainActivity.this);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void iniciarSireneNativa(String tipo, String titulo, String mensagem, boolean furarDnd) {
            SectrumAudioSynth.iniciarSireneEmergencia(MainActivity.this, furarDnd);
        }

        @JavascriptInterface
        public void pararSireneNativa() {
            SectrumAudioSynth.pararSireneEmergencia(MainActivity.this);
        }

        @JavascriptInterface
        public void iniciarToqueInterfoneNativo(String titulo, String subtitulo) {
            SectrumAudioSynth.iniciarToqueInterfone(MainActivity.this);
        }

        @JavascriptInterface
        public void pararToqueInterfoneNativo() {
            SectrumAudioSynth.pararToqueInterfone(MainActivity.this);
        }

        @JavascriptInterface
        public boolean temBiometriaNativa() {
            try {
                BiometricManager bm = BiometricManager.from(MainActivity.this);
                int res = bm.canAuthenticate(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG |
                        BiometricManager.Authenticators.BIOMETRIC_WEAK |
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
                );
                return res == BiometricManager.BIOMETRIC_SUCCESS;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean temCredencialBiometriaSalva(String login) {
            try {
                SharedPreferences bio = getSharedPreferences(BIO_PREFS, MODE_PRIVATE);
                String chave = normalizarChaveLogin(login);
                String payload = bio.getString("cred_" + chave, null);
                if (payload == null || payload.isEmpty()) {
                    payload = bio.getString("cred_ultima", null);
                }
                return payload != null && !payload.isEmpty();
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean salvarCredencialBiometriaNativa(String login, String token, String usuarioJson) {
            try {
                if (token == null || token.isEmpty() || usuarioJson == null || usuarioJson.isEmpty()) {
                    return false;
                }
                JSONObject obj = new JSONObject();
                obj.put("token", token);
                obj.put("usuario", new JSONObject(usuarioJson));
                String salvo = obj.toString();

                SharedPreferences bio = getSharedPreferences(BIO_PREFS, MODE_PRIVATE);
                String chave = normalizarChaveLogin(login);
                bio.edit()
                        .putString("cred_" + chave, salvo)
                        .putString("cred_ultima", salvo)
                        .apply();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void autenticarBiometriaNativa(final String login, final String titulo, final String subtitulo) {
            runOnUiThread(() -> {
                try {
                    SharedPreferences bio = getSharedPreferences(BIO_PREFS, MODE_PRIVATE);
                    String chave = normalizarChaveLogin(login);
                    String payload = bio.getString("cred_" + chave, null);
                    if (payload == null || payload.isEmpty()) {
                        payload = bio.getString("cred_ultima", null);
                    }
                    final String credFinal = payload;

                    if (credFinal == null || credFinal.isEmpty()) {
                        enviarResultadoBiometriaJs(
                                false,
                                "Faça login com seu CPF e senha uma primeira vez neste aparelho para ativar o acesso por digital/rosto."
                        );
                        return;
                    }

                    Executor executor = ContextCompat.getMainExecutor(MainActivity.this);
                    BiometricPrompt prompt = new BiometricPrompt(
                            MainActivity.this,
                            executor,
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                                    super.onAuthenticationError(errorCode, errString);
                                    enviarResultadoBiometriaJs(false, errString.toString());
                                }

                                @Override
                                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                    super.onAuthenticationSucceeded(result);
                                    enviarResultadoBiometriaJs(true, credFinal);
                                }

                                @Override
                                public void onAuthenticationFailed() {
                                    super.onAuthenticationFailed();
                                }
                            }
                    );

                    BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                            .setTitle(titulo != null && !titulo.isEmpty() ? titulo : "Acesso Biométrico Sectrum")
                            .setSubtitle(subtitulo != null && !subtitulo.isEmpty() ? subtitulo : "Confirme sua digital ou rosto")
                            .setAllowedAuthenticators(
                                    BiometricManager.Authenticators.BIOMETRIC_STRONG |
                                    BiometricManager.Authenticators.BIOMETRIC_WEAK |
                                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
                            )
                            .build();

                    prompt.authenticate(promptInfo);
                } catch (Exception e) {
                    enviarResultadoBiometriaJs(false, "Erro ao validar biometria: " + e.getMessage());
                }
            });
        }

        /** Mantido por compatibilidade com o React: o app não precisa mais ignorar a otimização de bateria. */
        @JavascriptInterface
        public boolean otimizacaoBateriaIgnorada() {
            return true;
        }

        /** Sem efeito: chamadas e alertas chegam por push FCM de alta prioridade. */
        @JavascriptInterface
        public void solicitarOtimizacaoBateria() {
        }
    }
}
