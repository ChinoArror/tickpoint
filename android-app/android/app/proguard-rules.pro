# Release R8 rules. Capacitor and the plugins ship their own consumer rules.

# Capacitor calls @PluginMethod members by reflection. Keep every plugin class's annotated methods.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public *;
}
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }

# Our native helpers (SecureStore, AppSettings) and the activity.
-keep class com.aryuki.tickpoint.** { *; }

# Keep source line numbers for crash reports (no source file names).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
