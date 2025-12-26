import { useLocalSearchParams, useRouter } from "expo-router"

import { CustomThemeEditor } from "@/components/CustomThemeEditor"
import {
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"

export default function EditCustomThemeScreen() {
  const { name } = useLocalSearchParams<{ name: string }>()

  const router = useRouter()

  const { data: preferences } = useGetGlobalPreferencesQuery()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  const initialTheme = preferences?.colorThemes.find(
    (theme) => theme.name === name,
  )

  if (!initialTheme) return null

  return (
    <CustomThemeEditor
      initialTheme={initialTheme}
      onSave={(theme) => {
        const updatedThemes = [...(preferences?.colorThemes ?? [])]

        const updatedIndex = updatedThemes.findIndex(
          (theme) => theme.name === name,
        )
        updatedThemes.splice(updatedIndex, 1, theme)

        updatePreference({
          name: "colorThemes",
          value: updatedThemes,
        })

        router.back()
      }}
    />
  )
}
