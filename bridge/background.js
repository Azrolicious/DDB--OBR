// DDB-OBR Bridge — background worker.
//
// Answers a small, fixed set of READ-ONLY requests from the DDB-OBR Owlbear
// extension by calling D&D Beyond with your existing dndbeyond.com login:
//
//   1. POST auth-service.dndbeyond.com/v1/cobalt-token (your login cookie is sent
//      because this extension has host permission for dndbeyond.com) returns a
//      short-lived bearer token.
//   2. That token is used for the character / encounter / monster services.
//
// The token stays inside this worker. Pages only ever get the JSON they asked
// for, and only pages listed in manifest.json's content_scripts can ask. The page
// can't supply URLs: each operation builds its own D&D Beyond URL from validated
// ids, and nothing here writes to D&D Beyond.

const api = globalThis.browser ?? globalThis.chrome;

const AUTH_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const CHARACTER_URL = (id) => `https://character-service.dndbeyond.com/character/v5/character/${id}`;
const SUMMARIES_URL = "https://character-service-scds.dndbeyond.com/v2/characters";
const ENCOUNTERS_URL = "https://encounter-service.dndbeyond.com/v1/encounters?skip=0&take=500";
const ENCOUNTER_URL = (id) => `https://encounter-service.dndbeyond.com/v1/encounters/${id}`;
const MONSTERS_URL = (ids) => `https://monster-service.dndbeyond.com/v1/Monster?${ids.map((id) => `ids=${id}`).join("&")}`;
const CONFIG_URL = "https://www.dndbeyond.com/api/config/json";
const CAMPAIGN_CHARACTERS_URL = (id) => `https://www.dndbeyond.com/api/campaign/stt/active-short-characters/${id}`;

class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ------------------------------------------------------------ allowed pages

function matchPatternToRegExp(pattern) {
  const match = /^(\*|https?):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/.exec(pattern);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const schemeRe = scheme === "*" ? "https?" : scheme;
  const hostRe = host === "*" ? "[^/]+" : host.startsWith("*.") ? `(?:[^/]+\\.)?${esc(host.slice(2))}` : esc(host);
  const pathRe = path.split("*").map(esc).join(".*");
  return new RegExp(`^${schemeRe}://${hostRe}(?::\\d+)?${pathRe}$`);
}

const ALLOWED_PAGES = (api.runtime.getManifest().content_scripts ?? [])
  .flatMap((cs) => cs.matches ?? [])
  .map(matchPatternToRegExp)
  .filter(Boolean);

const OWN_PAGES = api.runtime.getURL("");

function senderKind(sender) {
  if (sender.id !== api.runtime.id) return null;
  const url = sender.url ?? "";
  if (url.startsWith(OWN_PAGES)) return "popup";
  return ALLOWED_PAGES.some((re) => re.test(url)) ? "page" : null;
}

// ------------------------------------------------------------ auth & fetching

let session = null; // { token, expires, userId, username }

function decodeClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=")));
    const find = (suffix) => Object.entries(claims).find(([key]) => key.endsWith(suffix))?.[1];
    const userId = Number(find("/nameidentifier") ?? claims.sub);
    return { userId: Number.isFinite(userId) ? userId : undefined, username: find("/name") ?? claims.name ?? undefined };
  } catch {
    return {};
  }
}

async function getSession(force = false) {
  if (!force && session && Date.now() < session.expires) return session;
  session = null;
  let response;
  try {
    response = await fetch(AUTH_URL, { method: "POST", credentials: "include" });
  } catch (error) {
    throw new BridgeError("network", `Couldn't reach D&D Beyond (${error.message}).`);
  }
  const body = response.ok ? await response.json().catch(() => null) : null;
  if (!body?.token) {
    throw new BridgeError("not_logged_in", "You're not logged in to dndbeyond.com in this browser.");
  }
  const ttl = Number(body.ttl) || 300;
  session = { token: body.token, expires: Date.now() + Math.max(30, ttl - 30) * 1000, ...decodeClaims(body.token) };
  return session;
}

