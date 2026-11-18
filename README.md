# DDB-OBR — D&D Beyond ↔ Owlbear Rodeo

An [Owlbear Rodeo](https://www.owlbear.rodeo) extension that links tokens to your
[D&D Beyond](https://www.dndbeyond.com) characters and monsters. Click a player's token
and their character sheet opens, with live HP, AC, saves, skills, attacks, spells and
features, and every modifier rolls on click. GMs can pull encounters straight from
the D&D Beyond Encounter Builder onto the map and run initiative from the same panel.

> Fan-made and unofficial. Not affiliated with D&D Beyond, Wizards of the Coast or
> Owlbear Rodeo. It only **reads** your D&D Beyond data and never changes anything there.

## What it does

| | |
|---|---|
| **Character import** | Paste a character link (or import a whole D&D Beyond campaign). Characters join the room's *Party* list. |
| **Token ↔ sheet link** | Right-click a token → **Link to D&D Beyond**, or place a new token with the character's portrait. |
| **Click a token, see the sheet** | Selecting a linked token opens its sheet beside the map (toggle with 📌). Tabs for Main, Actions, Spells, Features, Gear, Notes. |
| **Rolling** | Click any modifier, attack, damage or dice in a description. Advantage/disadvantage toggle; rolls show as Owlbear notifications for the room. |
| **HP tracking** | Damage / heal / temp HP on the sheet or in the Combat tab. HP and AC changes made on D&D Beyond sync onto the token (every 60 s by default). |
| **Encounters** (GM) | Lists your D&D Beyond encounters; places every monster as a token (sized by creature size, numbered, optionally hidden, average or rolled HP). "Watch" mode adds monsters you add on D&D Beyond while you play. |
| **Monster stat blocks** | Full stat blocks with clickable attacks and damage. Hidden from players unless you allow it. |
| **Combat tracker** | Roll initiative for everyone or just monsters, turn order, rounds, quick HP edits. Players see "Bloodied" instead of exact monster HP. |
| **Works with other extensions** | Optionally mirrors HP/AC into *Stat Bubbles for D&D* and initiative into Owlbear's *Initiative Tracker*. |

## How it fits together

```
 ┌──────────────── Owlbear Rodeo room ────────────────┐
 │  DDB-OBR extension (static site, this repo's        │
 │  extension/ folder, hosted e.g. on GitHub Pages)    │
 │   • action panel  • sheet popover  • background     │
 │   • stores a small summary on each token            │
 └───────────────▲─────────────────────────────────────┘
                 │ window.postMessage (same page only)
 ┌───────────────┴─────────────────────────────────────┐
 │  DDB-OBR Bridge browser extension (bridge/ folder)  │  optional, per browser
 │   content script ↔ background worker                │
 └───────────────▲─────────────────────────────────────┘
                 │ your dndbeyond.com login
        D&D Beyond character / encounter / monster services
```

**Why a browser extension?** Owlbear runs extensions in iframes on their own website, so
the browser won't send your D&D Beyond login with requests made from there, and D&D
Beyond's APIs don't accept cross-site calls. AboveVTT avoids this by *being* a browser
extension that runs inside dndbeyond.com. DDB-OBR does the mirror image: the Owlbear
side is a normal Owlbear extension, and the small **Bridge** extension relays a fixed
list of read-only requests to D&D Beyond with your session. Your D&D Beyond token never
leaves the bridge's background worker.

**Who needs the bridge?**

- **GM:** yes, for encounters, monsters, campaign import and HP sync.
- **Players:** optional. Without it they still see everything the GM has loaded, because
  sheets are shared over Owlbear's broadcast channel on demand. With it, they can import
  their own private characters and their HP syncs from their own D&D Beyond sheet.
- **No bridge at all:** you can paste a character's JSON (see *Party → Paste JSON
  instead*), and public characters may import directly if D&D Beyond allows it.

**What's stored where**

- *On each token* (Owlbear item metadata): a compact summary: D&D Beyond id, name, HP,
  AC, initiative bonus and rolled initiative.
- *Room metadata:* the party list and the GM's room settings.
- *Scene metadata:* turn/round state and encounter "watch" progress.
- *Your browser* (localStorage): cached full sheets, the rules lookup table, the roll log.

## Setup

### 1. Host the Owlbear extension

The `extension/` folder builds to a static site. The included GitHub Actions workflow
deploys it to GitHub Pages:

1. In the repository on GitHub: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**. (GitHub Pages on a private repository needs a paid plan; Netlify,
   Cloudflare Pages or Vercel work too: build command `npm run build` in `extension/`,
   output `extension/dist`, and set `BASE_PATH` if it's served from a sub-path.)
2. Push to `main` (or run the workflow manually). The manifest will be at
   `https://<user>.github.io/<repo>/manifest.json`, e.g.
   `https://azrolicious.github.io/DDB--OBR/manifest.json`.

### 2. Add it to Owlbear Rodeo

Owlbear profile → **Extensions → Add Custom Extension** → paste the manifest URL. Then
enable it in your room (room menu → **Extensions**). Players don't need to add it
themselves; extensions enabled in a room load for everyone in it.

### 3. Install the bridge (GM, and any player who wants it)

See [`bridge/README.md`](bridge/README.md). In short, Chrome/Edge: `chrome://extensions` →
*Developer mode* → **Load unpacked** → choose the `bridge/` folder. Firefox:
`about:debugging` → *This Firefox* → **Load Temporary Add-on** → `bridge/manifest.json`,
then allow its site permissions. Stay logged in to dndbeyond.com in the same browser.

If you host the extension anywhere other than `azrolicious.github.io/DDB--OBR/`, add
that address to `content_scripts.matches` in `bridge/manifest.json`.

## Using it

- **Party tab:** import characters by link; **Place** adds a token with the D&D Beyond
  portrait, **My art** uses an image from your Owlbear uploads, **Link** links whatever
  token you have selected.
- **Right-click a token → Link to D&D Beyond** to link existing token art. Right-click →
  **Open D&D Beyond Sheet** any time.
- **Encounters tab (GM):** pick an encounter → optionally choose art per monster → **Add
  to scene**. Tokens appear at the centre of your view, hidden until you reveal them
  (untick *Place hidden* to skip that).
- **Combat tab:** **Roll all**, then **Start / Next turn**. Type in the initiative box to
  override a roll.
- **Rolls tab:** your roll log, plus a quick roller for any expression (`8d6`, `1d20+5`).
- **Settings:** sheet-on-click, sharing rolls, sync interval, what players can see,
  interop with other extensions.

## Development

```bash
cd extension
npm install
npm run dev        # http://localhost:5173 — add http://localhost:5173/manifest.json in Owlbear
npm test           # parser, dice and link tests (vitest)
npm run build      # type-check and build to dist/
```

The bridge already allows `http://localhost:5173`. Code map:

| Path | What |
|---|---|
| `extension/src/ddb/character.ts` | D&D Beyond character JSON → sheet (ability scores, HP, AC, saves, skills, attacks, spell slots…). |
| `extension/src/ddb/monster.ts` | Monster JSON → stat block; encounter JSON → groups/monsters. |
| `extension/src/ddb/bridge.ts`, `client.ts` | Talking to the bridge; fallbacks. |
| `extension/src/obr/*` | Owlbear glue: token metadata, placing tokens, combat, sync, peer sheet sharing, settings. |
| `extension/src/ui/*` | React UI for the panel, sheet popover and link picker. |
| `extension/src/entries/background.ts` | Context menus, sheet-on-select, HP sync loop, roll notifications. |
| `bridge/` | The companion browser extension (plain JS, no build step). |

All D&D Beyond parsing goes through `src/ddb/`, and the UI only sees the normalized
types in `src/model/sheet.ts`, so when D&D Beyond changes its JSON there's one place to fix.

## Limits and things to know

- **Status: v0.1, not yet run against live D&D Beyond.** The parsers are tested against
  hand-written data in D&D Beyond's format, the UI against a mock of the Owlbear SDK, and
  the bridge in a real Chromium. Expect small fixes after the first real session; the
  browser console (prefix `[DDB-OBR]`) and the bridge popup are the places to look.

- **D&D Beyond's APIs are private and undocumented.** They're the same ones AboveVTT and
  other community tools use, but they can change without notice. Use the extension with
  your own account for your own games; the bridge limits itself to a few requests at a time.
- **Numbers without the bridge are computed locally.** With the bridge, AC/HP/saves/
  passives come from D&D Beyond's own calculations. Without it, the extension recomputes
  them from the raw character data, which covers the common rules but not every feature.
  Sheets computed that way are marked "⚠ Estimated" in the footer.
- **One-way sync.** HP changed in Owlbear stays on the token; it isn't written back to
  D&D Beyond. When the HP on D&D Beyond changes, the token takes the new value.
- **Token art from D&D Beyond** loads straight from D&D Beyond's image servers. If an
  image doesn't render on the map, use **My art** / **Use my art** to pick one from your
  Owlbear uploads.
- **Interop keys** for Stat Bubbles and the Initiative Tracker are defined in
  `src/constants.ts`. If those extensions change their formats, update them there.

## Naming

"DDB-OBR" works as a code name. If you ever publish to the Owlbear extension store, it's
safer to keep "D&D Beyond" out of the product name (describe it as *for* D&D Beyond
instead). Some options: **Owlbear Beyond**, **Beyond the Rodeo**, **Owlbridge**, **Hoot &
Beyond**. The display name lives in `extension/src/constants.ts` (`EXT_NAME`, `EXT_TITLE`)
and `bridge/manifest.json` (`name`). Leave `EXT_ID` alone once people use it: it
namespaces the data stored on tokens.

## Credits

The approach (D&D Beyond's auth-token flow and service endpoints) was informed by reading
[AboveVTT](https://github.com/cyruzzo/AboveVTT) (AGPL-3.0). No AboveVTT code is included
in this project.
