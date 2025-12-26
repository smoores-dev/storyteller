import uuid from "react-native-uuid"

export type UUID = `${string}-${string}-${string}-${string}-${string}`

export function randomUUID() {
  return uuid.v4() as UUID
}
