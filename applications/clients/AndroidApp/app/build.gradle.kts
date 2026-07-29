import com.android.ide.common.vectordrawable.Svg2Vector
import java.awt.Color
import java.awt.Font
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import javax.imageio.ImageIO
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

plugins {
    id("com.android.application") version "8.11.1"
    id("org.jetbrains.kotlin.android") version "2.2.0"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0"
}

val ciSigningKeystorePath = System.getenv("ANDROID_SIGNING_KEYSTORE_PATH")
val ciSigningStorePassword = System.getenv("ANDROID_SIGNING_STORE_PASSWORD")
val ciSigningKeyAlias = System.getenv("ANDROID_SIGNING_KEY_ALIAS")
val ciSigningKeyPassword = System.getenv("ANDROID_SIGNING_KEY_PASSWORD")

android {
    namespace = "dev.smoores.storyteller"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.smoores.Storyteller"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        getByName("debug") {
            // Keeps debug installs from colliding with the store app or the v2
            // app's .dev builds, which share the dev.smoores.Storyteller namespace.
            applicationIdSuffix = ".dev3"
        }
    }

    if (ciSigningKeystorePath != null) {
        signingConfigs {
            create("ci") {
                storeFile = file(ciSigningKeystorePath)
                storePassword = requireNotNull(ciSigningStorePassword) {
                    "ANDROID_SIGNING_STORE_PASSWORD is required when CI signing is enabled"
                }
                keyAlias = requireNotNull(ciSigningKeyAlias) {
                    "ANDROID_SIGNING_KEY_ALIAS is required when CI signing is enabled"
                }
                keyPassword = requireNotNull(ciSigningKeyPassword) {
                    "ANDROID_SIGNING_KEY_PASSWORD is required when CI signing is enabled"
                }
            }
        }
        buildTypes {
            getByName("debug") {
                signingConfig = signingConfigs.getByName("ci")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("main") {
            java.srcDirs(
                // jextract-generated bindings for the StorytellerAndroidBridge Swift module
                "../swift/.build/plugins/outputs/swift/StorytellerAndroidBridge/destination/JExtractSwiftPlugin/src/generated/java",
            )
        }
    }
}

abstract class GenerateSharedResources : DefaultTask() {
    @get:InputFile
    abstract val appIcon: RegularFileProperty

    @get:InputFile
    abstract val adaptiveIconForeground: RegularFileProperty

    @get:InputFile
    abstract val readaloudIcon: RegularFileProperty

    @get:InputFile
    abstract val youngSerifFont: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun generate() {
        val appIconOutput = outputDirectory.file("mipmap/app_icon.png").get().asFile
        appIconOutput.parentFile.mkdirs()
        appIcon.get().asFile.copyTo(appIconOutput, overwrite = true)

        val adaptiveIconForegroundOutput =
            outputDirectory.file("drawable/app_icon_foreground.png").get().asFile
        adaptiveIconForegroundOutput.parentFile.mkdirs()
        adaptiveIconForeground.get().asFile.copyTo(adaptiveIconForegroundOutput, overwrite = true)

        val iconOutput = outputDirectory.file("drawable/ic_readaloud.xml").get().asFile
        iconOutput.parentFile.mkdirs()
        iconOutput.outputStream().use { stream ->
            val errors = Svg2Vector.parseSvgToXml(readaloudIcon.get().asFile.toPath(), stream)
            check(errors.isBlank()) { errors }
        }

        val fontOutput = outputDirectory.file("font/young_serif.ttf").get().asFile
        fontOutput.parentFile.mkdirs()
        youngSerifFont.get().asFile.copyTo(fontOutput, overwrite = true)
    }
}

/**
 * Stages the shared reader web stack (foliate_wrap.html, FoliateManager.js,
 * foliate-js, ...) from the common core into APK assets under reader/, where
 * WebViewAssetLoader serves it at https://appassets.androidplatform.net/reader/.
 */
abstract class GenerateReaderAssets : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webResources: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun generate() {
        val source = webResources.get().asFile
        val output = outputDirectory.dir("reader").get().asFile
        output.deleteRecursively()
        val excludedNames = setOf(
            ".git",
            ".github",
            ".gitattributes",
            ".gitignore",
            "rollup",
            "tests",
            "node_modules",
            "package.json",
            "package-lock.json",
            "rollup.config.js",
            "eslint.config.js",
        )
        source.walkTopDown()
            .onEnter { it.name !in excludedNames }
            .filter { it.isFile && it.name !in excludedNames }
            .forEach { file ->
                val target = output.resolve(file.relativeTo(source).path)
                target.parentFile.mkdirs()
                file.copyTo(target, overwrite = true)
            }
    }
}

/**
 * Renders the playback speed badges Android Auto shows on the cycle-speed
 * button, one per rate the app can reach: the phone slider's 0.05 grid plus
 * the 5x cycle step. Generated at build time so no rasterized assets live in
 * the repository.
 */
