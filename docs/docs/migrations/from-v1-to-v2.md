# From v1 to v2

Storyteller v2 is finally available!

## What do I have to do?

Nothing! Storyteller will automatically migrate your existing library to v2, and
you’ll have access to all of the new
[authentication](/docs/administering#oauthoidc-configuration) and
[library management](/docs/managing-your-library) features.

## What should I look out for?

Definitely read through the [Managing your library](/docs/managing-your-library)
docs to see what new library management features are in v2!

### New assets folder structure

Your assets directory will be structured differently (some would say better)!
Previously, the assets directory looked something like this:

```
/data/
  assets/
    audio/
      <random-uuid>/
        originals/
          Frankenstein.m4b
    text/
      <random-uuid>/
        originals/
          Frankenstein.epub
```

This was, admittedly, not very human-friendly. The new structure looks like
this:

```
/data/
  assets/
    Frankensein/
      text/
        Frankenstein.epub
      audio/
        Frankenstein.m4b
      readaloud/
        Frankenstein.epub
```

### New API and API docs (in progress)

The two breaking changes in v2 are the assets folder structure (as mentioned
above, you will be automatically migrated to this new folder structure) and the
REST API. All v1 endpoints used by the mobile apps are still in place, but the
rest have been deleted and replaced with a new set of `v2`-namespaced endpoints.
If you were using the REST API for any reason, you’ll have to migrate to the new
endpoints (they’re better, we promise!).

There are also API docs now, served from every Storyteller instance. These are
very much still in progress, but you can at least see a list of the available
endpoints and a description of what they’re used for. To view the API docs,
navigate to the path `/api/openapi` on your Storyteller instance.
