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
[ESLint](https://eslint.org/) for code quality. These run automatically as
pre-commit hooks, but can also be run manually:

- `yarn check:types` — TypeScript compiler
- `yarn check:lint` — ESLint
- `yarn check` — Runs both plus formatting checks

### Formatting

We follow [Prettier](https://prettier.io/) standards. To auto-resolve formatting
and lint issues:

```shell
yarn fix
```

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
