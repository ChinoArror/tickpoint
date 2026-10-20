package com.aryuki.tickpoint;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Opens this app's notification settings and reports whether FCM can work on the device.
 * Firebase and Play services are looked up by reflection, so the app builds without
 * google-services.json and without a compile-time dependency on the Firebase classes.
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context context = getContext();
        String pkg = context.getPackageName();
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        if (intent.resolveActivity(context.getPackageManager()) == null) {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("NO_SETTINGS_SCREEN");
        }
    }

    @PluginMethod
    public void pushSupport(PluginCall call) {
        String reason = "ok";
        if (!firebaseConfigured()) {
            reason = "no_firebase";
        } else {
            int gms = playServicesStatus();
            if (gms == -1) reason = "unknown";
            else if (gms != 0) reason = "no_gms";
        }
        JSObject ret = new JSObject();
        ret.put("available", "ok".equals(reason));
        ret.put("reason", reason);
        call.resolve(ret);
    }

    /** True when a default FirebaseApp exists (google-services.json was packaged). */
    private boolean firebaseConfigured() {
        try {
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            Object apps = firebaseApp.getMethod("getApps", Context.class).invoke(null, getContext());
            return apps instanceof List && !((List<?>) apps).isEmpty();
        } catch (ReflectiveOperationException | RuntimeException e) {
            return false;
        }
    }

    /** ConnectionResult code: 0 = SUCCESS, other = unavailable, -1 = could not be determined. */
    private int playServicesStatus() {
        try {
            Class<?> availability = Class.forName("com.google.android.gms.common.GoogleApiAvailability");
            Object instance = availability.getMethod("getInstance").invoke(null);
            Object code = availability.getMethod("isGooglePlayServicesAvailable", Context.class)
                    .invoke(instance, getContext());
            return code instanceof Integer ? (Integer) code : -1;
        } catch (ReflectiveOperationException | RuntimeException e) {
            return -1;
        }
    }
}
