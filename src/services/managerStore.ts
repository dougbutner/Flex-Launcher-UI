import { validAccount, validSymbol } from "@/services/assets";
import { validImageUrl } from "@/services/tokenLogo";
import type { FeeTier, FlexProgram } from "@/config/launch";

export const LAUNCH_STEP_IDS = [
  "create",
  "supply",
  "startlaunch",
  "createpool",
  "activate",
  "deposit",
  "addliquid",
  "lockpos",
  "liftoff",
] as const;

export type LaunchStepId = (typeof LAUNCH_STEP_IDS)[number];

export type LaunchProgress = Record<LaunchStepId, boolean>;

export const LAUNCH_STEPS: Record<LaunchStepId, { label: string; prompt: string }> = {
  create: { label: "Create token", prompt: "Sign create on the token contract. This is the first on-chain step." },
  supply: { label: "Mint or issue 100%", prompt: "Mint or issue the full supply to yourself before startlaunch." },
  startlaunch: { label: "Start launch", prompt: "Sign startlaunch with quote, fee, ticks, and sqrt price." },
  createpool: { label: "Create Alcor pool", prompt: "Sign swap.alcor::createpool with zero amounts and the same sqrt price." },
  activate: { label: "Activate pool", prompt: "Pay activeFee with memo activepool#id if the pool is still inactive." },
  deposit: { label: "Deposit supply", prompt: "Transfer the full supply to swap.alcor with memo deposit." },
  addliquid: { label: "Add liquidity", prompt: "Sign addliquid one-sided using the startlaunch ticks." },
  lockpos: { label: "Lock position", prompt: "Sign lockpos for at least 90 days." },
  liftoff: { label: "Liftoff", prompt: "Sign liftoff so the token can transfer beyond swap.alcor." },
};

export type ManagerToken = {
  issuer: string;
  contract: string;
  symbol: string;
  precision: number;
  program: FlexProgram;
  name: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  farcaster: string;
  imageUrl: string;
  maxSupply: string;
  quoteId: string;
  xtokenSymbol: string;
  xtokenPrecision: number;
  proofPoolId: string;
  swapUnderlyingDefault: boolean;
  fee: FeeTier;
  reflectionRate: number;
  burnRate: number;
  projectRate: number;
  projectAccount: string;
  angelNumbersBps: number;
  jackpotBps: number;
  priceLower: string;
  priceUpper: string;
  lockDays: number;
  poolId: number | null;
  createTx: string;
  mintTx: string;
  startTx: string;
  poolTx: string;
  activateTx: string;
  depositTx: string;
  rangeTx: string;
  lockTx: string;
  liftoffTx: string;
  createdAt: number;
  updatedAt: number;
};

export type ManagerMetaPatch = Pick<
  ManagerToken,
  "name" | "description" | "website" | "twitter" | "telegram" | "farcaster" | "imageUrl"
>;

const PROGRAMS = new Set<FlexProgram>(["easyflex", "complexflex", "flexforex"]);
const FEES = new Set<number>([500, 3000, 10000]);

