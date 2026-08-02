# Changelog

## [0.1-118]

### Features

- Added Home and Lock Screen widgets for quickly returning to recent books on
  macOS and iOS.
- Added Audnexus audiobook metadata search and a unified metadata import
  comparison workflow.
- Added quick metadata editing from the macOS library table.
- Added Apple SpeechAnalyzer as a readaloud transcription option on supported
  systems.
- Added a persistent transcription cache so repeated readaloud alignment work
  can reuse prior results.
- Redesigned Add Book on macOS and iOS, and added standalone readaloud alignment
  on iOS.
- Added iOS controls for deleting an entire book or an individual media format
  from a folder source.
- Apple Watch login sync now lets you choose between multiple Storyteller
  servers.

### Platform

- Added an Android proof of concept with securely persisted Storyteller server
  setup, searchable Home, Library, and Downloaded views, cover artwork, book
  details, media download management, and system light/dark support.

### Bug Fixes

- Fixed tvOS reader scrolling and long-paragraph navigation issues.
- Fixed copying readaloud-only books from folders to Storyteller servers.
- Fixed an iOS background-task crash.
- Fixed library sidebar animation and table column-width persistence issues on
  macOS.
- Fixed overlapping group highlights unexpectedly turning the page backward.
- Fixed local-folder descriptions displaying markup instead of readable text.
- Books with matching IDs in different sources now remain distinct across
  reading progress, highlights, downloads, widgets, CarPlay, and Apple Watch,
  with existing progress and highlights migrated to the source-aware format.
- Fixed iOS readaloud file selection and output, along with compact metadata
  import and editor workflows.
- Fixed folder-library scans crashing or producing duplicate books when media
  identifiers collide.
- Fixed completed downloads remaining active after relaunch.
- Fixed playback stopping while backgrounded at chapter or page boundaries.

---

## [0.1-112]

### Features

- Added preliminary CBZ/comic reading support.
- Added book-copy support for moving media between sources, including progress
  transfer for copied books.
- Folder sources on macOS now refresh automatically when their files change on
  disk.
- Copy To now offers only destinations that can accept the book, based on format
  support and your upload permission on the server.
- Added tvOS sentence mode and improved long-paragraph scrolling in the tvOS
  reader.
- Added Apple Watch background audio playback on supported newer hardware.
- Added Apple Watch progress reporting to the server through the paired phone
  relay.

### Platform

- Reorganized StorytellerKit for external SwiftPM apps and bundled reader
  resources so downstream apps can embed the kit.
- Added the first Linux app proof of concept and platform facades for audio,
  fonts, keychain, now-playing, content server, and readaloud services.

### Bug Fixes

- Fixed folder sources stored inside the app container failing to resolve after
  iOS relocates the app's data container, which could make a local library
  appear empty.
- Fixed local book restore delays and removed an extraction fast path that could
  leave local reader state stale.
- Fixed Home view options not applying correctly.
- Fixed library context menus causing excess update churn.
- Fixed copy-complete banner placement and copied-book progress state.
- Fixed copying a book into a folder sometimes splitting it into multiple books.
- Fixed copied books starting at the cover instead of the reading position
  carried from the source.
- Fixed folder sources repeatedly rescanning while the library contains unopened
  folder books.
- Fixed cover display regressions.
- Fixed iPad reader text reflow after toggling the menu.
- Fixed reader sidebars becoming unreadable when the selected theme clashes with
  system colors.

---

## [0.1-109]

### Major Features

- Ebook scrolling mode on macOS and iOS
- Full metadata editing, including Hardcover/iTunes import
- Embedded content server for sharing a local folder source over the LAN to
  Storyteller-compatible clients
- Support for multiple Storyteller servers and local folders, including iCloud
  folders
- MP3 audiobook support
- tvOS reader customization

### Features

#### General

- Full metadata editor for Storyteller books.
- Metadata import from Hardcover, including multiple editions/formats,
  edition-field review, tags, collections, ratings, audiobook length, and
  selectable import fields.
- Cover import/search support from Hardcover and iTunes, with per-book cover
  selection and Storyteller cover upload/refresh handling.
- MP3 audiobook support.
- Support for multiple Storyteller servers and multiple local folder sources,
  including iCloud/shared folder workflows.
