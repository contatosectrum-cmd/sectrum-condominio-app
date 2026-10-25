package br.seg.vps.cond.sectrum;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
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
 *   Serviço em Segundo Plano 24h (SectrumGuardService) e Biometria Nativa (BiometricPrompt).
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
        iniciarServicoSeTokenExistir();
        configurarBotaoVoltarAndroid();
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

    private void iniciarServicoSeTokenExistir() {
        try {
            SharedPreferences prefs = getSharedPreferences(SectrumGuardService.PREFS_NAME, MODE_PRIVATE);
            String tok = prefs.getString(SectrumGuardService.KEY_TOKEN, "");
            if (tok != null && !tok.isEmpty()) {
                iniciarGuardService();
            }
        } catch (Exception ignored) {}
    }

    private void iniciarGuardService() {
        try {
            Intent svc = new Intent(this, SectrumGuardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
        } catch (Exception ignored) {}
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
            return "1.0.0-android-native";
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
                    iniciarGuardService();
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

        @JavascriptInterface
        public boolean otimizacaoBateriaIgnorada() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
                }
            } catch (Exception ignored) {}
            return true;
        }

        @JavascriptInterface
        public void solicitarOtimizacaoBateria() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
