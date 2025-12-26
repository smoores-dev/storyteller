import { type ExpoConfig } from "expo/config"
import { withAppBuildGradle } from "expo/config-plugins"

const compileOptions = `    compileOptions {
        coreLibraryDesugaringEnabled true
    }

`

const dependency = `  coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

`

export default function withCoreLibraryDesugaring(config: ExpoConfig) {
  return withAppBuildGradle(config, async (config) => {
    if (!config.modResults.contents.includes(compileOptions)) {
      const androidPattern = "\nandroid {\n"
      const androidIndex = config.modResults.contents.indexOf(androidPattern)
      const androidPivot = androidIndex + androidPattern.length + 1
      config.modResults.contents =
        config.modResults.contents.slice(0, androidPivot) +
        compileOptions +
        config.modResults.contents.slice(androidPivot)
    }

    if (!config.modResults.contents.includes(dependency)) {
      const dependenciesPattern = "\ndependencies {\n"
      const dependenciesIndex =
        config.modResults.contents.indexOf(dependenciesPattern)
      const dependenciesPivot =
        dependenciesIndex + dependenciesPattern.length + 1
      config.modResults.contents =
        config.modResults.contents.slice(0, dependenciesPivot) +
        dependency +
        config.modResults.contents.slice(dependenciesPivot)
    }

    return config
  })
}
