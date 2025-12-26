import { useRouter } from "expo-router"

import { CustomThemeEditor } from "@/components/CustomThemeEditor"
import { useColorTheme } from "@/hooks/useColorTheme"
import {
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"

export default function NewCustomThemeScreen() {
  const { foreground, background } = useColorTheme()

  const router = useRouter()

  const { data: preferences } = useGetGlobalPreferencesQuery()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  return (
    <CustomThemeEditor
      initialTheme={{ name: "", foreground, background, isDark: false }}
      onSave={(theme) => {
        updatePreference({
          name: "colorThemes",
          value: [...(preferences?.colorThemes ?? []), theme],
        })
          .unwrap()
          .then(() => {
            updatePreference({
              name: theme.isDark ? "darkTheme" : "lightTheme",
              value: theme.name,
            })
          })

        router.back()
      }}
    />
  )
}
