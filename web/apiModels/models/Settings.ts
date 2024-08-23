/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import {
  Settings as DbSettings,
  SETTINGS_COLUMN_NAMES,
} from "@/database/settings"

export type Settings = {
  [Key in keyof typeof SETTINGS_COLUMN_NAMES]: Required<DbSettings>[(typeof SETTINGS_COLUMN_NAMES)[Key]]
}
