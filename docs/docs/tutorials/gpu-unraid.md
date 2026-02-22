---
sidebar_position: 3
---

# UNRAID installations

## Unraid App Template

If you plan on hosting Storyteller on an [Unraid](https://unraid.net) server,
you can install Storyteller via the Community Apps Plugin. Just search for
Storyteller and follow the instructions in the template. **Make sure to follow
[the instructions](installation/self-hosting.md#secrets) to generate a secure
secret.**

### Mount the app files and media files on different shares

If you wish to separate your Storyteller "appdata" files from the larger media
files, configure the volumes as follows:

```
App Data:
---------
Container Path: /data
Host Path: /mnt/user/appdata/storyteller

Media:
------
Container Path: /data/assets
Host Path: /mnt/user/media/books  # Or whatever share/path you like!
```

---
