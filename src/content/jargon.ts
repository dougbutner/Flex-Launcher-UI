export const JARGON_TITLE = "Words for people";

export const JARGON_ENTRIES: { term: string; def: string }[] = [
  { term: "Hold", def: "you hold the token." },
  { term: "Rain", def: "payout from the tax. You get paid for holding." },
  { term: "Flex", def: "that payout is swapped on Alcor into another token." },
  { term: "Native", def: "the payout stays in this token." },
  { term: "Unflex", def: "switch back to native." },
  { term: "Tax", def: "a slice of each transfer goes into the pool." },
  { term: "Pool", def: "funds waiting to be paid out as rain." },
  { term: "Lock", def: "liquidity frozen for at least 90 days. It can't leave." },
  { term: "Liftoff", def: "launch. The 90-day lock is stamped and transfers unlock." },
  { term: "Quote", def: "the other side of the pool (for GEASY that's EASY)." },
  { term: "Issuer", def: "the account that created the ticker." },
  { term: "Presale / Insider", def: "entry before liftoff, with a supply cap." },
  { term: "Seed", def: "tokens sent to Alcor before launch." },
  { term: "Skim", def: "protocol cut to Dev and Club." },
  { term: "Burn", def: "part of the tax is destroyed." },
  { term: "Project", def: "part of the tax goes to the project account." },
  { term: "Angel / Jackpot", def: "lottery pots on for3x." },
  { term: "Heir", def: "an account that receives a cut of your rain." },
  { term: "Opt-out", def: "turn off tax and reflections for yourself (you can only turn it on)." },
  { term: "Keeper", def: "who signs the payout and may take a tip." },
  { term: "Route", def: "a listed Alcor pool from this token to a reward coin." },
  { term: "Reward", def: "the token you flex your rain into." },
  { term: "Floor", def: "minimum payout size." },
  { term: "Bps", def: "hundredths of a percent (100 = 1%)." },
];

export const NUMBERS_JARGON_TITLE = "By the numbers";

export const NUMBERS_JARGON: { term: string; def: string }[] = [
  {
    term: "LP",
    def: "Liquidity pool. Two tokens paired on Alcor so people can swap. Locked LP is the day-one position. It cannot leave until the lock ends.",
  },
  {
    term: "Market cap",
    def: "The launch pool's mid price, in dollars, times this token's max supply.",
  },
  {
    term: "Pure liquid backing",
    def: "Dollars of the launch quote sitting in the day-one locked pool. The lower arc shows the tokens currently in liquidity pools with this one.",
  },
  {
    term: "Total backing",
    def: "Pure liquid backing plus the quote dollars in every community pool for this token.",
  },
  {
    term: "Community LP",
    def: "Pools added after the locked position. Backing community LP uses the launch quote. Ecosystem community LP uses EASY, WON, GRAMS, MEME, XMD, LOAN, METAL, or an xtoken. Degen community LP is any other pair.",
  },
];
