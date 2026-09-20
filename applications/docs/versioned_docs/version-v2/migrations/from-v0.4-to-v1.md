# From v0.4 to v1

The Storyteller backend is officially stable! 🎉 🎉

## What do I have to do?

Nothing! This release marks some minor UI updates, but nothing has changed from
an administration or API standpoint. Really, v0.4 was the first stable release,
but there's no real way to know whether a release will end up being The One
until you send it out into to world and see how it fares.

From now on, in addition to the `latest` tag, the commit-specific tags, and the
semantic versioning tags (e.g. `web-v0.4.55`), we'll be publishing the latest
version to a `web-v1` tag. If we ever make another breaking change to the
Storyteller backend, it will be published to `latest` and `web-v2`, but _not_ to
`web-v1`. If you have automatic image pulls or container updates set up, you may
want to switch to the `web-v1` tag from `latest`!

## What does it mean that Storyteller is stable?

It means that we think this current architecture, feature set, and
administrative setup is a solid foundation for the future of Storyteller, and
it's unlikely to change significantly in the near future. The last significant
architectural change was our migration to use
[echogarden](https://github.com/echogarden-project/echogarden) under the hood
for transcription almost four months ago. Since then, we've had _fifty-five_
releases, none of which have required backwards-incompatible changes.

That's not to say we won't continue _adding_ to Storyteller &mdash; far from it!
In fact, hopefully this means that we'll be able to spend _more_ time adding to
Storyteller, and less time squashing bugs and re-writing core algorithms. But
those additions should be backwards compatible and safe to upgrade to
automatically.
