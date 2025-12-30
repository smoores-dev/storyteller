import * as FileSystem from "expo-file-system/legacy"
import {
  consoleTransport,
  fileAsyncTransport,
  logger as logs,
} from "react-native-logs"

export const logger = logs.createLogger(
  __DEV__
    ? {
        levels: {
          trace: 0,
          debug: 1,
          log: 1,
          info: 2,
          warn: 3,
          error: 4,
        },
        severity: "info",
        transport: [consoleTransport, fileAsyncTransport],
        transportOptions: {
          FS: FileSystem,
          fileName: "storyteller-{date-today}.log",
        },
      }
    : {
        levels: {
          trace: 0,
          debug: 1,
          log: 1,
          info: 2,
          warn: 3,
          error: 4,
        },
        severity: "error",
        transport: [fileAsyncTransport],
        transportOptions: {
          FS: FileSystem,
          fileName: "storyteller-{date-today}.log",
        },
        async: true,
      },
)
