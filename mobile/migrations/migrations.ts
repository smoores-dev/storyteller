import { down as initDown, up as initUp } from "./1757893743063_init"
import {
  down as readiumV3Down,
  up as readiumV3Up,
} from "./1762703910761_readium_v3"
import {
  down as showReaderUiDown,
  up as showReaderUiUp,
} from "./1764206663395_insert_show_reader_ui_preference"
import { up as serverCascadeDeleteUp } from "./1766770316988_server_cascade_delete"
import { up as timestampRealUp } from "./1766772044082_timestamp_real"
import {
  down as addCrispWhiteDown,
  up as addCrispWhiteUp,
} from "./1767276420645_add_crisp_white_theme"
import {
  down as insertLogLevelDown,
  up as insertLogLevelUp,
} from "./1770082660466_insert_log_level"
import {
  down as addClipsToReadaloudDown,
  up as addClipsToReadaloudUp,
} from "./1770341616012_add_clips_to_readaloud"
import {
  down as addLastListBooksResponseToServerDown,
  up as addLastListBooksResponseToServerUp,
} from "./1770771063246_add_last_list_books_response_to_server"

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
  "1766770316988_server_cascade_delete": { up: serverCascadeDeleteUp },
  "1766772044082_timestamp_real": { up: timestampRealUp },
  "1767276420645_add_crisp_white_theme": {
    up: addCrispWhiteUp,
    down: addCrispWhiteDown,
  },
  "1770082660466_insert_log_level": {
    up: insertLogLevelUp,
    down: insertLogLevelDown,
  },
  "1770341616012_add_clips_to_readaloud": {
    up: addClipsToReadaloudUp,
    down: addClipsToReadaloudDown,
  },
  "1770771063246_add_last_list_books_response_to_server": {
    up: addLastListBooksResponseToServerUp,
    down: addLastListBooksResponseToServerDown,
  },
}
