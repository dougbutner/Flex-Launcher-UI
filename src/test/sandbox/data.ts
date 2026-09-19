import type { FlexProgram } from "@/config/launch";
import { formatAsset } from "@/services/assets";

/** Stored ISO timestamps. Edit these to move drops on the calendar. Anchored to Aug-Nov 2026. */
export type MockHolder = {
  owner: string;
  amount: string;
  club?: "insider" | "proven";
  lockedPos?: number;
  feeOptOut?: boolean;
  rewardPoolId?: number;
  angel?: number;
  beneficiary?: string;
  beneRate?: number;
  memo?: string;
};

export type MockReply = {
  id: number;
  author: string;
  body: string;
  at: string;
  giphyUrl?: string;
  authorScore?: number;
  upCount?: number;
  upEasy?: number;
};

export type MockPost = MockReply & { replies?: MockReply[] };

export type MockSpec = {
  symbol: string;
  contract: string;
  program: FlexProgram;
  precision: number;
  issuer: string;
  quote: { symbol: string; contract: string; precision: number; flex: boolean };
  fee: number;
  poolId: number;
  launched: boolean;
  insiderAt: string;
  launchAt: string;
  unlockAt: string;
  swapUnderlyingDefault: boolean;
  supply: string;
  reflection: string;
  burn?: string;
  project?: string;
  angelPool?: string;
  jackpotPool?: string;
  reflectionRate: number;
  burnRate: number;
  projectRate?: number;
  projectAccount?: string;
  angelBps?: number;
  jackpotBps?: number;
  mcapUsd: number;
  liqUsd: number;
  volumeUsd: number;
  priceUsd: number;
  priceQuote: number;
  change24: number;
  changeWeek: number;
  holders: MockHolder[];
  posts: MockPost[];
  points: Array<{ at: string; price: number }>;
  trades: Array<{ at: string; price: number; usd: number; side: "buy" | "sell"; sender: string }>;
};