function str(v: unknown, max = 512): string {
  return String(v ?? "").trim().slice(0, max);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function txDone(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

export function emptyManagerToken(): ManagerToken {
  return {
    issuer: "",
    contract: "",
    symbol: "",
    precision: 6,
    program: "flexforex",
    name: "",
    description: "",
    website: "",
    twitter: "",
    telegram: "",
    farcaster: "",
    imageUrl: "",
    maxSupply: "",
    quoteId: "easy",
    xtokenSymbol: "XUSDC",
    xtokenPrecision: 6,
    proofPoolId: "0",
    swapUnderlyingDefault: true,
    fee: 3000,
    reflectionRate: 100,
    burnRate: 0,
    projectRate: 100,
    projectAccount: "",
    angelNumbersBps: 0,
    jackpotBps: 0,
    priceLower: "",
    priceUpper: "",
    lockDays: 90,
    poolId: null,
    createTx: "",
    mintTx: "",
    startTx: "",
    poolTx: "",
    activateTx: "",
    depositTx: "",
    rangeTx: "",
    lockTx: "",
    liftoffTx: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

export function parseManagerToken(raw: unknown): ManagerToken | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const issuer = str(o.issuer, 12).toLowerCase();
  const contract = str(o.contract, 12).toLowerCase();
  const symbol = str(o.symbol, 7).toUpperCase();
  const program = str(o.program, 16) as FlexProgram;
  if (!validAccount(issuer) || !validAccount(contract) || !validSymbol(symbol)) return null;
  if (!PROGRAMS.has(program)) return null;
  const feeN = num(o.fee, 3000);
  const fee = (FEES.has(feeN) ? feeN : 3000) as FeeTier;
  const poolRaw = o.poolId;
  const poolId = poolRaw == null || poolRaw === "" ? null : Math.max(0, Math.floor(num(poolRaw)));
  const imageUrl = str(o.imageUrl, 1024);
  if (imageUrl && !validImageUrl(imageUrl)) return null;
  const precision = Math.max(0, Math.min(8, Math.floor(num(o.precision, 6))));
  return {
    issuer,
    contract,
    symbol,
    precision,
    program,
    name: str(o.name, 80),
    description: str(o.description, 500),
    website: str(o.website, 256),
    twitter: str(o.twitter, 80),
    telegram: str(o.telegram, 80),
    farcaster: str(o.farcaster, 80),
    imageUrl,
    maxSupply: str(o.maxSupply, 40),
    quoteId: str(o.quoteId, 16) || "easy",
    xtokenSymbol: str(o.xtokenSymbol, 7).toUpperCase() || "XUSDC",
    xtokenPrecision: Math.max(0, Math.min(8, Math.floor(num(o.xtokenPrecision, 6)))),
    proofPoolId: str(o.proofPoolId, 24) || "0",
    swapUnderlyingDefault: o.swapUnderlyingDefault !== false && o.swapUnderlyingDefault !== 0,
    fee,
    reflectionRate: Math.max(0, Math.min(10000, Math.floor(num(o.reflectionRate, 100)))),
    burnRate: Math.max(0, Math.min(10000, Math.floor(num(o.burnRate, program === "easyflex" ? 100 : 0)))),
    projectRate: Math.max(0, Math.min(10000, Math.floor(num(o.projectRate, program === "easyflex" ? 0 : 100)))),
    projectAccount: str(o.projectAccount, 12).toLowerCase(),
    angelNumbersBps: Math.max(0, Math.min(10000, Math.floor(num(o.angelNumbersBps, 0)))),
    jackpotBps: Math.max(0, Math.min(10000, Math.floor(num(o.jackpotBps, 0)))),
    priceLower: str(o.priceLower, 64),
    priceUpper: str(o.priceUpper, 64),
    lockDays: Math.max(90, Math.floor(num(o.lockDays, 90))),
    poolId: poolId && poolId > 0 ? poolId : null,
    createTx: str(o.createTx, 128),
    mintTx: str(o.mintTx, 128),
    startTx: str(o.startTx, 128),
    poolTx: str(o.poolTx, 128),
    activateTx: str(o.activateTx, 128),
    depositTx: str(o.depositTx, 128),
    rangeTx: str(o.rangeTx, 128),
    lockTx: str(o.lockTx, 128),
    liftoffTx: str(o.liftoffTx, 128),
    createdAt: Math.max(0, Math.floor(num(o.createdAt))),
    updatedAt: Math.max(0, Math.floor(num(o.updatedAt))),
  };
}

export function sanitizeManagerMeta(patch: Partial<ManagerMetaPatch>): ManagerMetaPatch | string {
  const name = str(patch.name, 80);
  const description = str(patch.description, 500);
  const website = str(patch.website, 256);
  const twitter = str(patch.twitter, 80);
  const telegram = str(patch.telegram, 80);
  const farcaster = str(patch.farcaster, 80);
  const imageUrl = str(patch.imageUrl, 1024);
  if (imageUrl && !validImageUrl(imageUrl)) return "Use a full http(s) image URL. IPFS re-upload is not available here.";
  if (!name) return "Give the token a display name.";
  return { name, description, website, twitter, telegram, farcaster, imageUrl };
}

export function applyManagerMeta(row: ManagerToken, meta: ManagerMetaPatch): ManagerToken {
  return { ...row, ...meta, updatedAt: Date.now() };
}

export type LaunchEvidence = {
  hasStat?: boolean;
  supplyPositive?: boolean;
  hasLaunch?: boolean;
  launched?: boolean;
  hasPool?: boolean;
  poolActive?: boolean | null;
  deposited?: boolean;
  hasPosition?: boolean;
  hasLock?: boolean;
  txs?: Partial<Record<LaunchStepId | "mint", string>>;
};

export function launchProgressFrom(ev: LaunchEvidence): LaunchProgress {
  const tx = ev.txs ?? {};
  const launched = Boolean(ev.launched) || txDone(tx.liftoff);
  const hasLock = launched || Boolean(ev.hasLock) || txDone(tx.lockpos);
  const hasPosition = hasLock || Boolean(ev.hasPosition) || txDone(tx.addliquid);
  const deposited = hasPosition || Boolean(ev.deposited) || txDone(tx.deposit);
  const hasPool = deposited || Boolean(ev.hasPool) || txDone(tx.createpool);
  const activateDone =
    !hasPool
      ? false
      : launched ||
        hasPosition ||
        deposited ||
        ev.poolActive === true ||
        txDone(tx.activate) ||
        ev.poolActive == null;
  const hasLaunch = launched || hasPool || Boolean(ev.hasLaunch) || txDone(tx.startlaunch);
  const supplyPositive = hasLaunch || Boolean(ev.supplyPositive) || txDone(tx.supply) || txDone(tx.mint);
  const hasStat = supplyPositive || Boolean(ev.hasStat) || txDone(tx.create);

  return {
    create: hasStat,
    supply: supplyPositive,
    startlaunch: hasLaunch,
    createpool: hasPool,
    activate: activateDone,
    deposit: deposited,
    addliquid: hasPosition,
    lockpos: hasLock,
    liftoff: launched,
  };
}

export function nextLaunchStep(progress: LaunchProgress): { id: LaunchStepId | "done"; label: string; prompt: string } {
  for (const id of LAUNCH_STEP_IDS) {
    if (!progress[id]) return { id, label: LAUNCH_STEPS[id].label, prompt: LAUNCH_STEPS[id].prompt };
  }
  return {
    id: "done",
    label: "Launch complete",
    prompt: "This token is live. Open the token page. Admin can still push name, URL, and icon to token.proton.",
  };
}

export function managerTokenKey(contract: string, symbol: string) {
  return `${contract}:${symbol}`;
}

export type ChainIssuerToken = {
  issuer: string;
  contract: string;
  program: FlexProgram;
  symbol: string;
  precision: number;
  launched: boolean;
  poolId: number | null;
  supplyPositive: boolean;
  hasLaunch: boolean;
  hasStat: boolean;
  createTx?: string;
};

export type ManagerView = {
  token: ManagerToken;
  chain: ChainIssuerToken | null;
  progress: LaunchProgress;
  next: ReturnType<typeof nextLaunchStep>;
  inProgress: boolean;
};

export function mergeManagerViews(chain: ChainIssuerToken[], stored: ManagerToken[]): ManagerView[] {
  const map = new Map<string, ManagerView>();
  for (const row of stored) {
    const progress = launchProgressFrom({
      hasStat: true,
      supplyPositive: Boolean(row.mintTx),
      hasLaunch: Boolean(row.startTx),
      launched: Boolean(row.liftoffTx),
      hasPool: row.poolId != null || Boolean(row.poolTx),
      poolActive: row.activateTx ? true : row.poolTx ? false : null,
      deposited: Boolean(row.depositTx),
      hasPosition: Boolean(row.rangeTx),
      hasLock: Boolean(row.lockTx),
      txs: {
        create: row.createTx,
        supply: row.mintTx,
        mint: row.mintTx,
        startlaunch: row.startTx,
        createpool: row.poolTx,
        activate: row.activateTx,
        deposit: row.depositTx,
        addliquid: row.rangeTx,
        lockpos: row.lockTx,
        liftoff: row.liftoffTx,
      },
    });
    const next = nextLaunchStep(progress);
    map.set(managerTokenKey(row.contract, row.symbol), {
      token: row,
      chain: null,
      progress,
      next,
      inProgress: next.id !== "done",
    });
  }
  for (const c of chain) {
    const key = managerTokenKey(c.contract, c.symbol);
    const prev = map.get(key);
    const token: ManagerToken = prev
      ? {
          ...prev.token,
          issuer: c.issuer || prev.token.issuer,
          precision: c.precision || prev.token.precision,
          poolId: c.poolId ?? prev.token.poolId,
          createTx: prev.token.createTx || c.createTx || "",
        }
      : {
          ...emptyManagerToken(),
          issuer: c.issuer,
          contract: c.contract,
          symbol: c.symbol,
          precision: c.precision,
          program: c.program,
          name: c.symbol,
          poolId: c.poolId,
          createTx: c.createTx || "onchain",
        };
    const progress = launchProgressFrom({
      hasStat: c.hasStat || Boolean(token.createTx),
      supplyPositive: c.supplyPositive || Boolean(token.mintTx),
      hasLaunch: c.hasLaunch || Boolean(token.startTx),
      launched: c.launched || Boolean(token.liftoffTx),
      hasPool: c.poolId != null || Boolean(token.poolTx) || Boolean(token.poolId),
      poolActive: token.activateTx ? true : null,
      deposited: Boolean(token.depositTx),
      hasPosition: Boolean(token.rangeTx),
      hasLock: Boolean(token.lockTx),
      txs: {
        create: token.createTx,
        supply: token.mintTx,
        mint: token.mintTx,
        startlaunch: token.startTx,
        createpool: token.poolTx,
        activate: token.activateTx,
        deposit: token.depositTx,
        addliquid: token.rangeTx,
        lockpos: token.lockTx,
        liftoff: token.liftoffTx,
      },
    });
    const next = nextLaunchStep(progress);
    map.set(key, { token, chain: c, progress, next, inProgress: next.id !== "done" });
  }
  return [...map.values()].sort((a, b) => {
    if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
    return a.token.symbol.localeCompare(b.token.symbol);
  });
}

export function managerHasStarted(views: ManagerView[]) {
  return views.some((v) => Boolean(v.token.createTx) || Boolean(v.chain?.hasStat));
}
