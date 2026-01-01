---
title: Server Development
---

:::info[Prerequisites]

Please refer to the [Environment Setup](environment-setup.md) guide to set up
the development environment.

:::

## Development Tools

Storyteller is primarily a Next.js server and also relies on additional
libraries for the database and AI transcription engine. It’s helpful to be
familiar with technologies used throughout the project:

### Frontend Technologies

- [TypeScript](https://www.typescriptlang.org/) is used for both frontend and
  backend.
- [React](https://react.dev/) with [Mantine v7](https://v7.mantine.dev/) as the
  component library.
- [Tailwind CSS](https://tailwindcss.com/) for styling. See how we combine
  Mantine with Tailwind in the
  [Development Guidelines](development-guidelines.md#mantine--tailwind).

### Backend Technologies

- [SQLite](https://www.sqlite.org/) as the database, using
  [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) as the driver.
- [Piscina](https://piscinajs.github.io/piscina/) for worker thread
  distribution.
- [Echogarden](https://github.com/echogarden-project/echogarden) for
  transcription.

## Running the Development Servers

To run the dev server using the project root as the data directory (where
`assets` and the database files live):

```shell
STORYTELLER_DATA_DIR=$(pwd) yarn dev:web
```