export const MOCK_SPECS: MockSpec[] = [
  {
    symbol: "AURORA",
    contract: "for3x",
    program: "flexforex",
    precision: 6,
    issuer: "auroragold",
    quote: { symbol: "EASY", contract: "mon3y", precision: 6, flex: true },
    fee: 3000,
    poolId: 91001,
    launched: true,
    insiderAt: "2026-07-25T16:00:00-06:00",
    launchAt: "2026-08-08T16:00:00-06:00",
    unlockAt: "2026-11-06T16:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "1000000.000000",
    reflection: "18420.250000",
    burn: "2200.000000",
    project: "4100.000000",
    angelPool: "880.000000",
    jackpotPool: "1540.500000",
    reflectionRate: 200,
    burnRate: 0,
    projectRate: 50,
    projectAccount: "auroragold",
    angelBps: 1000,
    jackpotBps: 500,
    mcapUsd: 2480000,
    liqUsd: 312000,
    volumeUsd: 54000,
    priceUsd: 2.48,
    priceQuote: 1.12,
    change24: 6.4,
    changeWeek: 18.2,
    holders: [
      { owner: "goldhands", amount: "88000.000000", club: "proven", lockedPos: 701, angel: 42 },
      { owner: "diamondlp", amount: "64000.000000", club: "proven", lockedPos: 702, angel: 7 },
      { owner: "for3x", amount: "12000.000000", club: "insider", lockedPos: 0, angel: 111 },
      { owner: "rainmaker", amount: "22100.000000", angel: 3, beneficiary: "quietflex", beneRate: 2500 },
      { owner: "clubwhale", amount: "40500.000000", club: "insider" },
      { owner: "loudholder", amount: "9800.000000", feeOptOut: true },
      { owner: "moonbag", amount: "15600.000000", angel: 888 },
    ],
    posts: [
      {
        id: 900011,
        author: "goldhands",
        body: "Liftoff held. Range is walking and rain is already stacking.",
        at: "2026-09-19T14:10:00Z",
        authorScore: 42,
        upCount: 8,
        upEasy: 24,
        replies: [
          {
            id: 900012,
            author: "diamondlp",
            body: "Proven lock still on. Club chat hits different after golive.",
            at: "2026-09-19T14:40:00Z",
            authorScore: 18,
            upCount: 3,
            upEasy: 6,
          },
        ],
      },
      {
        id: 900013,
        author: "rainmaker",
        body: "Called makeitrain this morning. Angel pot is waking up.",
        at: "2026-09-19T16:05:00Z",
        authorScore: 21,
        upCount: 5,
        upEasy: 11,
        giphyUrl: "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif",
      },
      {
        id: 900014,
        author: "clubwhale",
        body: "Bought the insider window and stayed. Chart is honest.",
        at: "2026-09-17T19:22:00Z",
        authorScore: 11,
        upCount: 2,
        upEasy: 4,
      },
      {
        id: 900015,
        author: "moonbag",
        body: "Set angel to 888. If it hits I am buying the range again.",
        at: "2026-09-12T11:04:00Z",
        authorScore: 9,
      },
    ],
    points: [
      { at: "2026-08-08T16:00:00-06:00", price: 0.0008 },
      { at: "2026-08-15T16:00:00-06:00", price: 0.0021 },
      { at: "2026-08-22T16:00:00-06:00", price: 0.0044 },
      { at: "2026-09-01T16:00:00-06:00", price: 0.0068 },
      { at: "2026-09-08T16:00:00-06:00", price: 0.0091 },
      { at: "2026-09-15T16:00:00-06:00", price: 0.0114 },
      { at: "2026-09-19T10:00:00-06:00", price: 0.0122 },
    ],
    trades: [
      { at: "2026-09-19T15:12:00Z", price: 0.0122, usd: 420, side: "buy", sender: "goldhands" },
      { at: "2026-09-19T13:40:00Z", price: 0.0119, usd: 180, side: "sell", sender: "latecomer" },
      { at: "2026-09-18T21:05:00Z", price: 0.0116, usd: 260, side: "buy", sender: "moonbag" },
    ],
  },
  {
    symbol: "PEBBLE",
    contract: "3asy",
    program: "easyflex",
    precision: 6,
    issuer: "pebblejack",
    quote: { symbol: "WON", contract: "w3won", precision: 6, flex: true },
    fee: 500,
    poolId: 91002,
    launched: true,
    insiderAt: "2026-08-08T12:00:00-06:00",
    launchAt: "2026-08-22T12:00:00-06:00",
    unlockAt: "2026-11-20T12:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "5000000.000000",
    reflection: "6400.000000",
    burn: "3100.000000",
    reflectionRate: 150,
    burnRate: 150,
    mcapUsd: 420000,
    liqUsd: 88000,
    volumeUsd: 9200,
    priceUsd: 0.084,
    priceQuote: 0.41,
    change24: -1.2,
    changeWeek: 4.8,
    holders: [
      { owner: "quietflex", amount: "210000.000000", club: "proven", lockedPos: 711 },
      { owner: "3asy", amount: "18000.000000", club: "insider" },
      { owner: "earlybird", amount: "94000.000000" },
      { owner: "latecomer", amount: "12000.000000" },
      { owner: "loudholder", amount: "33000.000000" },
    ],
    posts: [
      {
        id: 900021,
        author: "quietflex",
        body: "Simple rain plus burn. This is the 3asy way.",
        at: "2026-09-19T12:30:00Z",
        authorScore: 16,
        upCount: 4,
        upEasy: 7,
      },
      {
        id: 900022,
        author: "earlybird",
        body: "Insider fill was calm. Public range is still cheap.",
        at: "2026-09-16T08:15:00Z",
        authorScore: 8,
      },
    ],
    points: [
      { at: "2026-08-22T12:00:00-06:00", price: 0.12 },
      { at: "2026-09-01T12:00:00-06:00", price: 0.28 },
      { at: "2026-09-12T12:00:00-06:00", price: 0.36 },
      { at: "2026-09-19T09:00:00-06:00", price: 0.41 },
    ],
    trades: [
      { at: "2026-09-19T11:20:00Z", price: 0.41, usd: 90, side: "buy", sender: "earlybird" },
      { at: "2026-09-18T17:02:00Z", price: 0.39, usd: 55, side: "sell", sender: "latecomer" },
    ],
  },
  {
    symbol: "GLINT",
    contract: "fl3x",
    program: "complexflex",
    precision: 6,
    issuer: "glintmaker",
    quote: { symbol: "GRAMS", contract: "gold.mon3y", precision: 6, flex: true },
    fee: 3000,
    poolId: 91003,
    launched: true,
    insiderAt: "2026-08-29T10:00:00-06:00",
    launchAt: "2026-09-05T10:00:00-06:00",
    unlockAt: "2026-12-04T10:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "250000.000000",
    reflection: "910.000000",
    burn: "120.000000",
    project: "640.000000",
    reflectionRate: 100,
    burnRate: 50,
    projectRate: 150,
    projectAccount: "glintmaker",
    mcapUsd: 1750000,
    liqUsd: 210000,
    volumeUsd: 22000,
    priceUsd: 7.0,
    priceQuote: 0.018,
    change24: 2.1,
    changeWeek: 9.4,
    holders: [
      { owner: "glintmaker", amount: "14000.000000", club: "proven", lockedPos: 721, beneficiary: "quietflex", beneRate: 1000, memo: "Thanks @@ for $$ **" },
      { owner: "fl3x", amount: "4200.000000", club: "insider" },
      { owner: "goldhands", amount: "18800.000000" },
      { owner: "nyrawatch", amount: "7300.000000" },
    ],
    posts: [
      {
        id: 900031,
        author: "glintmaker",
        body: "Project cut funds the mill. Inheritance is on if I go silent.",
        at: "2026-09-19T09:05:00Z",
        authorScore: 30,
        upCount: 6,
        upEasy: 15,
      },
      {
        id: 900032,
        author: "nyrawatch",
        body: "GRAMS pair feels heavy in a good way.",
        at: "2026-09-08T18:44:00Z",
        authorScore: 7,
      },
    ],
    points: [
      { at: "2026-09-05T10:00:00-06:00", price: 0.008 },
      { at: "2026-09-12T10:00:00-06:00", price: 0.014 },
      { at: "2026-09-19T08:00:00-06:00", price: 0.018 },
    ],
    trades: [{ at: "2026-09-19T08:22:00Z", price: 0.018, usd: 310, side: "buy", sender: "goldhands" }],
  },
  {
    symbol: "NYRA",
    contract: "for3x",
    program: "flexforex",
    precision: 4,
    issuer: "nyrahouse",
    quote: { symbol: "MEME", contract: "m3m3", precision: 4, flex: true },
    fee: 10000,
    poolId: 91004,
    launched: true,
    insiderAt: "2026-09-05T18:00:00-06:00",
    launchAt: "2026-09-12T18:00:00-06:00",
    unlockAt: "2026-12-11T18:00:00-06:00",
    swapUnderlyingDefault: false,
    supply: "800000000.0000",
    reflection: "2200000.0000",
    burn: "0.0000",
    project: "80000.0000",
    angelPool: "125000.0000",
    jackpotPool: "340000.0000",
    reflectionRate: 300,
    burnRate: 0,
    projectRate: 20,
    projectAccount: "nyrahouse",
    angelBps: 800,
    jackpotBps: 1200,
    mcapUsd: 960000,
    liqUsd: 74000,
    volumeUsd: 118000,
    priceUsd: 0.0012,
    priceQuote: 2.4,
    change24: 14.8,
    changeWeek: 41.0,
    holders: [
      { owner: "loudholder", amount: "12000000.0000", club: "proven", lockedPos: 731, angel: 777 },
      { owner: "jackpothit", amount: "8800000.0000", angel: 13 },
      { owner: "for3x", amount: "250000.0000", club: "insider" },
      { owner: "angelnine", amount: "4100000.0000", angel: 9 },
      { owner: "moonbag", amount: "2000000.0000" },
    ],
    posts: [
      {
        id: 900041,
        author: "loudholder",
        body: "MEME quote is loud. Jackpot looks loaded.",
        at: "2026-09-19T17:48:00Z",
        authorScore: 55,
        upCount: 11,
        upEasy: 40,
      },
      {
        id: 900042,
        author: "angelnine",
        body: "Picked 009. Pullangel when the pot clears the floor.",
        at: "2026-09-18T22:11:00Z",
        authorScore: 14,
        replies: [
          {
            id: 900043,
            author: "jackpothit",
            body: "I am here for the three-way split.",
            at: "2026-09-18T22:40:00Z",
          },
        ],
      },
    ],
    points: [
      { at: "2026-09-12T18:00:00-06:00", price: 0.8 },
      { at: "2026-09-15T18:00:00-06:00", price: 1.6 },
      { at: "2026-09-18T18:00:00-06:00", price: 2.1 },
      { at: "2026-09-19T12:00:00-06:00", price: 2.4 },
    ],
    trades: [
      { at: "2026-09-19T17:01:00Z", price: 2.41, usd: 640, side: "buy", sender: "loudholder" },
      { at: "2026-09-19T09:18:00Z", price: 2.22, usd: 210, side: "buy", sender: "angelnine" },
    ],
  },
  {
    symbol: "VAULT",
    contract: "fl3x",
    program: "complexflex",
    precision: 4,
    issuer: "vaultkeep",
    quote: { symbol: "XPR", contract: "eosio.token", precision: 4, flex: false },
    fee: 3000,
    poolId: 91005,
    launched: false,
    insiderAt: "2026-09-16T09:00:00-06:00",
    launchAt: "2026-09-22T09:00:00-06:00",
    unlockAt: "2026-12-21T09:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "10000000.0000",
    reflection: "0.0000",
    burn: "0.0000",
    project: "0.0000",
    reflectionRate: 200,
    burnRate: 50,
    projectRate: 50,
    projectAccount: "vaultkeep",
    mcapUsd: 0,
    liqUsd: 41000,
    volumeUsd: 1800,
    priceUsd: 0.004,
    priceQuote: 0.25,
    change24: 0,
    changeWeek: 0,
    holders: [
      { owner: "vaultkeep", amount: "0.0000", club: "proven", lockedPos: 741 },
      { owner: "fl3x", amount: "0.0000", club: "insider" },
      { owner: "clubwhale", amount: "0.0000", club: "proven", lockedPos: 742 },
      { owner: "earlybird", amount: "0.0000", club: "insider" },
      { owner: "diamondlp", amount: "0.0000", club: "proven", lockedPos: 743 },
    ],
    posts: [
      {
        id: 900051,
        author: "vaultkeep",
        body: "Club window is open. Public launch is Tuesday morning.",
        at: "2026-09-19T13:00:00Z",
        authorScore: 20,
        upCount: 9,
        upEasy: 18,
        replies: [
          {
            id: 900052,
            author: "clubwhale",
            body: "Proved the lock. Buying the insider cap now.",
            at: "2026-09-19T13:22:00Z",
            authorScore: 12,
          },
          {
            id: 900053,
            author: "earlybird",
            body: "XPR quote so skim is on after golive. Still in.",
            at: "2026-09-19T15:01:00Z",
          },
        ],
      },
      {
        id: 900054,
        author: "diamondlp",
        body: "Need more LP names on the list before Friday.",
        at: "2026-09-17T20:18:00Z",
        authorScore: 8,
      },
    ],
    points: [
      { at: "2026-09-16T09:00:00-06:00", price: 0.25 },
      { at: "2026-09-19T09:00:00-06:00", price: 0.25 },
    ],
    trades: [{ at: "2026-09-18T14:00:00Z", price: 0.25, usd: 120, side: "buy", sender: "clubwhale" }],
  },
  {
    symbol: "SPARK",
    contract: "3asy",
    program: "easyflex",
    precision: 6,
    issuer: "sparkmint",
    quote: { symbol: "EASY", contract: "mon3y", precision: 6, flex: true },
    fee: 3000,
    poolId: 91006,
    launched: false,
    insiderAt: "2026-09-21T15:00:00-06:00",
    launchAt: "2026-09-28T15:00:00-06:00",
    unlockAt: "2026-12-27T15:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "2000000.000000",
    reflection: "0.000000",
    burn: "0.000000",
    reflectionRate: 100,
    burnRate: 100,
    mcapUsd: 0,
    liqUsd: 22000,
    volumeUsd: 0,
    priceUsd: 0.02,
    priceQuote: 0.0004,
    change24: 0,
    changeWeek: 0,
    holders: [
      { owner: "sparkmint", amount: "0.000000", club: "proven", lockedPos: 751 },
      { owner: "3asy", amount: "0.000000", club: "insider" },
      { owner: "quietflex", amount: "0.000000", club: "insider" },
    ],
    posts: [
      {
        id: 900061,
        author: "sparkmint",
        body: "Lock is in. Insiders open Monday. Bring EASY.",
        at: "2026-09-19T11:11:00Z",
        authorScore: 10,
        upCount: 3,
        upEasy: 5,
      },
    ],
    points: [{ at: "2026-09-19T11:00:00-06:00", price: 0.0004 }],
    trades: [],
  },
  {
    symbol: "ORBIT",
    contract: "for3x",
    program: "flexforex",
    precision: 6,
    issuer: "orbitlabs",
    quote: { symbol: "XUSDC", contract: "xtokens", precision: 6, flex: false },
    fee: 3000,
    poolId: 91007,
    launched: false,
    insiderAt: "2026-10-01T11:00:00-06:00",
    launchAt: "2026-10-08T11:00:00-06:00",
    unlockAt: "2027-01-06T11:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "750000.000000",
    reflection: "0.000000",
    project: "0.000000",
    angelPool: "0.000000",
    jackpotPool: "0.000000",
    reflectionRate: 180,
    burnRate: 20,
    projectRate: 40,
    projectAccount: "orbitlabs",
    angelBps: 600,
    jackpotBps: 400,
    mcapUsd: 0,
    liqUsd: 15000,
    volumeUsd: 0,
    priceUsd: 0.11,
    priceQuote: 0.11,
    change24: 0,
    changeWeek: 0,
    holders: [
      { owner: "orbitlabs", amount: "0.000000", club: "proven", lockedPos: 761, angel: 100 },
      { owner: "for3x", amount: "0.000000", club: "insider" },
      { owner: "goldhands", amount: "0.000000", club: "insider" },
    ],
    posts: [
      {
        id: 900071,
        author: "orbitlabs",
        body: "XUSDC pair. Proof pool is live. October 1 club, October 8 public.",
        at: "2026-09-18T16:30:00Z",
        authorScore: 12,
      },
    ],
    points: [{ at: "2026-09-18T16:00:00-06:00", price: 0.11 }],
    trades: [],
  },
  {
    symbol: "QUILL",
    contract: "fl3x",
    program: "complexflex",
    precision: 6,
    issuer: "quillform",
    quote: { symbol: "EASY", contract: "mon3y", precision: 6, flex: true },
    fee: 3000,
    poolId: 0,
    launched: false,
    insiderAt: "2026-10-14T13:00:00-06:00",
    launchAt: "2026-10-21T13:00:00-06:00",
    unlockAt: "2027-01-19T13:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "3000000.000000",
    reflection: "0.000000",
    project: "0.000000",
    reflectionRate: 80,
    burnRate: 20,
    projectRate: 80,
    projectAccount: "quillform",
    mcapUsd: 0,
    liqUsd: 0,
    volumeUsd: 0,
    priceUsd: 0,
    priceQuote: 0.0002,
    change24: 0,
    changeWeek: 0,
    holders: [{ owner: "quillform", amount: "3000000.000000" }],
    posts: [],
    points: [],
    trades: [],
  },
  {
    symbol: "HALO",
    contract: "3asy",
    program: "easyflex",
    precision: 4,
    issuer: "haloissue",
    quote: { symbol: "LOAN", contract: "loan.token", precision: 4, flex: false },
    fee: 500,
    poolId: 91009,
    launched: false,
    insiderAt: "2026-10-30T17:00:00-06:00",
    launchAt: "2026-11-06T17:00:00-06:00",
    unlockAt: "2027-02-04T17:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "40000000.0000",
    reflection: "0.0000",
    burn: "0.0000",
    reflectionRate: 50,
    burnRate: 50,
    mcapUsd: 0,
    liqUsd: 9000,
    volumeUsd: 0,
    priceUsd: 0.0004,
    priceQuote: 0.01,
    change24: 0,
    changeWeek: 0,
    holders: [
      { owner: "haloissue", amount: "0.0000", club: "proven", lockedPos: 771 },
      { owner: "3asy", amount: "0.0000", club: "insider" },
    ],
    posts: [
      {
        id: 900091,
        author: "haloissue",
        body: "November drop. LOAN quote. Seed is locked.",
        at: "2026-09-14T19:00:00Z",
        authorScore: 6,
      },
    ],
    points: [{ at: "2026-09-14T19:00:00Z", price: 0.01 }],
    trades: [],
  },
  {
    symbol: "ZEPHYR",
    contract: "for3x",
    program: "flexforex",
    precision: 6,
    issuer: "zephyrwind",
    quote: { symbol: "EASY", contract: "mon3y", precision: 6, flex: true },
    fee: 3000,
    poolId: 91010,
    launched: false,
    insiderAt: "2026-11-12T12:00:00-06:00",
    launchAt: "2026-11-19T12:00:00-06:00",
    unlockAt: "2027-02-17T12:00:00-06:00",
    swapUnderlyingDefault: true,
    supply: "900000.000000",
    reflection: "0.000000",
    project: "0.000000",
    angelPool: "0.000000",
    jackpotPool: "0.000000",
    reflectionRate: 120,
    burnRate: 0,
    projectRate: 80,
    projectAccount: "zephyrwind",
    angelBps: 400,
    jackpotBps: 400,
    mcapUsd: 0,
    liqUsd: 11000,
    volumeUsd: 0,
    priceUsd: 0.03,
    priceQuote: 0.0009,
    change24: 0,
    changeWeek: 0,
    holders: [
      { owner: "zephyrwind", amount: "0.000000", club: "proven", lockedPos: 781, angel: 222 },
      { owner: "for3x", amount: "0.000000", club: "insider" },
      { owner: "rainmaker", amount: "0.000000", club: "insider" },
    ],
    posts: [
      {
        id: 900101,
        author: "zephyrwind",
        body: "Following-month launch. Club list is open if you can prove a lock.",
        at: "2026-09-10T12:00:00Z",
        authorScore: 8,
      },
    ],
    points: [{ at: "2026-09-10T12:00:00Z", price: 0.0009 }],
    trades: [],
  },
];