// D&D Beyond rate-limits; keep a few requests in flight at most.
let active = 0;
const queue = [];
async function limited(fn) {
  if (active >= 4) await new Promise((resolve) => queue.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    queue.shift()?.();
  }
}

function explainStatus(status, what) {
  if (status === 401 || status === 403) return new BridgeError("forbidden", `D&D Beyond won't share this ${what} with your account (it may be private or in another campaign).`);
  if (status === 404) return new BridgeError("not_found", `D&D Beyond couldn't find that ${what}.`);
  if (status === 429) return new BridgeError("rate_limited", "D&D Beyond is rate limiting requests. Try again in a minute.");
  return new BridgeError("http_error", `D&D Beyond returned an error (${status}) for the ${what}.`);
}

async function ddbJson(url, what, { method = "GET", body, auth = true } = {}) {
  return limited(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = { Accept: "application/json" };
      if (auth) headers.Authorization = `Bearer ${(await getSession(attempt > 0)).token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "omit",
        });
      } catch (error) {
        throw new BridgeError("network", `Couldn't reach D&D Beyond (${error.message}).`);
      }
      if (response.status === 401 && auth && attempt === 0) continue; // token expired early: refresh once
      if (!response.ok) throw explainStatus(response.status, what);
      return response.json();
    }
    throw explainStatus(401, what);
  });
}

// ------------------------------------------------------------ operations

const isId = (v) => Number.isSafeInteger(v) && v > 0;
const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function idList(value, max) {
  if (!Array.isArray(value) || !value.length || value.length > max || !value.every(isId)) {
    throw new BridgeError("bad_request", `Expected 1-${max} numeric ids.`);
  }
  return [...new Set(value)];
}

function requireId(value) {
  if (!isId(value)) throw new BridgeError("bad_request", "Expected a numeric id.");
  return value;
}

const OPS = {
  async status() {
    try {
      const s = await getSession();
      return { loggedIn: true, userId: s.userId, username: s.username };
    } catch (error) {
      if (error.code === "not_logged_in") return { loggedIn: false };
      throw error;
    }
  },

  async character({ id }) {
    const json = await ddbJson(CHARACTER_URL(requireId(id)), "character");
    return json?.data ?? json;
  },

  async characterSummaries({ ids }) {
    const json = await ddbJson(SUMMARIES_URL, "characters", { method: "POST", body: { characterIds: idList(ids, 100) } });
    return json?.foundCharacters ?? [];
  },

  async encounters() {
    const json = await ddbJson(ENCOUNTERS_URL, "encounter list");
    return json?.data ?? [];
  },

  async encounter({ id }) {
    if (!isUuid(id)) throw new BridgeError("bad_request", "Expected an encounter id.");
    const json = await ddbJson(ENCOUNTER_URL(id.toLowerCase()), "encounter");
    return json?.data ?? json;
  },

  async monsters({ ids }) {
    const all = idList(ids, 200);
    const out = [];
    for (let i = 0; i < all.length; i += 40) {
      const json = await ddbJson(MONSTERS_URL(all.slice(i, i + 40)), "monsters");
      out.push(...(json?.data ?? []));
    }
    return out;
  },

  async config() {
    return ddbJson(CONFIG_URL, "rules config", { auth: false });
  },

  async campaignCharacters({ campaignId }) {
    const json = await ddbJson(CAMPAIGN_CHARACTERS_URL(requireId(campaignId)), "campaign");
    return json?.data ?? [];
  },
};

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const kind = senderKind(sender);
  const op = message?.op;
  if (!kind || typeof op !== "string" || !Object.hasOwn(OPS, op) || (kind === "popup" && op !== "status")) {
    sendResponse({ ok: false, error: { code: "forbidden", message: "Request not allowed." } });
    return false;
  }
  Promise.resolve()
    .then(() => OPS[op](message.params && typeof message.params === "object" ? message.params : {}))
    .then(
      (data) => sendResponse({ ok: true, data }),
      (error) => sendResponse({ ok: false, error: { code: error.code ?? "error", message: error.message ?? String(error) } }),
    );
  return true; // keep the channel open for the async response
});
