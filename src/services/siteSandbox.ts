import { isFlexContractActor } from "@/config/launch";

const KEY = "flex-site-sandbox";
export const SITE_SANDBOX_EVENT = "flex-site-sandbox";

type OverlayMod = typeof import("@/test/sandbox/overlay");

let actor: string | null = null;
let actorBound = false;
const waiters: Array<() => void> = [];
let overlayChunk: Promise<OverlayMod> | null = null;

function readFlag(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function siteSandboxFlag(): boolean {
  return readFlag() === "1";
}

export function bindSiteSandboxActor(name: string | null | undefined) {
  actor = name ? name.trim().toLowerCase() : null;
  actorBound = true;
  while (waiters.length) waiters.pop()?.();
}

function whenActorBound(): Promise<void> {
  if (actorBound) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    window.setTimeout(resolve, 4000);
  });
}

export function isSiteSandboxOn(current?: string | null) {
  const who = (current ?? actor)?.trim().toLowerCase() || null;
  return siteSandboxFlag() && isFlexContractActor(who);
}

export function setSiteSandboxOn(on: boolean, current?: string | null) {
  if (current !== undefined) bindSiteSandboxActor(current);
  if (typeof window === "undefined") return;
  if (on && !isFlexContractActor(actor)) return;
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(SITE_SANDBOX_EVENT));
}

export async function loadSiteSandbox(): Promise<OverlayMod | null> {
  if (!siteSandboxFlag()) {
    overlayChunk = null;
    return null;
  }
  await whenActorBound();
  if (!isFlexContractActor(actor)) return null;
  if (!overlayChunk) overlayChunk = import("@/test/sandbox/overlay");
  return overlayChunk;
}

export async function withSiteSandbox<T>(live: T, merge: (mod: OverlayMod, live: T) => T): Promise<T> {
  if (!siteSandboxFlag()) return live;
  const mod = await loadSiteSandbox();
  return mod ? merge(mod, live) : live;
}
