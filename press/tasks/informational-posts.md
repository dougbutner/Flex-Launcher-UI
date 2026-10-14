# Task: informational posts, then wait

You are writing the public information set for Flex as it is deployed at https://flex.forex.

Read and follow, in this order:

1. `.cursor/skills/press-release/SKILL.md`
2. `~/.cursor/skills/salesman/SKILL.md` and `~/.cursor/skills/salesman/headline-starters.md`
3. `.cursor/skills/user-facing-copy/SKILL.md`

Open the live site and write from the words on the screen. If a block is not there, do not invent the post. Add one line to `press/posts/skipped.md` naming the page and what was missing.

## Phase 1. Write the posts

One file per item, under `press/posts/`. Each file is the post a person could read. No agent notes in the file.

Each post has:

- A headline that names the reader or the benefit
- An opening the reader can picture (what they have after they use this)
- The specifics already printed on that screen
- The benefit taken through to money, time, or status
- One ask: the exact page to open
- **Needed from you** only when a number, proof, or promise is not on the site

Do not render diagrams. Do not build a press package. Do not write a set of alternate headlines. That waits for phase 2.

Skip `/admin` and `/preview`.

### Home, https://flex.forex/

- `home-pure-liquid.md` Your Token is Pure Liquid
- `home-sane-economics.md` Sane economics
- `home-pure-liquid-mining.md` Pure Liquid Mining
- `home-locked-pools.md` Locked Pools
- `home-diamond-hands.md` Diamond Hands Get Rained On
- `home-rewards-flex.md` Rewards Flex
- `home-old-tokens.md` Old tokens with a new face
- `home-house-cut.md` House Cut
- `home-choose-your-tech.md` Choose Your Tech
- `home-liftoff.md` Prepare for Liftoff

Use the sentences on the page. If a figure on the page does not match another source, keep the page's sentence in the post and list the clash under **Needed from you**. Do not "correct" the site.

### Launch, https://flex.forex/launch

- `launch-token.md` Token
- `launch-flexonomics.md` Flexonomics
- `launch-paired-token.md` Paired token
- `launch-range-lock.md` Price Range & lock
- `launch-insiders.md` Insiders
- `launch-review.md` Final Review
- `launch-send.md` Send It

Say what the person fills in and what happens after they send it. Do not name contract actions.

### Dev Tools, https://flex.forex/manager

- `dev-metadata.md` Metadata
- `dev-tax.md` Adjust Tax
- `dev-presale.md` Presale

If the page asks for a wallet before the tools show, describe the door the visitor hits, and put the hidden tools in `skipped.md`.

### Events, https://flex.forex/events

- `events-calendar.md` the month calendar
- `events-club-windows.md` Open club windows
- `events-in-flight.md` In flight
- `events-history.md` Launch History

### Tokens, https://flex.forex/leaderboard

- `tokens-board.md` the board a visitor can switch: Locked liq, Volume, Cap, Change, Holders, and the change windows on the screen

### Make it Rain, https://flex.forex/reflections

- `rain.md` what a connected person can call in, including angel and jackpot only where those controls are on the screen

### My Bags, https://flex.forex/portfolio

- `bags.md` what a holder sees after they connect

### A token page

Open one token that is already public on the Tokens board. Use its real symbol in the filename, `token-<symbol>.md`, and cover only the blocks that render:

- the numbers on the page
- choosing how payouts arrive
- leaving the transfer fee
- naming who receives after you
- an angel number, if that control is there
- issuer tools a visitor can see without being the issuer

### Insiders room

If a token links to a club room, write `club-<symbol>.md` from that room: who can speak, what the gold mark means on that screen, and how someone joins.

## Phase 2. Stop and listen

After the files are saved, reply with the list of posts and anything in `skipped.md`. Then stop.

Do not build a press release in this task.

On a later message that says **create a press release** (also "make a press release" or "press package"), follow `.cursor/skills/press-release/SKILL.md` and build the package:

- `press/releases/<slug>/release.md` full story, one buyer, one ask
- `headlines.md` at least eight headlines from the 22 starters, two marked as the pair to test first
- `short.md` one screen for a feed
- `captions.md` one benefit line per image
- `images/` from `python3 press/diagram.py` on the landing-page background (`press/style.txt` is `landing`)
- `screenshots/` of the live pages the words describe

Do not invent proof the posts already marked as missing.
