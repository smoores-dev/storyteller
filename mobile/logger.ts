import {
  consoleTransport,
  fileAsyncTransport,
  logger as logs,
} from "react-native-logs"
import * as FileSystem from "expo-file-system"

type Logger = ReturnType<typeof logs.createLogger>
type StrongLogger = Logger & {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export const logger = logs.createLogger({
  severity: __DEV__ ? "info" : "error",
  transport: (__DEV__ ? [consoleTransport] : []).concat([fileAsyncTransport]),
  transportOptions: { FS: FileSystem, fileName: "storyteller-log" },
  async: __DEV__,
}) as StrongLogger
