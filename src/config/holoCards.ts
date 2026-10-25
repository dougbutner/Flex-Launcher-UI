import { HOLO_ISSUER } from "@/config/holoLaunch";

/** AtomicAssets collection for these cards. Author is holo.fl3x. */
export const HOLO_COLLECTION = "holoflxcards";

/** Image schema from the WAX NFT metadata standard (image, light). */
export const HOLO_SCHEMA = "image";

export const CARD_W = 630;
export const CARD_H = 882;

export const CARD_TOKENS = ["EASY", "MEME", "WON", "BTC"] as const;
export type CardToken = (typeof CARD_TOKENS)[number];

export const CARD_RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export const CARD_PATTERNS = [
  { id: "card", label: "Playing card" },
  { id: "classic", label: "Classic" },
  { id: "hex", label: "Hex" },
  { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" },
  { id: "rings", label: "Rings" },
  { id: "shards", label: "Shards" },
  { id: "square", label: "Square" },
  { id: "star", label: "Star" },
  { id: "triangle", label: "Triangle" },
  { id: "chevron", label: "Chevron" },
] as const;

export type PatternId = (typeof CARD_PATTERNS)[number]["id"];

export type FoilId = "diamond" | "gold" | "rose" | "silver";

export type CardLayers = {
  foil: boolean;
  repeat: boolean;
  mark: boolean;
  corners: boolean;
  edges: boolean;
  edition: boolean;
};

export type CardSettings = {
  symbol: CardToken;
  foil: FoilId;
  rank: string;
  pattern: PatternId;
  logoWidth: number;
  rankScale: number;
  bleed: number;
  overlap: number;
  layers: CardLayers;
};

type Foil = {
  id: FoilId;
  label: string;
  folder: string;
  edition: number;
  word: string;
  rarity: string;
  suit: string;
  suitName: string;
  ink: string;
  suitInk: string;
  plate: string;
  stops: [string, string, string];
};

export const FOILS: Foil[] = [
  {
    id: "diamond",
    label: "Diamond",
    folder: "diamond",
    edition: 10,
    word: "Diamond",
    rarity: "Mythic",
    suit: "♦",
    suitName: "Diamonds",
    ink: "#12141c",
    suitInk: "#ba1624",
    plate: "#f4f1ea",
    stops: ["#f7f4ee", "#d5d0ea", "#f3ece0"],
  },
  {
    id: "gold",
    label: "Gold",
    folder: "gold",
    edition: 50,
    word: "Gold",
    rarity: "Epic",
    suit: "♠",
    suitName: "Spades",
    ink: "#ffecc4",
    suitInk: "#ffecc4",
    plate: "#201206",
    stops: ["#6a4a16", "#e8c56a", "#3a2408"],
  },
  {
    id: "rose",
    label: "Rose gold",
    folder: "rose-gold",
    edition: 100,
    word: "Rose gold",
    rarity: "Rare",
    suit: "♥",
    suitName: "Hearts",
    ink: "#ffe4d6",
    suitInk: "#ba1624",
    plate: "#301016",
    stops: ["#7a3a3a", "#f0b0a0", "#4a1820"],
  },
  {
    id: "silver",
    label: "Rose silver",
    folder: "rose-silver",
    edition: 200,
    word: "Rose silver",
    rarity: "Uncommon",
    suit: "♣",
    suitName: "Clubs",
    ink: "#1c161c",
    suitInk: "#1c161c",
    plate: "#ece4e8",
    stops: ["#c8c0c6", "#f4eef2", "#8e868c"],
  },
];

export const CARD_LAYERS_ON: CardLayers = {
  foil: true,
  repeat: true,
  mark: true,
  corners: true,
  edges: true,
  edition: true,
};

export const CARD_DEFAULTS: CardSettings = {
  symbol: "EASY",
  foil: "diamond",
  rank: "A",
  pattern: "card",
  logoWidth: 0.618,
  rankScale: 2,
  bleed: 52,
  overlap: 0.16,
  layers: { ...CARD_LAYERS_ON },
};

/** Light image schema. Field names and types match the published standard. */
export const IMAGE_SCHEMA: { name: string; type: "string" | "ipfs" | "bool" }[] = [
  { name: "name", type: "string" },
  { name: "img", type: "ipfs" },
  { name: "artist", type: "string" },
  { name: "title", type: "string" },
  { name: "about", type: "string" },
  { name: "filetype", type: "string" },
  { name: "resolution", type: "string" },
  { name: "ratio", type: "string" },
  { name: "generative", type: "bool" },
  { name: "backimg", type: "ipfs" },
  { name: "collectionimg", type: "ipfs" },
  { name: "genre", type: "string" },
  { name: "mood", type: "string" },
  { name: "format", type: "string" },
  { name: "credits", type: "string" },
  { name: "link", type: "string" },
  { name: "promo", type: "ipfs" },
  { name: "nsfw", type: "bool" },
  { name: "labels", type: "string" },
  { name: "license", type: "string" },
  { name: "rarity", type: "string" },
];

export type Attr = { key: string; value: [string, string | number] };

export function foilOf(id: FoilId): Foil {
  return FOILS.find((f) => f.id === id) ?? FOILS[0];
}

export function cardLogoSymbol(symbol: string): string {
  return symbol === "BTC" ? "XBTC" : symbol;
}

export function rankWord(rank: string): string {
  if (rank === "A") return "Ace";
  if (rank === "K") return "King";
  if (rank === "Q") return "Queen";
  if (rank === "J") return "Jack";
  return rank;
}

export function printSrc(spec: Pick<CardSettings, "symbol" | "foil" | "rank">): string {
  return `/holo-cards/${spec.symbol}/${foilOf(spec.foil).folder}/${spec.rank}.png`;
}

export function logoSrcs(symbol: string): string[] {
  const code = cardLogoSymbol(symbol);
  return [`/tokens/xtokenpng/512holoxtokens/${code}.png`, `/tokens/xtokenpng/${code}.png`];
}

export function patternSrcs(symbol: string, pattern: string): string[] {
  if (pattern === "card") return [];
  const code = cardLogoSymbol(symbol);
  return [
    `/tokens/xtokenpng/256geomshimmer/${code}-${pattern}.png`,
    `/tokens/xtokenpng/256geomshimmer/${code}-${pattern}-spark.png`,
  ];
}

export function usesPrintedFace(spec: CardSettings): boolean {
  const d = CARD_DEFAULTS;
  const layersOn = (Object.keys(CARD_LAYERS_ON) as (keyof CardLayers)[]).every((k) => spec.layers[k]);
  return (
    spec.pattern === "card" &&
    layersOn &&
    Math.abs(spec.logoWidth - d.logoWidth) < 0.011 &&
    Math.abs(spec.rankScale - d.rankScale) < 0.051 &&
    spec.bleed === d.bleed &&
    Math.abs(spec.overlap - d.overlap) < 0.011
  );
}

export function cardCopy(spec: CardSettings, pageUrl = "") {
  const foil = foilOf(spec.foil);
  const rank = rankWord(spec.rank);
  const name = `${spec.symbol} ${rank}`;
  return {
    name,
    title: `${foil.word} holographic`,
    about: `${name} of ${foil.suitName}. ${foil.word} edition of ${foil.edition}.`,
    artist: HOLO_ISSUER,
    filetype: "png",
    resolution: `${CARD_W} x ${CARD_H}`,
    ratio: "5:7",
    genre: "Holographic",
    mood: foil.word,
    format: "Playing card",
    credits: `Artist: ${HOLO_ISSUER}`,
    labels: [spec.symbol, foil.label, rank, foil.suitName, "playing card"].join(", "),
    license: "Copyright 2026",
    rarity: foil.rarity,
    link: pageUrl,
  };
}

export function cardImmutable(spec: CardSettings, cid: string, pageUrl: string): Attr[] {
  const copy = cardCopy(spec, pageUrl);
  const values: Record<string, string | number> = {
    ...copy,
    img: cid,
    generative: 0,
    nsfw: 0,
  };
  return IMAGE_SCHEMA.flatMap((field) => {
    const value = values[field.name];
    if (value == null || value === "") return [];
    if (field.type === "bool") return [{ key: field.name, value: ["uint8", value ? 1 : 0] as [string, number] }];
    return [{ key: field.name, value: ["string", String(value)] as [string, string] }];
  });
}

export function mintPlan(args: {
  issuer: string;
  owner: string;
  cid: string;
  pageUrl: string;
  spec: CardSettings;
  needCollection: boolean;
  needSchema: boolean;
}) {
  const authorization = [{ actor: args.issuer, permission: "active" }];
  const actions: { account: string; name: string; authorization: typeof authorization; data: Record<string, unknown> }[] = [];
  if (args.needCollection) {
    actions.push({
      account: "atomicassets",
      name: "createcol",
      authorization,
      data: {
        author: args.issuer,
        collection_name: HOLO_COLLECTION,
        allow_notify: false,
        authorized_accounts: [args.issuer],
        notify_accounts: [],
        market_fee: 0,
        data: [],
      },
    });
  }
  if (args.needCollection || args.needSchema) {
    actions.push({
      account: "atomicassets",
      name: "createschema",
      authorization,
      data: {
        authorized_creator: args.issuer,
        collection_name: HOLO_COLLECTION,
        schema_name: HOLO_SCHEMA,
        schema_format: IMAGE_SCHEMA.map((field) => ({ name: field.name, type: field.type })),
      },
    });
  }
  actions.push({
    account: "atomicassets",
    name: "mintasset",
    authorization,
    data: {
      authorized_minter: args.issuer,
      collection_name: HOLO_COLLECTION,
      schema_name: HOLO_SCHEMA,
      template_id: -1,
      new_asset_owner: args.owner,
      immutable_data: cardImmutable(args.spec, args.cid, args.pageUrl),
      mutable_data: [],
      tokens_to_back: [],
    },
  });
  return actions;
}
