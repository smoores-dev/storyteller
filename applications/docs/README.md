# Website

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern
static website generator.

## Docs studio

At `/edit` there's an in-browser editor for the documentation (see
`src/studio`). It talks to GitLab directly from the browser, there is no server
component. Can also be used to preview changes to the docs before they are
merged.

To let people sign in and commit you need a GitLab OAuth application:

1. In GitLab open **User settings → Applications** and create an application
   with:
   - **Confidential** unchecked (the client runs in the browser, there is no
     secret)
   - **Scopes**: `api`
   - **Redirect URIs**: `https://<your docs host>/edit` and, for local
     development, `http://localhost:3000/edit` (one per line)
2. Copy the application id and put it in `applications/docs/.env` for local
   work:

   ```
   STUDIO_GITLAB_APP_ID=<application id>
   ```

   For the published site add the same variable in the project's **Settings →
   CI/CD → Variables**.

3. Build or start the site as usual (`yarn dev:docs`, `yarn build`).

Optional variables:

| Variable                | Default                                                  | Purpose                                                        |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `STUDIO_GITLAB_PROJECT` | `$CI_PROJECT_PATH` or `storyteller-platform/storyteller` | Project the studio reads from and opens merge requests against |
| `STUDIO_GITLAB_URL`     | `$CI_SERVER_URL` or `https://gitlab.com`                 | Self-hosted GitLab instance                                    |
| `STUDIO_DEFAULT_BRANCH` | `main`                                                   | Branch that is shown by default and targeted by merge requests |
| `STUDIO_DOCS_ROOT`      | `applications/docs`                                      | Path of this folder inside the repository                      |

To test against your own fork set `STUDIO_GITLAB_PROJECT` to the fork and add
the fork's redirect URI to the OAuth app.

#### How editing works

- Anyone can browse and preview any branch without signing in. Signing in is
  recommended though, bc there are lower rate limits for unauthenticated API
  calls (they're still quite generous).
- Editing requires signing in and a branch other than the default branch. The
  studio creates the branch for you, in the main repository if your account has
  Developer access, otherwise in a fork under your account (it can create the
  fork too).
- Commits go to that branch. If there's a conflict, the studio shows a conflict
  dialog where you keep yours or take theirs per file.
- A merge request against the default branch is created from the **Merge
  request** panel. Once it exists the panel shows its pipeline status, the diff
  against the default branch and the review discussions (reply, resolve, new
  comments, optionally anchored to the cursor line). Line comments also show in
  the editor gutter. All of that is fetched once per branch load or on
  **Refresh**, nothing polls.
- The file tree has two views. **Sidebar** reads the sidebar JSON files from the
  branch and lets you rearrange them in edit mode, with pages that no sidebar
  references listed separately. **Files** shows the raw folders and suchh. Pages
  can be moved by drag and drop or through the move dialog
- Every opened page shows when it was last changed, by whom and the most recent
  tag that contains it. You can also press **Blame** in the toolbar to add a
  gutter with the author and date of every line, from GitLab's blame API. This
  only works if the file has been committed however.

#### Security notes

- Need to be dang sure we don't have any XSS in the docs site, bc it runs
  scripts from the browser.
- Gitlab is very bad with requesting more limited scopes, so we need to use the
  `api` scope. This can basically do anything.
- Permissions are handled by Gitlab, and while you can't push to main from the
  studio, should be careful.
- Markdown is previewed by compiling it in the browser. Previewing a branch you
  do not trust runs that branch's MDX, which is plain React and has no access
  beyond the page itself, but it can read the tokens above. Prefer previewing
  branches from people you would also accept a merge request from. i.e. don't be
  dumb

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window.
Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be
served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to
build the website and push to the `gh-pages` branch.

### Versions

The docs for the released Storyteller 2 live in `versioned_docs/version-v2`
(snapshot made with `yarn docusaurus docs:version v2`) and are published at
`/docs`. The v3 docs are written in `docs/` and are published at `/docs/next`,
which is not accessible to the public atm.

Styling that should only apply to the v3 docs goes in `src/css/v3.css`. It is
scoped to `html.docs-version-current`, the class Docusaurus puts on the page for
the current version (the studio adds the same class while it previews a file
from `docs/`).

When v3 is released, run `docs:version v3`, switch `lastVersion`, and replace
that scope selector with `:root`.

### Sidebars

Every docs section has an explicit sidebar file: `sidebars.json` for the v3 docs
in `docs/`, `versioned_sidebars/version-v2-sidebars.json` for the v2 snapshot,
`sidebarsContributing.json` for `contributing/`. They are plain Docusaurus
sidebar JSON (doc ids as strings, `{ "type": "category", "label", "items" }`,
links).

We don't use `sidebar_position` and `_category_.json` anymore, bc those are hard
to edit in the studio.

The easiest way to change a sidebar is the studio: the **Sidebar** view of the
file tree reads the sidebar files from the branch you are on, and in edit mode
you can drag pages and categories around, drop pages from _Not in the sidebar_
into place, add, rename and remove categories, and the change becomes an edit of
the JSON file in your next commit.

### Library docs

They are put in `generated/libraries/<name>/index.md` and
`generated/libraries/<name>/api.md`. The `index.md` comes from `readme-stub.md`
when the library has one. Everything not in there is considered API docs.