abstract class GeneratePlaybackSpeedIcons : DefaultTask() {
    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun generate() {
        System.setProperty("java.awt.headless", "true")
        val densities = linkedMapOf(
            "mdpi" to 48,
            "hdpi" to 72,
            "xhdpi" to 96,
            "xxhdpi" to 144,
            "xxxhdpi" to 192,
        )
        val rateHundredths = (50..300 step 5) + 500

        for (hundredths in rateHundredths) {
            for ((qualifier, sizePixels) in densities) {
                val file = outputDirectory
                    .file("drawable-$qualifier/${resourceName(hundredths)}.png")
                    .get()
                    .asFile
                file.parentFile.mkdirs()
                ImageIO.write(renderBadge(label(hundredths), sizePixels), "png", file)
            }
        }

        val valuesFile = outputDirectory.file("values/speed_icons.xml").get().asFile
        valuesFile.parentFile.mkdirs()
        valuesFile.writeText(
            buildString {
                appendLine("""<?xml version="1.0" encoding="utf-8"?>""")
                appendLine("<resources>")
                appendLine("""    <integer-array name="speed_icon_hundredths">""")
                rateHundredths.forEach { appendLine("        <item>$it</item>") }
                appendLine("    </integer-array>")
                appendLine("""    <array name="speed_icon_drawables">""")
                rateHundredths.forEach {
                    appendLine("        <item>@drawable/${resourceName(it)}</item>")
                }
                appendLine("    </array>")
                appendLine("</resources>")
            },
        )
    }

    private fun label(hundredths: Int): String {
        val whole = hundredths / 100
        val fraction = hundredths % 100
        return when {
            fraction == 0 -> "${whole}x"
            fraction % 10 == 0 -> "$whole.${fraction / 10}x"
            else -> "$whole.${"%02d".format(fraction)}x"
        }
    }

    private fun resourceName(hundredths: Int): String =
        "speed_" + label(hundredths).removeSuffix("x").replace('.', '_')

    private fun renderBadge(text: String, sizePixels: Int): BufferedImage {
        val image = BufferedImage(sizePixels, sizePixels, BufferedImage.TYPE_INT_ARGB)
        val graphics = image.createGraphics()
        graphics.setRenderingHint(
            RenderingHints.KEY_ANTIALIASING,
            RenderingHints.VALUE_ANTIALIAS_ON,
        )
        graphics.setRenderingHint(
            RenderingHints.KEY_TEXT_ANTIALIASING,
            RenderingHints.VALUE_TEXT_ANTIALIAS_ON,
        )
        graphics.setRenderingHint(
            RenderingHints.KEY_FRACTIONALMETRICS,
            RenderingHints.VALUE_FRACTIONALMETRICS_ON,
        )
        val context = graphics.fontRenderContext
        val baseFont = Font(Font.SANS_SERIF, Font.BOLD, 100)
        val probe = baseFont.createGlyphVector(context, text).visualBounds
        val scale = minOf(
            sizePixels * 0.94 / probe.width,
            sizePixels * 0.42 / probe.height,
        )
        val glyphs = baseFont
            .deriveFont((100 * scale).toFloat())
            .createGlyphVector(context, text)
        val bounds = glyphs.visualBounds
        graphics.color = Color.WHITE
        graphics.drawGlyphVector(
            glyphs,
            ((sizePixels - bounds.width) / 2 - bounds.x).toFloat(),
            ((sizePixels - bounds.height) / 2 - bounds.y).toFloat(),
        )
        graphics.dispose()
        return image
    }
}

val generateSharedResources = tasks.register<GenerateSharedResources>("generateSharedResources") {
    appIcon.set(
        rootProject.layout.projectDirectory.file(
            "generated/app_icon.png"
        )
    )
    adaptiveIconForeground.set(
        rootProject.layout.projectDirectory.file(
            "generated/icon_android_foreground.png"
        )
    )
    readaloudIcon.set(
        rootProject.layout.projectDirectory.file(
            "../XCodeApps/Assets.xcassets/readalong.imageset/readaloud.svg"
        )
    )
    youngSerifFont.set(
        rootProject.layout.projectDirectory.file(
            "../../../libraries/StorytellerKit/Sources/Kit/Resources/assets/fonts/YoungSerif.ttf"
        )
    )
}

val generatePlaybackSpeedIcons =
    tasks.register<GeneratePlaybackSpeedIcons>("generatePlaybackSpeedIcons")

val generateReaderAssets = tasks.register<GenerateReaderAssets>("generateReaderAssets") {
    webResources.set(
        rootProject.layout.projectDirectory.dir(
            "../../../libraries/StorytellerKit/Sources/Kit/Resources/WebResources"
        )
    )
}

androidComponents {
    onVariants { variant ->
        variant.sources.res?.addGeneratedSourceDirectory(
            generateSharedResources,
            GenerateSharedResources::outputDirectory,
        )
        variant.sources.res?.addGeneratedSourceDirectory(
            generatePlaybackSpeedIcons,
            GeneratePlaybackSpeedIcons::outputDirectory,
        )
        variant.sources.assets?.addGeneratedSourceDirectory(
            generateReaderAssets,
            GenerateReaderAssets::outputDirectory,
        )
    }
}

dependencies {
    val media3Version = "1.10.1"

    // swift-java's Java runtime (org.swift.swiftkit.core), built from the
    // resolved swift-java checkout by scripts/androidbuild. Consumed as a jar
    // because its sources reference jdk.jfr, which android.jar lacks.
    implementation(files("libs/swiftkit-core.jar"))
    implementation(files("prebuilt/media3-decoder-opus-$media3Version.aar"))
    implementation("androidx.media3:media3-common:$media3Version")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")
    implementation(platform("androidx.compose:compose-bom:2025.06.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16")
}
