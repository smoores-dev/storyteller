---
sidebar_position: 2
---

# Making Changes

## Type Checking, and Static Analysis

Both the Python and Node.js projects rely on type checking and other forms of
static analysis to reduce the opportunity for bugs and speed up development.
After running `yarn` (have you read
[Installing Dependencies](/docs/development/backend/getting-started#installing-dependencies)?),
you will also have git hooks set up that run this static analysis as a
pre-commit check.

### Python

For Python, we use Pyright for static type checking. Pyright relies on standard
Python type annotations, and includes a command line tool (installed as a Node
dependency of this repo) and a VS Code extension (Pylance). Integrations also
exist for neovim and emacs.

To make the most out of Pyright, make sure that your editor is using the virtual
environment created by Poetry. You can see the path to this virtual environment
with `poetry env info`, under Virtualenv &rightarrow; Path.

You can also run the Pyright type checker manually with
`poetry run yarn pyright`.

### Node.js

For Node.js, we use [Typescript](https://www.typescriptlang.org/) for static
type checking and [ESLint](https://eslint.org/) for other kinds of static
analysis. We highly recommend installing the ESLint extension/plugin for your
editor.

You can also run these tools manually. `yarn check:types` will run the
typescript compiler, `yarn check:lint` will run ESLint, and `yarn check` will
run both (as well as checking [formatting](#formatting)).

## Formatting

This repo adheres to
[Prettier's philosophy of formatting](https://prettier.io/docs/en/why-prettier).
Formatting is automated, enforced, and is minimally customized. For Python, we
use [Black](https://black.readthedocs.io/en/stable/), and for Node.js we use
[Prettier](https://prettier.io/). Your code will be automatically formatted as
part of a pre-commit hook, and you can also use the Black and Prettier
extensions/plugins for your code editor to autoformat on save.

There are also scripts for automatically fixing formatting. For Python, you can
use:

```shell
./scripts/fix.sh
```

To fix all formatting issues.

Any auto-fixable formatting or linting errors in the Node.js projects can be
fixed with:

```shell
yarn fix
```
