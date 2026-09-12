# Swift resolves generated JNI wrappers and runtime classes by their Java names.
-keep class dev.smoores.storyteller.bridge.** { *; }
-keep class org.swift.swiftkit.** { *; }
# SwiftKit is compiled with the host JDK; JFR annotations are not used on Android.
-dontwarn jdk.jfr.**
# WebView calls these methods through reflection.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
