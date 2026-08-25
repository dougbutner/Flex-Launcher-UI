/**
 * Proton Web SDK — transaction signing for an active session.
 * Connection / multi-account orchestration lives in walletSessions.ts.
 */

export interface ProtonSession {
  auth: { actor: string; permission: string };
  link: { removeSession: (...args: unknown[]) => Promise<unknown> };
  session: { transact: (...args: unknown[]) => Promise<unknown>; auth: unknown; chainId?: unknown };
}

/**
 * Transact — push one or more actions to the blockchain.
 */
export async function transact(
  session: ProtonSession,
  actions: Array<{
    account: string;
    name: string;
    data: Record<string, unknown>;
    authorization?: Array<{ actor: string; permission: string }>;
  }>
) {
  const filledActions = actions.map((action) => ({
    ...action,
    authorization: action.authorization || [
      {
        actor: session.auth.actor,
        permission: session.auth.permission,
      },
    ],
  }));

  try {
    const result = await session.session.transact(
      { actions: filledActions },
      { broadcast: true }
    );
    return result;
  } catch (err) {
    console.error('Transaction failed:', err);
    throw err;
  }
}
