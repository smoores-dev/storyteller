import { type ExpoConfig } from "expo/config"
import { withMainActivity } from "expo/config-plugins"

/**
 * From https://github.com/facebook/react-native/issues/19458#issuecomment-1127108148
 *
 * Basically, just clear the bundle if it's too large, because we don't actually rely on saved
 * instance state at all.
 */
export default function withNoParcelSizeCrashes(config: ExpoConfig) {
  return withMainActivity(config, async (config) => {
    let mainActivity = config.modResults.contents

    const importStatement = "import android.os.Parcel"
    if (!mainActivity.includes(importStatement)) {
      const importMatch = mainActivity.match(
        /(import +[\s\S]*?)(\n\nclass MainActivity)/,
      )
      if (importMatch) {
        mainActivity = mainActivity.replace(
          importMatch[0],
          `${importMatch[1]}\n${importStatement}${importMatch[2]}`,
        )
      }
    }

    if (!mainActivity.includes("onSaveInstanceState")) {
      const classMatch = mainActivity.match(/(class MainActivity[^{]*{)/)
      if (classMatch) {
        const onSaveInstanceStateMethod = `
  /**
   * Added to not save instance state when the state is too large. When the
   * parcel is too large, a crash occurs in the form of the ones at
   * https://github.com/facebook/react-native/issues/19458
   *
   * This usually happens because the Android activity saves the information
   * for the entire window hierarchy. This can get really large if there are
   * a ton of views in a FlatList:
   * https://android.googlesource.com/platform/frameworks/base/+/808b9f1b730ed7d046c26d0c11181632379ce570/core/java/android/app/Activity.java#2275
   *
   * Not saving state should be fine for the user too. We don't rely on
   * instance state for the state of our app, as everything is stored using
   * AsyncStorage inside of JS code instead.
   */
  override fun onSaveInstanceState(outState: Bundle) {
    try {
      super.onSaveInstanceState(outState)
      val parcel = Parcel.obtain()

      parcel.writeBundle(outState)
      val size = parcel.dataSize()

      // This was determined by looking at Bugsnag errors like:
      // "java.lang.RuntimeException: android.os.TransactionTooLargeException: data parcel size 529044 bytes"
      //
      // There were no errors for parcels with size < 520000 and many
      // above. As such, we limit the parcel size to 500000 to have a bit
      // of leeway.
      val maximumParcelSize = 500000
      if (size > maximumParcelSize) {
          outState.clear()
      }

      parcel.recycle()
    } catch (e: Exception) {
      // Failed saves don't hurt anyone, so we just swallow the errors
      // Alternatively log a handled error
    }
  }
`

        mainActivity = mainActivity.replace(
          classMatch[0],
          `${classMatch[0]}${onSaveInstanceStateMethod}`,
        )
      }
    }

    config.modResults.contents = mainActivity
    return config
  })
}
