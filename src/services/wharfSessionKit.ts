/**
 * WharfKit SessionKit for Anchor only — default WebRenderer UI, no custom modals.
 */
import type { AnyAction } from '@wharfkit/antelope';
import { Checksum256 } from '@wharfkit/antelope';
import {
  BrowserLocalStorage,
  type SerializedSession,
  type Session,
  SessionKit,
} from '@wharfkit/session';
import { WebRenderer } from '@wharfkit/web-renderer';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { APP_NAME, XPR_CHAIN, XPR_CHAIN_ID_HEX } from './walletConstants';

const ANCHOR_PLUGIN_ID = 'anchor';

let webRenderer: WebRenderer | undefined;
let sessionKit: SessionKit | undefined;

export function getWharfWebRenderer(): WebRenderer {
  if (!webRenderer) {
    webRenderer = new WebRenderer({ id: 'xpr-forge-wharf-ui' });
  }
  return webRenderer;
}

export function getWharfSessionKit(): SessionKit {
  if (!sessionKit) {
    sessionKit = new SessionKit(
      {
        appName: APP_NAME,
        chains: [XPR_CHAIN],
        ui: getWharfWebRenderer(),
        walletPlugins: [new WalletPluginAnchor()],
      },
      {
        storage: new BrowserLocalStorage('xpr-forge-wharf-session'),
      }
    );
  }
  return sessionKit;
}

/** Call once after mount (Vite/React) so Wharf dialogs attach to the DOM. */
export function appendWharfDialogElement(): void {
  getWharfWebRenderer().appendDialogElement();
}

export function isXprAnchorSerializedSession(s: SerializedSession): boolean {
  if (s.walletPlugin?.id !== ANCHOR_PLUGIN_ID) return false;
  try {
    return Checksum256.from(s.chain).equals(XPR_CHAIN.id);
  } catch {
    return String(s.chain).toLowerCase() === XPR_CHAIN_ID_HEX.toLowerCase();
  }
}

export function stableAnchorWalletId(session: Session): string {
  return `anchor:${String(session.chain.id)}:${String(session.actor)}@${String(session.permission)}`;
}

export async function loginAnchor(): Promise<Session | undefined> {
  const kit = getWharfSessionKit();
  const { session } = await kit.login({
    walletPlugin: ANCHOR_PLUGIN_ID,
    chain: XPR_CHAIN,
  });
  return session;
}

export async function restoreAllAnchorSessions(): Promise<Session[]> {
  const kit = getWharfSessionKit();
  const stored = await kit.getSessions();
  const sessions: Session[] = [];
  for (const s of stored) {
    if (!isXprAnchorSerializedSession(s)) continue;
    const session = await kit.restore({
      chain: s.chain,
      actor: s.actor,
      permission: s.permission,
      walletPlugin: s.walletPlugin,
    });
    if (session) sessions.push(session);
  }
  return sessions;
}

export async function logoutAnchorSession(session: Session): Promise<void> {
  await getWharfSessionKit().logout(session);
}

/** Removes every session WharfKit has stored for this app prefix (Anchor-only kit). */
export async function logoutAllWharfSessions(): Promise<void> {
  await getWharfSessionKit().logout();
}

export async function transactAnchor(
  session: Session,
  actions: Array<{
    account: string;
    name: string;
    data: Record<string, unknown>;
    authorization?: unknown[];
  }>
) {
  const mapped: AnyAction[] = actions.map((a) => ({
    account: a.account,
    name: a.name,
    authorization: (a.authorization ?? [session.permissionLevel]) as AnyAction['authorization'],
    data: a.data,
  }));

  if (mapped.length === 1) {
    return session.transact({ action: mapped[0] }, { broadcast: true });
  }
  return session.transact({ actions: mapped }, { broadcast: true });
}
