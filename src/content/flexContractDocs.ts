import type { FlexProgram } from "@/config/launch";

export type ContractDoc = {
  codeName: string;
  tag: string;
  /** Popup heading. for3x replaces the token@account title. */
  title: string;
  /** Short pitch under the title. The action list stays behind contract documentation. */
  lead: string;
  intro: string;
  pitch: string;
  traits: { k: string; v: string }[];
  sections: { title: string; lines: { name: string; note: string }[] }[];
};

const SHARED_LAUNCH: ContractDoc["sections"][0] = {
  title: "Launch",
  lines: [
    { name: "create", note: "Issuer makes the token. Tax starts at 0." },
    { name: "setfees", note: "Issuer sets tax. Later you cannot raise the total or cut rain." },
    { name: "startlaunch", note: "Pick quote, range, and whether unpaid holders flex into the quote." },
    { name: "liftoff", note: "Lock is stamped. Transfers open after this, or after golive if insiders are on." },
    { name: "addpool", note: "Issuer lists the launch quote as a flex route." },
    { name: "checklock", note: "Anyone. After the lock ends, skim may rise once." },
  ],
};

const SHARED_CLUB: ContractDoc["sections"][0] = {
  title: "Insiders",
  lines: [
    { name: "setpresale", note: "Issuer. Caps and gates before liftoff." },
    { name: "reginsider / provelock", note: "Holder joins and can prove an Alcor lock for a higher cap." },
    { name: "addinsiders / golive", note: "Issuer invites and ends the window." },
  ],
};

export const CONTRACT_DOCS: Record<FlexProgram, ContractDoc> = {
  easyflex: {
    codeName: "easyflex",
    tag: "most trusted",
    title: "",
    lead: "You'll be using the trusted tech that started it all, the one behind meme and easy. This has simple reflections, burn and that's it. Sometimes less is more.",
    intro: "Behind the only altcoin averaging over 500K in 30d swap volume on Alcor.",
    pitch: "Rain and burn. No heir, no project cut, no luck pots.",
    traits: [
      { k: "Rain", v: "yes" },
      { k: "Burn", v: "yes" },
      { k: "Project", v: "no" },
      { k: "Heir", v: "no" },
      { k: "Angel", v: "no" },
      { k: "Jackpot", v: "no" },
    ],
    sections: [
      SHARED_LAUNCH,
      {
        title: "Supply and rain",
        lines: [
          { name: "issue", note: "Issuer. 100% to yourself for launch." },
          { name: "makeitrain", note: "Anyone who signs as sender. Splashes 38.2% of the rain pool. Flex or native." },
          { name: "setmin", note: "Issuer floor for rain size." },
          { name: "choosereward", note: "Holder picks a route, or native." },
          { name: "feeoptout", note: "Holder. Opt out of tax and rain. You cannot turn it back on yourself." },
        ],
      },
      SHARED_CLUB,
    ],
  },
  complexflex: {
    codeName: "complexflex",
    tag: "Advanced Functions",
    title: "",
    lead: "Our v2 tech with the Heir ability, so your token can make daily deposits like a savings account for your kids while keeping your investment in your account. Project fee is added, letting you collect a budget.",
    intro: "Project tax and an heir on your rain.",
    pitch: "Rain, a project cut, and an heir on your rain.",
    traits: [
      { k: "Rain", v: "yes" },
      { k: "Burn", v: "yes" },
      { k: "Project", v: "yes" },
      { k: "Heir", v: "yes" },
      { k: "Angel", v: "no" },
      { k: "Jackpot", v: "no" },
    ],
    sections: [
      SHARED_LAUNCH,
      {
        title: "Supply and rain",
        lines: [
          { name: "mint", note: "Issuer. 100% to yourself for launch." },
          { name: "makeitrain", note: "Anyone who signs as sender. Splashes 38.2% of the rain pool. Heir can take a cut." },
          { name: "setmin", note: "Issuer floor for rain size." },
          { name: "inheritance / inheritmemo", note: "Holder names an heir and a share of rain." },
          { name: "choosereward", note: "Holder picks a route, or native." },
          { name: "feeoptout", note: "Holder. Opt out of tax and rain. You cannot turn it back on yourself." },
        ],
      },
      SHARED_CLUB,
    ],
  },
  flexforex: {
    codeName: "flexforex",
    tag: "Advanced & Luck",
    title: "Angel numbers and a jackpot over the rainbow.",
    lead: "The latest flex tech, for3x adds Angel Numbers and jackpots. A Jackpot gives one or a few people all the pending reward (you choose the number of people) so less people get more tokens.",
    intro: "Angel numbers and a jackpot sit next to rain.",
    pitch: "Full stack. Rain, project, heir, plus angel and jackpot pots. Keeper can take a tip.",
    traits: [
      { k: "Rain", v: "yes" },
      { k: "Burn", v: "yes" },
      { k: "Project", v: "yes" },
      { k: "Heir", v: "yes" },
      { k: "Angel", v: "yes" },
      { k: "Jackpot", v: "yes" },
    ],
    sections: [
      SHARED_LAUNCH,
      {
        title: "Supply and rain",
        lines: [
          { name: "mint", note: "Issuer. 100% to yourself for launch." },
          { name: "makeitrain", note: "Anyone who signs as keeper. Splashes the rain pool only. Angel and jackpot stay in their pots." },
          { name: "ratios", note: "Issuer. Share of tax rain that feeds luck pots." },
          { name: "setdist", note: "Issuer once. Winners, cooldown, floors. Locks after success." },
          { name: "setangelnum", note: "Holder picks 0-999." },
          { name: "pullangel / pulljackpot", note: "Anyone. Draws the luck pots." },
          { name: "inheritance / inheritmemo", note: "Holder names an heir and a share of rain." },
          { name: "choosereward", note: "Holder picks a route, or native." },
          { name: "feeoptout", note: "Holder. Opt out of tax and rain. You cannot turn it back on yourself." },
        ],
      },
      SHARED_CLUB,
    ],
  },
};
