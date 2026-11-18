/**
 * Helpers that turn whatever a user pastes (share links, sheet URLs, raw ids)
 * into D&D Beyond ids.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function tryUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    try {
      return new URL(`https://${input.trim()}`);
    } catch {
      return null;
    }
  }
}

function isDdbHost(url: URL): boolean {
  return url.hostname === "dndbeyond.com" || url.hostname.endsWith(".dndbeyond.com");
}

/**
 * Accepts:
 *  - 12345678
 *  - https://www.dndbeyond.com/characters/12345678
 *  - https://www.dndbeyond.com/characters/12345678/AbCdEf   (share link)
 *  - https://www.dndbeyond.com/profile/someone/characters/12345678
 *  - https://character-service.dndbeyond.com/character/v5/character/12345678
 */
export function parseCharacterId(input: string): number | null {
  const text = input.trim();
  if (/^\d{3,12}$/.test(text)) return Number(text);
  const url = tryUrl(text);
  if (!url || !isDdbHost(url)) return null;
  const match = url.pathname.match(/\/characters?\/(?:v\d+(?:\.\d+)?\/character\/)?(\d{3,12})(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

/** Accepts a monster id or a https://www.dndbeyond.com/monsters/16907-goblin URL. */
export function parseMonsterId(input: string): number | null {
  const text = input.trim();
  if (/^\d{1,12}$/.test(text)) return Number(text);
  const url = tryUrl(text);
  if (!url || !isDdbHost(url)) return null;
  const match = url.pathname.match(/\/monsters\/(\d{1,12})(?:-|\/|$)/);
  return match ? Number(match[1]) : null;
}

/** Accepts an encounter UUID or a https://www.dndbeyond.com/encounters/<uuid> URL. */
export function parseEncounterId(input: string): string | null {
  const match = input.trim().match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}

/** Accepts a campaign id or a https://www.dndbeyond.com/campaigns/1234567 URL. */
export function parseCampaignId(input: string): number | null {
  const text = input.trim();
  if (/^\d{1,12}$/.test(text)) return Number(text);
  const url = tryUrl(text);
  if (!url || !isDdbHost(url)) return null;
  const match = url.pathname.match(/\/campaigns\/(\d{1,12})(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

export function characterUrl(id: number): string {
  return `https://www.dndbeyond.com/characters/${id}`;
}

/** Makes D&D Beyond relative links absolute so they work from our iframe. */
export function absolutizeDdbUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://www.dndbeyond.com${href}`;
  return href;
}
