---
title: How to Improve Documentation
---

# Improve Documentation

Clear documentation makes Storyteller accessible to everyone. Improving the docs
is often the best way to get started as a contributor.

## How to Contribute

You can improve the
[documentation](https://gitlab.com/storyteller-platform/storyteller/-/tree/main/applications/docs/docs)
by:

- Fixing typos, broken links, or formatting errors.
- Clarifying wording that feels confusing or overly technical.
- Writing new guides for missing topics.

## Reporting Issues

If you spot an error but are unable to fix it yourself, please report it via
GitLab.

1.  Ensure you have a [GitLab account](https://gitlab.com).
2.  Navigate to the
    [Storyteller Issue Tracker](https://gitlab.com/storyteller-platform/storyteller/-/issues).
3.  Click **New Item** to describe what needs to be fixed.

## Editing in the Browser

Every page on this site has an **Edit this page** link at the bottom. It opens
the docs studio, an editor that runs inside the docs site itself, so you do not
need to clone the repository or run anything locally:

1. Browse to the page you want to change and press **Edit**. You will be asked
   to sign in with GitLab.
2. Pick a branch to work on. If you can push to the Storyteller repository the
   branch is created there, otherwise the studio creates a fork under your
   account.
3. The tree on the left shows the pages the way the site's sidebar does (switch
   to **Files** to see the folders instead). The sidebar itself is edited right
   there: drag pages and categories to reorder or nest them, drop a page from
   _Not in the sidebar_ into place, and use the buttons that appear when you
   hover a row to add, rename or remove categories. Moving or renaming a file
   works the same way, with the arrow button or by dragging it onto a folder in
   the Files view.
4. Edit the Markdown on the left and see the page rendered exactly as on the
   site on the right. Type `/` for headings, admonitions, tables and other
   blocks, use the toolbar for formatting, links and images. Paste or drop an
   image and you will be asked where it should live and what it should be
   called. Edits stay in your browser until you commit them.
5. **Commit** formats your changes with Prettier and writes them to the branch.
   **Changes** shows a diff of what you changed, **History** shows earlier
   commits. If someone else changed the same file on the branch in the meantime,
   the studio shows you both versions and asks which one wins. Each page shows
   when it was last changed, and **Blame** in the toolbar shows who last touched
   every line.
6. **Merge request** opens a merge request for the branch. Once it exists the
   panel shows its pipeline status, the files it changes and the review
   comments, which you can answer and resolve from the studio. Comments on a
   line show up in the editor's gutter.

The studio also renders any branch of the repository in view mode, which is
handy for reading documentation that is not published yet.

## MDX

You can use MDX to write React components to use in the documentation. However,
React components must be self contained, and not import anything other than from
`React`. Otherwise previews will break.

## Editing Documentation

The documentation uses [Docusaurus](https://docusaurus.io/). Check out their
docs if you need help with formatting or structure.

If you need help writing documentation, you may find the following resources
useful:

- [Best Practices for GitHub Docs](https://docs.github.com/en/contributing/writing-for-github-docs/best-practices-for-github-docs)
- [The Good Docs Project](https://www.thegooddocsproject.dev/template)
- [Google Developer Docs Style Guide](https://developers.google.com/style/highlights)

### Running the Docs Server

:::info[Prerequisites]

Before running the docs server, complete the
[environment setup](environment-setup.md).

:::

To preview your changes locally, start the documentation development server:

```shell
yarn dev:docs
```

This will start a local server where you can see your changes in real-time.
