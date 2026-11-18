# DDB-OBR Bridge (browser extension)

The small companion extension that lets the DDB-OBR Owlbear extension read your
D&D Beyond data with **your own D&D Beyond login**. No build step: load this folder
directly.

## Install

**Chrome / Edge / Brave**

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `bridge/` folder.
4. Make sure you're logged in at [dndbeyond.com](https://www.dndbeyond.com) in the same browser.
5. Click the bridge's toolbar icon: it should say *Connected to D&D Beyond*.

**Firefox (121+)**

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
   `bridge/manifest.json`. (Temporary add-ons are removed when Firefox restarts. To keep
   it, the extension needs to be signed through addons.mozilla.org as an unlisted add-on;
   change `browser_specific_settings.gecko.id` to an id you own first.)
2. In `about:addons` → DDB-OBR Bridge → **Permissions**, allow access to
   `dndbeyond.com` and to the site hosting the Owlbear extension. Firefox doesn't grant
   these automatically for Manifest V3 extensions.

Reload your Owlbear Rodeo tab afterwards. The DDB-OBR panel's status dot turns green.

## Hosting somewhere else?

The bridge only talks to pages listed in `content_scripts.matches` in `manifest.json`.
It ships with:

- `https://azrolicious.github.io/DDB--OBR/*` (and the lowercase variant)
- `http://localhost:5173/*` and `http://127.0.0.1:5173/*` for development

Add your own address if you host the Owlbear extension elsewhere, then reload the
extension.

## What it can and can't do

- It answers only these read-only requests: your login status, a character, D&D
  Beyond's computed character summaries, your encounter list, one encounter, monsters by
  id, the public rules config, and a campaign's active characters.
- Pages can't give it URLs. Each request builds its own D&D Beyond URL from validated
  numeric ids or UUIDs.
- Your D&D Beyond token stays in the background worker and is never sent to the page.
- Only pages on the hosts above can talk to it; Owlbear Rodeo itself and other sites can't.
- It never writes to D&D Beyond.
- It runs at most four requests at once, and the Owlbear side syncs at most once per
  interval you choose (60 s by default).

## Files

| File | Role |
|---|---|
| `manifest.json` | Permissions (`*.dndbeyond.com` only) and which pages get the content script. |
| `content.js` | Runs inside the DDB-OBR pages; relays messages to the background worker. |
| `background.js` | Gets a short-lived token from D&D Beyond and performs the allow-listed requests. |
| `popup.html`, `popup.js` | Toolbar popup showing connection status. |
