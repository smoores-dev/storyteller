import { useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

import { LoginButton } from "@/components/LoginButton"
import { Input } from "@/components/ui/input"
import { Text } from "@/components/ui/text"

export default function ServerPage() {
  const [url, setUrl] = useState("")

  return (
    <KeyboardAwareScrollView contentContainerClassName="items-stretch px-8">
      <View className="gap-4 pb-4">
        <Text className="mx-2">Server url</Text>
        <Input
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="URL"
          value={url}
          onChangeText={setUrl}
        />
        <LoginButton serverUrl={url} />
      </View>
      <View className="gap-4 rounded bg-secondary p-4">
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
