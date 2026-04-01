# Capacitor Core
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class androidx.core.splashscreen.** { *; }
-keep class androidx.webkit.** { *; }

# Cordova Plugins (Capacitor backward compatibility)
-keep class org.apache.cordova.** { *; }

# Firebase (Prevents auth/firestore crashes in production)
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep Javascript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Ignore warnings from missing webkit dependencies on older devices
-dontwarn androidx.webkit.**