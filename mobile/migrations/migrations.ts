import { down as initDown, up as initUp } from "./1757893743063_init"
import {
  down as readiumV3Down,
  up as readiumV3Up,
} from "./1762703910761_readium_v3"
import {
  down as showReaderUiDown,
  up as showReaderUiUp,
} from "./1764206663395_insert_show_reader_ui_preference"

export const migrations = {
  "1757893743063_init": {
    up: initUp,
    down: initDown,
  },
  "1762703910761_readium_v3": {
    up: readiumV3Up,
    down: readiumV3Down,
  },
  "1764206663395_insert": {
    up: showReaderUiUp,
    down: showReaderUiDown,
  },
}
