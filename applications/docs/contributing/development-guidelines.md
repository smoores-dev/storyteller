---
title: Development Guidelines
---

## Code Style

### Mantine + Tailwind

We combine Mantine for structure and accessibility with Tailwind for styling.

Avoid Mantine style props (`mt`, `pb`, `sx`) and React `style` props. Use
Tailwind classes through `className`.

Example:

```tsx
<Center className="min-h-screen pb-36">
```

### Static Analysis

We use [TypeScript](https://www.typescriptlang.org/) and
[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) for code quality. These
run automatically as pre-commit hooks, but can also be run manually:

- `yarn check:types` — TypeScript compiler
- `yarn check:lint` — Oxlint, including type-aware rules
- `yarn check` — Runs both plus formatting checks

### Formatting

We format with [Oxfmt](https://oxc.rs/docs/guide/usage/formatter). Its options
live in `.oxfmtrc.json` at the repo root and, for the mobile app, in
`applications/mobile/.oxfmtrc.json`, which also carries the mobile app's own
ignore rules. To auto-resolve formatting and lint issues:

```shell
yarn fix
```

Oxfmt bundles Prettier internally for Markdown, MDX, HTML, and Vue, so Prettier
plugins are not supported — Tailwind class sorting is built in as
`sortTailwindcss`. SQL files are no longer formatted because
`prettier-plugin-sql` has no Oxfmt equivalent.

:::warning[Keep generated API docs out of the formatter]

`libraries/audiobook/README.md`, `libraries/nodekit/README.md`, and
`libraries/opds/README.md` are listed in `ignorePatterns`. The bundled Prettier
mangles escaped angle brackets inside blockquotes
([prettier#19528](https://github.com/prettier/prettier/issues/19528)), adding
one extra `>` on every run, so those typedoc-generated files never reach a
stable state. Keep them ignored until that fix ships in the Prettier version
Oxfmt bundles. :::

## Versioning

We use the
[Yarn Release Flow](https://yarnpkg.com/features/release-workflow#deferred-versioning).

:::warning[Before opening a Merge Request]

Run the following command:

```shell
yarn version check -i
```

Choose an appropriate update type:

- **Patch:** Fixes broken functionality without changing behavior.
- **Minor:** Adds new functionality.
- **Major:** Changes that are not backwards compatible (avoid unless necessary).

:::
