package com.aryuki.tickpoint;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Small string store for the session token. Values are AES-256-GCM encrypted with a key that
 * never leaves the Android Keystore, then kept in a private SharedPreferences file. Excluded
 * from backups (allowBackup=false). If the key is lost or a value no longer decrypts, the value
 * is removed and null is returned, so the user signs in again.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {
    private static final String PREFS_NAME = "tickpoint_secure_store";
    private static final String KEY_ALIAS = "tickpoint_secure_store_aes_v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int MAX_VALUE_CHARS = 16 * 1024;
    /** Only the app's own namespace is accepted from the WebView. */
    private static final Pattern KEY_PATTERN = Pattern.compile("^tp\\.[A-Za-z0-9_.]{1,60}$");

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (!validKey(key)) {
            call.reject("INVALID_KEY");
            return;
        }
        SharedPreferences prefs = prefs();
        String stored = prefs.getString(key, null);
        JSObject ret = new JSObject();
        if (stored == null) {
            ret.put("value", JSONObject.NULL);
            call.resolve(ret);
            return;
        }
        String plain = decrypt(stored);
        if (plain == null) {
            prefs.edit().remove(key).apply();
            ret.put("value", JSONObject.NULL);
        } else {
            ret.put("value", plain);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!validKey(key) || value == null || value.length() > MAX_VALUE_CHARS) {
            call.reject("INVALID_ARGUMENT");
            return;
        }
        String encrypted = encrypt(value);
        if (encrypted == null) {
            call.reject("KEYSTORE_UNAVAILABLE");
            return;
        }
        prefs().edit().putString(key, encrypted).apply();
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (!validKey(key)) {
            call.reject("INVALID_KEY");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }

    private SharedPreferences prefs() {
        Context context = getContext();
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static boolean validKey(String key) {
        return key != null && KEY_PATTERN.matcher(key).matches();
    }

    /** Stored format: base64(iv) + ":" + base64(ciphertext with tag). */
    private static String encrypt(String plain) {
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey(true));
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
        } catch (GeneralSecurityException | RuntimeException e) {
            return null;
        }
    }

    private static String decrypt(String stored) {
        int sep = stored.indexOf(':');
        if (sep <= 0 || sep >= stored.length() - 1) return null;
        try {
            byte[] iv = Base64.decode(stored.substring(0, sep), Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(stored.substring(sep + 1), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey(false), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | RuntimeException e) {
            return null;
        }
    }

    private static SecretKey secretKey(boolean create) throws GeneralSecurityException {
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) {
                return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
            }
            if (!create) throw new GeneralSecurityException("KEY_MISSING");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .setUserAuthenticationRequired(false)
                    .build());
            return generator.generateKey();
        } catch (java.io.IOException | java.security.cert.CertificateException e) {
            throw new GeneralSecurityException(e);
        }
    }
}
