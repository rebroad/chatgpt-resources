# Reading the Chrome GPU report

The ChatGPT Chrome extension normally excludes every browser-internal URL from
session tab listings and refuses to claim internal tabs. The extension bundle
is installed separately from this plugin, so changing `browser-service.mjs`
alone does not change that policy.

`scripts/patch-chrome-gpu-tab-support.mjs` applies a narrow exception to the
installed extension bundle. It allows only the root `chrome://gpu` URL, keeps
that tab visible to the CUA session that owns it, and leaves other internal
pages blocked. The patcher fails closed if the extension bundle has changed.

To apply it after an extension update, copy that version's `background.js` to a
temporary file, patch the copy, and install it back with its original owner and
mode. For this Chromium profile:

```sh
background="$HOME/.config/chromium/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/<version>/background.js"
extension_mode=$(stat -c '%a' "$background")
extension_user=$(stat -c '%U' "$background")
extension_group=$(stat -c '%G' "$background")
cp -p "$background" /var/tmp/background.js
node plugins/openai-bundled/plugins/chrome/scripts/patch-chrome-gpu-tab-support.mjs /var/tmp/background.js
install --owner="$extension_user" --group="$extension_group" --mode="$extension_mode" /var/tmp/background.js "$background"
```

Reload the ChatGPT extension or restart Chromium after patching so its service
worker loads the updated bundle. The extension's existing debugger transport
then provides the tab inspection path; the plugin client remains unchanged.
