# Storyteller Web Reader

Storyteller also supports reading books in the web browser. This is useful if
you don't want to install the Storyteller mobile app, or if you want to read
books on a computer.

<!-- ![Storyteller Web Reader](/img/web-reader.png) -->

## Settings

### Adding a custom font

You can add a custom font to the web reader by clicking the "Reading Settings"
button in the top right corner of the reader, scrolling down, and selecting
"Custom" from the "Font family" dropdown.

This reveals a new form where you can add the name and URL of the font you want
to use.

![Storyteller Web Reader - Custom Font](/img/custom-font-options.png)

In the URL field, add this URL of a Google font:

![Storyteller Web Reader - Custom Font URL](/img/custom-font-1.png)

Then, in the Name field, add the name of said font:

![Storyteller Web Reader - Custom Font Name](/img/custom-font-2.png)

## Installing as PWA

You can install Storyteller as a progressive web app (PWA) on your device if you
wish to do so. Currently, this does not provide any additional features such as
offline reading, but we might consider adding them in the future.

While technically possible to install Storyteller as a PWA on some mobile
devices in most regions, we recommend using the
[Storyteller mobile apps](/docs/reading/storyteller-apps) instead.

### Chromium based browsers (Chrome, Edge, Brave, Vivaldi, etc.)

When opening Storyteller in a Chromium based browser on any desktop OS (Windows,
macOS, Linux), you will be prompted to install it as a PWA.

![Storyteller Web Reader - Install as PWA](/img/pwa-chromium.png)

### Firefox

Firefox recently added support for installing PWAs on Windows. This may extend
to other browsers based on Firefox (e.g. Zen).

To enable this, you need to either go to
`Settings > Firefox Labs > Add sites to your taskbar`.

![Storyteller Web Reader - Add to taskbar](/img/pwa-firefox-setting.png)

Or, you can set `browser.taskbarTabs.enabled` to `true` in the `about:config`
page.

![Storyteller Web Reader - About config](/img/pwa-firefox-aboutconfig.png)

Note that if you do not see the Firefox Labs option, you are likely either using
a non-Windows OS or you are using a version of Firefox that does not support
this feature, and won't be able to install Storyteller as a PWA.

### Safari and Webkit based browsers

Simply click `Share` on the Storyteller web interface, and select `Add to Dock`

![Storyteller Web Reader - Add to Dock](/img/pwa-safari-macos.png)

## Browser specific behavior

For the smoothest and most bug-free experience we recommend using a Chromium
based browser to read your books.

### Safari and Webkit based browsers (e.g. Orion)

Safari users may experience some more buggy behavior, as a few Safari specific
workarounds are in place.

### Firefox and Firefox based browsers (e.g. Zen)

Firefox has suboptimal performance when skpping through audio, eg when manually
navigating pages/chapters/sentences. Some audio distortion may be be heard when
pausing or unpausing.

This is likely due to the way Firefox handles audio and video, namely by
destroying and recreating the audio stream when seeking. This may vary depending
on your operating system.

Related bugs:

- https://bugzilla.mozilla.org/show_bug.cgi?id=1923203
