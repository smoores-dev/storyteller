---
title: How to Improve Documentation
---

# Improve Documentation

Clear documentation makes Storyteller accessible to everyone. Improving the docs
is often the best way to get started as a contributor.

## How to Contribute

You can improve the
[documentation](https://gitlab.com/storyteller-platform/storyteller/-/tree/main/docs/docs?ref_type=heads)
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
