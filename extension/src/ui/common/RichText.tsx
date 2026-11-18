import DOMPurify from "dompurify";
import { useMemo, type MouseEvent } from "react";
import { absolutizeDdbUrl } from "../../ddb/ids";
import { d20 } from "../../dice/dice";

/**
 * Renders D&D Beyond HTML safely: sanitized with DOMPurify, links made absolute
 * and opened in a new tab, and dice/attack bonuses turned into roll buttons.
 */

const ROLLABLE = /([+-]\d{1,2})(?=\s*(?:to hit|,\s*(?:reach|range)))|\b(\d{0,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)\b/gi;

function labelFor(node: Node): string {
  const block = (node.parentElement?.closest("p, li, td, div") ?? node.parentElement) as HTMLElement | null;
  const strong = block?.querySelector("strong, b, em, i");
  const text = strong?.textContent?.trim().replace(/[.:]+$/, "");
  return text && text.length < 60 ? text : "Roll";
}

function injectRollButtons(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.textContent ?? "";
    ROLLABLE.lastIndex = 0;
    if (!ROLLABLE.test(text) || node.parentElement?.closest("a, button")) continue;
    ROLLABLE.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(ROLLABLE)) {
      const index = match.index ?? 0;
      fragment.append(text.slice(last, index));
      const button = document.createElement("button");
      button.className = "dice-roll";
      button.type = "button";
      const label = labelFor(node);
      if (match[1]) {
        button.dataset.roll = d20(Number(match[1]));
        button.dataset.label = `${label} (to hit)`;
      } else {
        button.dataset.roll = match[2].replace(/\s+/g, "");
        button.dataset.label = `${label} (damage)`;
      }
      button.textContent = match[0];
      fragment.append(button);
      last = index + match[0].length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
}

export function prepareHtml(html: string, rollable: boolean): string {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "form", "input", "button"] });
  const container = document.createElement("div");
  container.innerHTML = clean;
  container.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("href", absolutizeDdbUrl(a.getAttribute("href") ?? ""));
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  container.querySelectorAll("img[src]").forEach((img) => {
    img.setAttribute("src", absolutizeDdbUrl(img.getAttribute("src") ?? ""));
    img.setAttribute("referrerpolicy", "no-referrer");
  });
  if (rollable) injectRollButtons(container);
  return container.innerHTML;
}

export function RichText({
  html,
  onRoll,
}: {
  html: string;
  onRoll?: (expression: string, label: string) => void;
}) {
  const prepared = useMemo(() => prepareHtml(html, !!onRoll), [html, onRoll]);
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button.dice-roll");
    if (target?.dataset.roll && onRoll) {
      event.preventDefault();
      onRoll(target.dataset.roll, target.dataset.label ?? "Roll");
    }
  };
  if (!html.trim()) return null;
  return <div className="rich" onClick={handleClick} dangerouslySetInnerHTML={{ __html: prepared }} />;
}