- Local folders are now first-class book sources, improving local-file behavior
  across source-aware features like CarPlay.
- Added a new scrolling mode for the ebook reader on macOS and iOS, including
  readaloud sentence tracking support
- Added source-aware cached media handling for local folders and
  Storyteller-backed books, eliminating media duplicates
- Added support for multi-file audio readaloud creation and alignment workflows
- Add Book now targets a chosen book source and can add ebook, audiobook, and
  readaloud formats to either Storyteller or folder destinations.
- Performance improvements across the board, especially to grid view on large
  libraries
- Source-aware library/sidebar views, including a Sources category and editable
  Media Sources sidebar entries that can be moved/renamed/hidden.
- More table customization: alignment columns, creator-role columns, source
  badges, media columns, remembered column sizing/order, and reset-to-defaults
  behavior.
- Local alignment controls from the library UI when ebook + audiobook are
  available.
- Unified book importer UI across macOS and iOS.
- Download retry cap with exponential backoff for more reliable downloads.
- Progress indicator for server uploads.
- Redesigned overlay and menu backgrounds on iOS and macOS.
- Added a floating selection toolbar in the reader with color swatches for
  highlighting, dictionary lookup, copy, and notes, plus edit and delete actions
  on existing highlights.
- Reader text alignment is now selectable between left, justified, and right.

#### macOS

- Added an embedded content server for sharing a local folder source over the
  LAN to Storyteller-compatible clients.
- Added integrated readaloud generation options, including creating readalouds
  locally and automatically pushing to server
- Added EPUB 2 to EPUB 3 conversion support for eligible books
- Server media management actions for upload, delete, and replace flows.
- Expanded book context menus across book views, including Show Book
  Information, Edit Metadata, Server Actions, folder-source deletion,
  local-download deletion, and alignment/reprocessing actions.
- Window shortcuts: macOS Window menu entries use cmd+L for Library, cmd+opt+D
  for Debug Log, cmd+shift+C for Content Server, and cmd+shift+M for MP3 to M4B.
  iPad uses cmd+L for Library and cmd+R for the last-read book.

#### iOS

- Restores the last open book when resuming the app, so reading can continue
  immediately
- Long-pressing inside an existing highlight now opens it for editing instead of
  starting a new highlight.
- iPad: hardware keyboard arrow keys now match macOS - left/right flip pages,
  and up/down skip a sentence forward/backward in readalouds.
- iPad: added an optional right-hand audio drawer in the reader with full
  playback controls, mirroring the macOS sidebar.

#### tvOS

- Added tvOS reader display customization.
- tvOS multi-source / multi-server settings updates.

#### watchOS

- watchOS multi-source / multi-server support updates, including settings and
  source-aware library/download handling.

### Bug Fixes

