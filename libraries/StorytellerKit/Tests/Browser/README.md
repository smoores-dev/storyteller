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
