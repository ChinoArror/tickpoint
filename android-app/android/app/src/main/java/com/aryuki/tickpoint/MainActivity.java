package com.aryuki.tickpoint;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native helpers used by the TypeScript side (android-app/src/native/plugins.ts).
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