- Fixed passwords containing `+` not being escaped correctly (#52)
- Fixed erroneous download errors
- Fixed cover cache invalidation
- Made readaloud alignment labels more consistent
- Fixed EPUB scrolling layout so scrolled books use the full reader width
  instead of inheriting paginated column sizing
- Fixed malformed locator payloads from sync so broken fragment data no longer
  drops otherwise usable reading positions
- Fixed local-folder readaloud handling for multi-MP3 audiobook packages and
  generated manifest ordering
- Fixed cached-media/readaloud workflow edge cases across local folders,
  Storyteller uploads, and alignment launch paths

---

## [0.1-90]

### Bug Fixes

- Fixed carousel/stacks navigation in More tab category views not responding to
  taps
- Fixed "View Details" context menu not working in list view and compact grid
  view on iOS

---

## [0.1-69] -> [0.1-88]

### Features

#### General

- Resumable downloads with automatic retry and background support
- New book library view modes: table view, compact grid, and list view
- New series/collection view modes: stack, carousel, list view
- New "By Source" and "By Status" views folded into a unified secondary sidebar
- User-created highlight themes with editable annotation names
- Group/expanding highlight support
- Cover preference can be set to prefer audiobook or ebook
- Cover size slider with responsive covers
- Series fan view improvements: carousel for long series, animated pagination,
  clicking a book opens its sidebar (macOS), first book displayed on top
- "Sort by" available in all categories including carousel and stack views
- Metadata links with back navigation support
- Added support for more metadata: ratings, translators, publication year, last
  read, etc.
- Fractional series position numbers
- Monospace font for progress numbers
- Book count display in sidebar categories
- Sticky view options consistent across all views
- Tags flow to two rows

#### macOS

- Smart shelves with metadata filters, pins, badges
- Fully customizable sidebar: all items pinnable, reorderable, hideable with
  right-click context menus
- Glass effect sticky headers on library views
- Configurable home view with custom rows
- Secondary sidebar with sort options and compact layout
- Book info sidebar expands outwards instead of squishing main content
- Consolidated one-click and two-click modes into one UX (hopefully better than
  both!)
- Updated StoryAlign to 1.2

#### iOS

- Readaloud creation support
- New library views including table view
- Alphabet scrubbing for searching large book listings
- Improved layouts for small screens

### Bug Fixes

- Fixed annotation highlight color propagation and theme handling edge cases
- Fixed hierarchical TOC books
- Fixed ebook player retaining size/state on reopen
- Fixed "show below" stats not accounting for playback rate
- Fixed window width drifting between view switches
- Sync failure errors can now be dismissed
- Tags are now sortable and preserve original capitalization
- Normalized cover sizes across views
- Table layout, overflow, and performance fixes
- Various sidebar, pin, and smart shelf loading fixes
- Fixed broken chevrons on macOS
- Fixed iOS highlights, heading alignments, and category view issues
- Completed books now always show 100% progress (watchOS)

---

## [0.1-67] -> [0.1-69]

### Features

#### macOS

- M4b creator utility added
- Local readaloud creation utility added (via storyalign)
- Left and right sidebars now expand outwards
- Server media management support for modifying and uploading books
  (experimental)

### Bug Fixes

- Better multi-series support
- iOS delete buttons made more discoverable
- Chapter and speed menus now scroll to current selection
- Fixes for sync and backgrounding edge cases
- UI elements now check network operation succeeded for status display
- Simplified reconnect, refresh, and phase handling
- Fixed book loading race condition
- Fixed playback of linear audio not in a SMIL entry
- Fixed concurrency issues
- Fixed crashes on long press -> details view
- macOS books view scrolling optimization
- Performance improvements while reading
- Sleep timer fixes
- Fixed incorrect page count on resize

---

## [0.1-58] -> [0.1-67]

### Features

#### General

- New tvOS app available in test flight!
- Overhaul of the highlighting system. Now supports three highlight types:
  underline, colored text, and colored background (conventional highlight). Four
  preset themes were added to illustrate these modes.
- Improved series handling with ordering badges and cross links
- Support for rating metadata
- Live sync in player with user prompt on all players (configurable)
- Cover switching between audiobook and ebook covers in player and book details
  pages
- One-click play on iOS and macOS (configurable)
- Author view now uses row-view of authors
- New views for books by tag and narrator
- Faster navigation with new media overlay manager
- Display multiple narrators and authors

#### iOS

- Made tab bar in Library view show configurable tabs (e.g. collections instead
  of series)
- Reworked book details view
- Added mini player stats mode (configurable)
- Playback rate slider
- Skip buttons (optionally) available next to overlay stats

#### macOS

- Added resizable second sidebar for certain views

#### tvOS

- Added a new tvOS app. Currently highly barebones and lots of issues, but
  functional.

#### watchOS

- Added browse by collections

### Bug Fixes

- Lots of work to make things more performant
- Apple watch battery life should be greatly increased during playback
- Optimized network layer (using lightweight endpoint and better condition
  change detection)
- Fixed a bug on Apple watch where downloads appeared to disappear during saving
- Better handling of long titles on Apple watch via scrolling text
- Fixed a crash on too many covers displayed in fan views
- Progress sync now performed every 3 seconds to match ST clients
- Books in more than one collection now show up in all of them
- Fixed progress sync issues when restoring readaloud from audio
- Fixed progress sync issues when resuming from background
- Apple Watch progress sync now follows other clients (including audio
  playthrough)
- Settings completely redone
- New robust media overlay playhead handling eliminates race conditions, fixing
  blank page on chapter switch and flickering between pages during audio
  playback
- Fixes to EPUB3 TOC navigation
- Fixed some bluetooth headset issues
- Switched to ST readaloud icon for consistency