export function mockKey(contract: string, symbol: string) {
  return `${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

export function unixSec(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function unixMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function qty(amount: string, precision: number, symbol: string) {
  return formatAsset(amount, precision, symbol);
}

export type MockToken = {
  spec: MockSpec;
  key: string;
  launch: Record<string, unknown>;
  stat: Record<string, unknown>;
  settings: Record<string, unknown>;
  presale: Record<string, unknown>;
  flexers: Record<string, unknown>[];
  insiders: Record<string, unknown>[];
  pools: Record<string, unknown>[];
  positions: Record<string, unknown>[];
  accounts: Record<string, Record<string, unknown>[]>;
};

function hydrate(spec: MockSpec): MockToken {
  const p = spec.precision;
  const s = spec.symbol;
  const q = spec.quote;
  const launch: Record<string, unknown> = {
    token_symbol: s,
    quote: { quantity: qty("0", q.precision, q.symbol), contract: q.contract },
    fee: spec.fee,
    tick_lower: -120,
    tick_upper: 222000,
    sqrt_price_x64: "18446744073709551616",
    xtoken_proof_pool_id: q.flex ? 0 : 2142,
    flex_quote: q.flex,
    launched: spec.launched,
    pure_liquid_alcor_pool_id: spec.poolId,
    position_id: spec.poolId > 0 ? spec.poolId + 800 : 0,
    dev_bps: spec.launched ? (q.flex ? 0 : 25) : 0,
    club_bps: spec.launched ? (q.flex ? 0 : 25) : 0,
    unlock_time: spec.launched ? unixSec(spec.unlockAt) : spec.poolId > 0 ? unixSec(spec.unlockAt) : 0,
    swap_underlying_default: spec.swapUnderlyingDefault,
  };
  const stat: Record<string, unknown> = {
    supply: qty(spec.supply, p, s),
    max_supply: qty(spec.supply, p, s),
    issuer: spec.issuer,
    reflection_pool: qty(spec.reflection, p, s),
    burn_pool: qty(spec.burn ?? "0", p, s),
  };
  if (spec.program !== "easyflex") stat.project_pool = qty(spec.project ?? "0", p, s);
  if (spec.program === "flexforex") {
    stat.angel_numbers_pool = qty(spec.angelPool ?? "0", p, s);
    stat.jackpot_pool = qty(spec.jackpotPool ?? "0", p, s);
    stat.angel_numbers_last = 0;
    stat.flexer_count = spec.holders.length;
  }
  const settings: Record<string, unknown> = {
    token_symbol: `${p},${s}`,
    start_key: "",
    limit: 40,
    reflection_rate: spec.reflectionRate,
    burn_rate: spec.burnRate,
    admin_account: spec.contract,
  };
  if (spec.program !== "easyflex") {
    settings.project_rate = spec.projectRate ?? 0;
    settings.project_account = spec.projectAccount ?? spec.issuer;
  }
  if (spec.program === "flexforex") {
    settings.dist_locked = false;
    settings.angel_numbers_bps = spec.angelBps ?? 0;
    settings.jackpot_bps = spec.jackpotBps ?? 0;
    settings.jackpot_winners = 3;
    settings.jackpot_min_hold = 0;
    settings.angel_numbers_cooldown = 86400;
    settings.keeper_min = 0;
    settings.reflect_min = 0;
    settings.rng_kind = 0;
    settings.rng_amt = 0;
  }
  const presale: Record<string, unknown> = {
    token_symbol: s,
    launch_time: unixSec(spec.launchAt),
    insider_time: unixSec(spec.insiderAt),
    mode: 1,
    insider_bps: 500,
    locked_insider_bps: 800,
    collection: "",
    schema: "",
    nft_min: 0,
    min_token: { quantity: qty("0", q.precision, q.symbol), contract: q.contract },
    need_kyc: false,
    lp_min: 0,
    locked_lp_min: 0,
    lock_secs: 7 * 86400,
  };
  const flexers = spec.holders.map((h) => {
    const row: Record<string, unknown> = {
      owner: h.owner,
      balance: qty(h.amount, p, s),
      fee_opted_out: Boolean(h.feeOptOut),
      flex_reward_pool_id: h.rewardPoolId ?? (spec.launched && spec.poolId ? spec.poolId : 0),
    };
    if (spec.program !== "easyflex") {
      row.beneficiary = h.beneficiary ?? "";
      row.bene_rate = h.beneRate ?? 0;
      row.custom_memo = h.memo ?? "";
    }
    if (spec.program === "flexforex") row.angel_number = h.angel ?? 1000;
    return row;
  });
  const insiders = spec.holders
    .filter((h) => h.club)
    .map((h) => ({
      account: h.owner,
      approved: true,
      source: h.owner === spec.issuer ? 0 : 1,
      locked_pos: h.club === "proven" ? h.lockedPos ?? 1 : 0,
    }));
  const pools =
    spec.poolId > 0
      ? [
          {
            id: spec.poolId,
            input_symbol: `${p},${s}`,
            input_contract: spec.contract,
            output_symbol: `${q.precision},${q.symbol}`,
            output_contract: q.contract,
          },
        ]
      : [];
  const positions = spec.holders
    .filter((h) => h.club === "proven")
    .map((h, i) => ({
      owner: h.owner,
      liquidity: String(8_000_000_000_000 - i * 250_000_000_000),
      tickLower: -120,
      tickUpper: 222000,
    }));
  const accounts: Record<string, Record<string, unknown>[]> = {};
  const addAcct = (owner: string, amount: string) => {
    const key = owner.toLowerCase();
    accounts[key] = [{ balance: qty(amount, p, s) }];
  };
  for (const h of spec.holders) addAcct(h.owner, h.amount);
  if (spec.launched) {
    addAcct("swap.alcor", spec.supply);
    addAcct("alcor", "0");
    addAcct(q.contract === "gold.mon3y" ? "gold.mon3y" : q.contract === "mon3y" ? "mon3y" : "mon3y", "0");
  }
  return {
    spec,
    key: mockKey(spec.contract, spec.symbol),
    launch,
    stat,
    settings,
    presale,
    flexers,
    insiders,
    pools,
    positions,
    accounts,
  };
}

export const MOCK_TOKENS: MockToken[] = MOCK_SPECS.map(hydrate);

export const MOCK_BY_KEY = new Map(MOCK_TOKENS.map((t) => [t.key, t]));

export const MOCK_KEYS = new Set(MOCK_TOKENS.map((t) => t.key));
