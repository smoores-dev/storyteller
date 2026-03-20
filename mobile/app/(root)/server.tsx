import {
  type BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera"
import { useRouter } from "expo-router"
import { CameraIcon } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

import { signInWithDeviceCode } from "@/auth/deviceCodeLogin"
import { LoginButton } from "@/components/LoginButton"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Text } from "@/components/ui/text"
import { logger } from "@/logger"
import { useAppDispatch } from "@/store/appState"
import { localApi } from "@/store/localApi"

export default function ServerPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const [permissions, requestPermission] = useCameraPermissions()
  const [url, setUrl] = useState("")
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)

  async function openScanner() {
    setScannerError(null)

    if (!permissions?.granted) {
      const result = await requestPermission()
      if (!result.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to scan a QR code and sign in on this device.",
        )
        return
      }
    }

    setIsScannerOpen(true)
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (isScanning) {
      return
    }

    try {
      setIsScanning(true)
      setScannerError(null)

      const scannedUrl = new URL(result.data)
      const scannedDeviceCode = scannedUrl.searchParams.get("device_code")
      if (!scannedDeviceCode) {
        throw new Error("QR code is missing a device_code")
      }

      const scannedServerUrl = new URL("/", scannedUrl.origin).toString()
      setUrl(scannedServerUrl)

      const session = await signInWithDeviceCode(
        scannedServerUrl,
        scannedDeviceCode,
      )

      dispatch(localApi.util.invalidateTags(["Servers"]))
      setIsScannerOpen(false)
      Alert.alert(
        "Signed in",
        `Connected to ${new URL(session.serverUrl).hostname}`,
      )
      router.replace("/settings")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to scan QR login: ${message}`)
      setScannerError(message)
      Alert.alert("QR sign-in failed", message)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <KeyboardAwareScrollView contentContainerClassName="items-stretch px-8">
      <View className="gap-4 pb-4">
        <Text className="mx-2">Server url</Text>
        <Input
          maxFontSizeMultiplier={2}
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="URL"
          value={url}
          onChangeText={setUrl}
        />
        <LoginButton serverUrl={url} />
        <Button variant="ghost" size="flex" onPress={openScanner}>
          <Icon as={CameraIcon} />
          <Text>Add server with QR</Text>
        </Button>
        {isScannerOpen && (
          <View className="gap-3">
            <Text className="text-sm">
              Scan the QR code from the Storyteller&rsquo;s
              http?s://your-server-url/device/start page.
            </Text>
            <View className="h-80 w-full overflow-hidden rounded-xl border">
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={isScanning ? undefined : handleBarcodeScanned}
              />
            </View>
            {scannerError && (
              <Input editable={false} multiline value={scannerError} />
            )}
            <Button
              variant="secondary"
              size="flex"
              disabled={isScanning}
              onPress={() => {
                setIsScannerOpen(false)
                setScannerError(null)
              }}
            >
              <Text>{isScanning ? "Signing in..." : "Close scanner"}</Text>
            </Button>
          </View>
        )}
      </View>
      <View className="bg-secondary gap-4 rounded p-4">
        <Text>
          Enter the full URL for your Storyteller server instance, including the
          scheme (http:// or https://).
        </Text>
        <Text>This may look like a local IP address and port, such as:</Text>
        <Text>http://192.168.1.12:8001</Text>
        <Text>Or a domain name, such as:</Text>
        <Text>https://yourdomain.com</Text>
      </View>
    </KeyboardAwareScrollView>
  )
}
