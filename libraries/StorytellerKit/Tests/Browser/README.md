# Reader browser regression tests

These tests run the shipped `FoliateManager`, Foliate view, and paginator in
Chromium and WebKit. Each test gets a fresh page; a message sink records bridge
output.

## Run

From the repository root, with Node 22.18+ (or Node 24+) and Corepack/Yarn
installed:

```sh
yarn install
git lfs pull --include="libraries/StorytellerKit/Sources/Kit/Resources/assets/fonts/Charis-Regular.ttf,libraries/StorytellerKit/Sources/Kit/Resources/assets/fonts/OpenDyslexic-Regular.otf"
yarn playwright install chromium webkit
yarn test:reader:browser
```

The parts that run in the browser are pure JS to avoid having a build step.

To type-check the node pieces, run:

```sh
yarn types:reader:browser
```

On Linux, use `yarn playwright install --with-deps chromium webkit` to install
system libraries too. The GitLab job uses the matching Playwright browser image
and downloads only the two existing, licensed font assets needed by the fixture.
Keep its image version aligned with the root `@playwright/test` dependency.

Useful options:

```sh
yarn test:reader:browser --project=chromium
yarn test:reader:browser --project=webkit --headed
yarn test:reader:browser --repeat-each=3 --workers=2
yarn playwright show-report libraries/StorytellerKit/Tests/Browser/playwright-report
```

`READER_TEST_PORT` overrides the default local port, 4179. The test server
serves the production reader modules directly; it does not build or copy them.

## Chapter skip

Open [Chapter Skip Check](fixtures/chapter-skip.epub) as a paginated ebook. In
Contents, select **Last page of Departure**, then swipe forward once. The
expected heading is **Arrival — page 1**. The affected Android reader skips to
**Onward — page 1**.

The standard browser suite opens the same EPUB. To run just this regression, use
`yarn test:reader:browser chapter-skip`.

## Android selection handle

Open [Handle Check](fixtures/handle-check.epub) as an ebook in the Android app.
Use portrait, single-column pagination with the default Literata 16 text layout.

1. Start at **First page**. Swipe forward to **Second page**, then to **Numbered
   paragraph**, then forward once more. This is page 4 in the same chapter.
2. Long-press **reader** in “The quiet reader” near the middle of the page. Wait
   until you see both selection handles.
3. Slowly drag the **left handle** one word left to include **quiet** and
   release. The page should stay put with only **quiet reader** selected. On the
   baseline Android 15 emulator the heading **Numbered paragraph** reappeared
   and the selection spanned back onto page 3.

Repeat with a short horizontal swipe on the page **between** steps 2 and 3. Let
it snap back to page 4 and check that **reader** is still selected before
dragging the handle. Both paths should produce the same two selected words.

To replay those gestures in the browser test suite, open the fixture in a
debuggable Storyteller Android app (`scripts/androidbuild --debug`). Start with
no active selection. From the repository root, substitute the device serial from
`adb devices`:

```sh
STORYTELLER_ANDROID_SERIAL=emulator-5558 yarn test:reader:browser android-selection-handle --project=chromium --workers=1
```

The two cases send Android touch input to the running app, measure the chapter's
on-screen position and read the selected text. The short-swipe case waits for an
actual scroll to end before testing the handle. Both cases finish with a
deliberate swipe to page 5 while the words are still selected. The Playwright
report includes screenshots from immediately before and after the handle drag.

## Android readaloud swipe

Open [Swipe Check](fixtures/swipe-check.epub) as a **readaloud** in portrait.
Use the default 16-point Literata layout. Under **Customize → Readaloud → Edit
Readaloud Style**, select **Text** and enable **Bold**. The fixture has numbered
sentences and a silent audio track. Playback advances the highlight every three
seconds.

1. While paused, open **Chapters → Swipe Check** to return to the heading.
2. Press **Play**. When **Sentence 01** becomes highlighted, swipe left across
   the middle of the screen to advance one page.
3. As soon as the spoken-text highlight appears on the new page, immediately
   swipe left again. Use a full swipe and lift your finger. On the Fairphone 6
   the cue was **Sentence 07**. Page 3 appeared, then page 2 and Sentence 07
   came back. Continue the same sequence for a few turns if the second one
   holds.

To automate this sequence, start the debuggable reader paused at the heading
with the Play button visible. The test taps Play, observes the actual chapter,
sends Android touch input, and records the farthest and final page positions.
Use the device serial from `adb devices` and set `STORYTELLER_ANDROID_PACKAGE`
if using a separately installed fixture build.

```sh
STORYTELLER_SWIPE_DEVICE=emulator-5558 yarn test:reader:browser android-readaloud-swipe --project=chromium --workers=1
```
