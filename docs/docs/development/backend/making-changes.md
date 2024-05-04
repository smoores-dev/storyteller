---
sidebar_position: 2
---

# Making Changes

## Type Checking, and Static Analysis

The Node.js projects rely on type checking and other forms of static analysis to
reduce the opportunity for bugs and speed up development. After running
`yarn deps` (have you read
[Installing Dependencies](/docs/development/backend/getting-started#installing-dependencies)?),
you will also have git hooks set up that run this static analysis as a
pre-commit check.

We use [Typescript](https://www.typescriptlang.org/) for static type checking
and [ESLint](https://eslint.org/) for other kinds of static analysis. We highly
recommend installing the ESLint extension/plugin for your editor.

You can also run these tools manually. `yarn check:types` will run the
typescript compiler, `yarn check:lint` will run ESLint, and `yarn check` will
run both (as well as checking [formatting](#formatting)).

## Formatting

This repo adheres to
[Prettier's philosophy of formatting](https://prettier.io/docs/en/why-prettier).
Formatting is automated, enforced, and is minimally customized. Your code will
be automatically formatted as part of a pre-commit hook, and you can also use
the Prettier extension/plugin for your code editor to autoformat on save.

Any auto-fixable formatting or linting errors in the Node.js projects can be
fixed with:

```shell
yarn fix
```
