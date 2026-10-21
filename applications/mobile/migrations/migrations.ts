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
import {
  down as ratingAsRealsDown,
  up as ratingAsRealsUp,
} from "./1774713471283_rating_as_reals"
import {
  down as clearClipsDown,
  up as clearClipsUp,
} from "./1779735566760_clear_clips"
import {
  down as bookToCreatorRoleUniqueDown,
  up as bookToCreatorRoleUniqueUp,
} from "./1779753600000_book_to_creator_role_unique"
import {
  down as insertFloatingToolbarsPreferenceDown,
  up as insertFloatingToolbarsPreferenceUp,
} from "./1779757215000_insert_floating_toolbars_preference"
import {
  down as addReadaloudDecoratorStylePreferencesDown,
  up as addReadaloudDecoratorStylePreferencesUp,
} from "./1782777600001_add_readaloud_decorator_style_preferences"
import {
  down as addBookCoverShasDown,
  up as addBookCoverShasUp,
} from "./1792504252170_add_book_cover_shas"

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
  "1774713471283_rating_as_reals": {
    up: ratingAsRealsUp,
    down: ratingAsRealsDown,
  },
  "1779753600000_book_to_creator_role_unique": {
    up: bookToCreatorRoleUniqueUp,
    down: bookToCreatorRoleUniqueDown,
  },
  "1779735566760_clear_clips": {
    up: clearClipsUp,
    down: clearClipsDown,
  },
  "1779757215000_insert_floating_toolbars_preference": {
    up: insertFloatingToolbarsPreferenceUp,
    down: insertFloatingToolbarsPreferenceDown,
  },
  "1782777600001_add_readaloud_decorator_style_preferences": {
    up: addReadaloudDecoratorStylePreferencesUp,
    down: addReadaloudDecoratorStylePreferencesDown,
  },
  "1792504252170_add_book_cover_shas": {
    up: addBookCoverShasUp,
    down: addBookCoverShasDown,
  },
}
