import AsyncStorage from "@react-native-async-storage/async-storage"
import { PreferencesState, BookPreferences } from "../slices/preferencesSlice"

export async function readGlobalPreferences(): Promise<null | Omit<
  PreferencesState,
  "bookPreferences"
>> {
  const stored = await AsyncStorage.getItem("preferences")
  if (!stored) return null

  return JSON.parse(stored)
}

export async function writeGlobalPreferences(
  preferences: Omit<PreferencesState, "bookPreferences">,
) {
  return AsyncStorage.setItem("preferences", JSON.stringify(preferences))
}

export async function readBookPreferences(
  bookId: number,
): Promise<null | BookPreferences> {
  const stored = await AsyncStorage.getItem(`preferences.${bookId}`)
  if (!stored) return null

  return JSON.parse(stored)
}

export async function writeBookPreferences(
  bookId: number,
  preferences: BookPreferences,
) {
  return AsyncStorage.setItem(
    `preferences.${bookId}`,
    JSON.stringify(preferences),
  )
}

export async function deleteBookPreferences(bookId: number) {
  return AsyncStorage.removeItem(`preferences.${bookId}`)
}
