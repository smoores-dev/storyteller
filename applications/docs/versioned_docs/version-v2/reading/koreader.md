# KoReader

Storyteller works great on e-ink readers. If your device can run
[KOReader](https://github.com/koreader/koreader) — an open-source reading app
for Kindle, Kobo, PocketBook and other e-readers — you can download your
read-aloud books directly from your Storyteller server and listen with
synchronized word highlighting, while your progress stays in sync with the
Storyteller mobile apps.

Two community plugins make this possible:

| Plugin                                                                              | What it provides                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [audiobook.koplugin](https://github.com/stradichenko/audiobook.koplugin)            | Plays the narration embedded in a read-aloud EPUB and highlights each word as it is spoken |
| [storytellersync.koplugin](https://github.com/Sirozha1337/storytellersync.koplugin) | Keeps your position in sync between KOReader and the Storyteller apps                      |

To install a plugin, copy its folder into your KOReader `plugins/` directory
(`koreader/plugins/` on Kindle, `.adds/koreader/plugins/` on Kobo), enable it
under **Tools → Plugin management**, and restart KOReader.

---

## Downloading read-aloud books (OPDS)

Your server publishes every processed book as an OPDS catalog, which KOReader
can browse and download from.

1. Enable the OPDS plugin under **Tools → Plugin management**, then open **Tools
   → OPDS catalog**.
2. Add a new catalog entry:
   - **URL:** `http://your-server:PORT/opds/v1` — for a typical local install,
     `http://192.168.x.x:8001/opds/v1`. Use your own domain with HTTPS if the
     server is behind a reverse proxy.
   - **Username / Password:** your Storyteller account.
3. Browse the catalog and download the books you want.

:::note Use the **v1** feed (`/opds/v1`). The v2 feed (OPDS-PSE, `/opds/v2`) can
crash KOReader on books whose titles contain certain characters. :::

:::tip Read-aloud EPUBs are fully aligned: the original book with the narration
audio and sentence timings already embedded. They are large — often hundreds of
MB for a full novel — so make sure your device has enough storage and allow some
time for the download. :::

## Syncing progress with the Storyteller apps

With
[storytellersync.koplugin](https://github.com/Sirozha1337/storytellersync.koplugin)
installed:

1. Open a book, then go to **Tools → Storyteller Sync**.
2. Enter your **Server URL** and log in — a QR code links KOReader to your
   Storyteller account.
3. The first time you sync a book, it is matched to its copy on the server
   automatically. If no match is found, you can pick the right book from a list
   of the books on your server.

From then on, your position syncs in both directions with the Storyteller apps.
Continue reading in the app, and a **pull** in KOReader jumps you to that spot.
Read on your e-ink device, and a **push** updates the app. Both actions are
available from the plugin's menu and can be bound to gestures or quick-menu
buttons for one-tap syncing.

## Listening with synchronized text

With [audiobook.koplugin](https://github.com/stradichenko/audiobook.koplugin)
installed, a read-aloud EPUB becomes a narrated book:

1. Press and hold a word in the text.
2. Select **Play aligned audiobook from here**.
3. Narration starts from that sentence, with each word highlighted in time with
   the audio and pages turning automatically as you listen.

A playback bar with a scrubber, chapter navigation and a sleep timer is
available while listening — like any audiobook player, but with the text
following along.

## How it fits together

```
Storyteller server ──(OPDS download)──▶ read-aloud EPUB on your device
        ▲                                        │
        │                                        ▼
Storyteller mobile apps ◀──(position sync)── audiobook.koplugin
                             storytellersync.koplugin
```

- The **read-aloud EPUB** carries both the text and the narration.
- **audiobook.koplugin** plays it with word-level highlighting.
- **storytellersync.koplugin** keeps your position identical everywhere —
  sentence-precise, because it uses the same sentence markers as the Storyteller
  apps.
