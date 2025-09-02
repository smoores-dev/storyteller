// plugin/src/index.js
import { type ExpoConfig } from "expo/config"
import { withMainActivity } from "expo/config-plugins"

export default function withKeyDownEvents(
  config: ExpoConfig,
  options: { keyCodes: number[] },
) {
  return withMainActivity(config, async (config) => {
    let mainActivity = config.modResults.contents

    const imports = [
      "import android.annotation.SuppressLint",
      "import android.view.KeyEvent",
      "import com.facebook.react.modules.core.DeviceEventManagerModule",
      "import com.facebook.react.bridge.Arguments",
    ]

    imports.forEach((importStatement) => {
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
    })

    if (!mainActivity.includes("dispatchKeyEvent")) {
      const classMatch = mainActivity.match(/(class MainActivity[^{]*{)/)
      if (classMatch) {
        const dispatchKeyEventMethod = `
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN) {
      if (listOf(${options.keyCodes.map((code) => `${code}`).join(", ")}).contains(event.keyCode)) {
        sendKeyEvent(event.keyCode)
        return true
      }
    }

    return super.dispatchKeyEvent(event)
  }

  @SuppressLint("VisibleForTests")
  private fun sendKeyEvent(keyCode: Int) {
    val context = reactNativeHost.reactInstanceManager.currentReactContext
    if (context != null) {
      val params = Arguments.createMap()
      params.putInt("keyCode", keyCode)
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("storyteller:keydown", params)
    }
  }
`

        mainActivity = mainActivity.replace(
          classMatch[0],
          `${classMatch[0]}${dispatchKeyEventMethod}`,
        )
      }
    }

    config.modResults.contents = mainActivity
    return config
  })
}
