package br.seg.vps.cond.sectrum;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Sintetizador de áudio nativo Android (PCM 16-bit via AudioTrack):
 * - Sirene de Emergência estilo Defesa Civil (853 Hz + 960 Hz) no canal USAGE_ALARM
 *   (toca mesmo com o celular no modo Silencioso / Vibrar).
 * - Toque de Interfone (Campainha + Telefone) no canal USAGE_NOTIFICATION_RINGTONE.
 */
public final class SectrumAudioSynth {

    private static AudioTrack trackSirene = null;
    private static AudioTrack trackInterfone = null;
    private static volatile boolean sireneTocando = false;
    private static volatile boolean interfoneTocando = false;
    private static int volumeAlarmeAnterior = -1;

    private SectrumAudioSynth() {}

    private static Vibrator obterVibrador(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) return vm.getDefaultVibrator();
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }

    /**
     * Inicia a Sirene de Emergência nativa em loop contínuo no canal de ALARME do Android.
     */
    public static synchronized void iniciarSireneEmergencia(Context context, boolean furarDnd) {
        if (sireneTocando) return;
        sireneTocando = true;

        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && furarDnd) {
                volumeAlarmeAnterior = am.getStreamVolume(AudioManager.STREAM_ALARM);
                int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, maxVol, 0);
            }
        } catch (Exception ignored) {}

        try {
            final int sampleRate = 16000;
            final double durationSec = 2.4;
            final int numSamples = (int) (sampleRate * durationSec);
            short[] pcm = new short[numSamples];

            for (int i = 0; i < numSamples; i++) {
                double t = (double) i / sampleRate;
                double sample = 0.0;
                // Dois pulsos longos dissonantes (853 Hz + 960 Hz) + harmônicos
                boolean emPulso = (t >= 0.0 && t <= 0.95) || (t >= 1.15 && t <= 2.10);
                if (emPulso) {
                    double w1 = Math.sin(2.0 * Math.PI * 853.0 * t);
                    double w2 = Math.sin(2.0 * Math.PI * 960.0 * t);
                    double h1 = 0.30 * Math.sin(2.0 * Math.PI * 1706.0 * t);
                    double h2 = 0.30 * Math.sin(2.0 * Math.PI * 1920.0 * t);
                    sample = Math.max(-1.0, Math.min(1.0, (0.45 * w1 + 0.45 * w2 + h1 + h2) * 0.92));
                }
                pcm[i] = (short) (sample * 32767);
            }

            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();

            trackSirene = new AudioTrack(
                    attrs,
                    format,
                    pcm.length * 2,
                    AudioTrack.MODE_STATIC,
                    AudioManager.AUDIO_SESSION_ID_GENERATE
            );
            trackSirene.write(pcm, 0, pcm.length);
            trackSirene.setLoopPoints(0, pcm.length, -1);
            trackSirene.play();
        } catch (Exception ignored) {}

        try {
            Vibrator vib = obterVibrador(context);
            if (vib != null && vib.hasVibrator()) {
                long[] padrao = new long[]{0, 900, 150, 500, 150, 900, 250};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(padrao, 0));
                } else {
                    vib.vibrate(padrao, 0);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Para imediatamente a Sirene de Emergência nativa e restaura o volume anterior.
     */
    public static synchronized void pararSireneEmergencia(Context context) {
        sireneTocando = false;
        try {
            if (trackSirene != null) {
                trackSirene.stop();
                trackSirene.release();
                trackSirene = null;
            }
        } catch (Exception ignored) {
            trackSirene = null;
        }

        try {
            if (volumeAlarmeAnterior >= 0 && context != null) {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setStreamVolume(AudioManager.STREAM_ALARM, volumeAlarmeAnterior, 0);
                }
                volumeAlarmeAnterior = -1;
            }
        } catch (Exception ignored) {}

        if (!interfoneTocando && context != null) {
            try {
                Vibrator vib = obterVibrador(context);
                if (vib != null) vib.cancel();
            } catch (Exception ignored) {}
        }
    }

    /**
     * Inicia o toque nativo de chamada de Interfone em loop no canal de RINGTONE.
     */
    public static synchronized void iniciarToqueInterfone(Context context) {
        if (interfoneTocando || sireneTocando) return;
        interfoneTocando = true;

        try {
            final int sampleRate = 16000;
            final double durationSec = 2.0;
            final int numSamples = (int) (sampleRate * durationSec);
            short[] pcm = new short[numSamples];

            for (int i = 0; i < numSamples; i++) {
                double t = (double) i / sampleRate;
                double sample = 0.0;
                if ((t >= 0.0 && t <= 0.40) || (t >= 0.52 && t <= 0.92)) {
                    double mod = Math.sin(2.0 * Math.PI * 20.0 * t) >= 0 ? 880.0 : 1100.0;
                    double harm = Math.sin(2.0 * Math.PI * mod * t) + 0.35 * Math.sin(2.0 * Math.PI * (mod * 2.0) * t);
                    sample = Math.max(-1.0, Math.min(1.0, harm * 0.85));
                } else if (t >= 1.02 && t < 1.30) {
                    double env = Math.exp(-(t - 1.02) * 5.5);
                    sample = Math.sin(2.0 * Math.PI * 783.99 * t) * env * 0.9;
                } else if (t >= 1.30 && t < 1.72) {
                    double env = Math.exp(-(t - 1.30) * 4.5);
                    sample = Math.sin(2.0 * Math.PI * 659.25 * t) * env * 0.9;
                }
                pcm[i] = (short) (sample * 32767);
            }

            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();

            trackInterfone = new AudioTrack(
                    attrs,
                    format,
                    pcm.length * 2,
                    AudioTrack.MODE_STATIC,
                    AudioManager.AUDIO_SESSION_ID_GENERATE
            );
            trackInterfone.write(pcm, 0, pcm.length);
            trackInterfone.setLoopPoints(0, pcm.length, -1);
            trackInterfone.play();
        } catch (Exception ignored) {}

        try {
            Vibrator vib = obterVibrador(context);
            if (vib != null && vib.hasVibrator()) {
                long[] padrao = new long[]{0, 700, 150, 700, 400};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(padrao, 0));
                } else {
                    vib.vibrate(padrao, 0);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Para imediatamente o toque nativo de chamada de Interfone.
     */
    public static synchronized void pararToqueInterfone(Context context) {
        interfoneTocando = false;
        try {
            if (trackInterfone != null) {
                trackInterfone.stop();
                trackInterfone.release();
                trackInterfone = null;
            }
        } catch (Exception ignored) {
            trackInterfone = null;
        }

        if (!sireneTocando && context != null) {
            try {
                Vibrator vib = obterVibrador(context);
                if (vib != null) vib.cancel();
            } catch (Exception ignored) {}
        }
    }
}
