---
name: press-release
description: >-
  Writes Flex press packages and informational posts for the deployed site.
  Generates plates on the landing-page background with press/diagram.py and the
  flex.report make-hero tools, saves screenshots, and applies the salesman
  skill to headlines and body copy. Use when the user says create a press
  release, asks for a press package, press images, or informational posts
  about Flex.
---

# Press release

Public copy for Flex as deployed at https://flex.forex. Plates sit on the home-page background. Words come from the salesman skill.

## Before any public words

Read and follow:

- `~/.cursor/skills/salesman/SKILL.md`
- `~/.cursor/skills/salesman/headline-starters.md`
- `.cursor/skills/user-facing-copy/SKILL.md`

Apply salesman on the first draft. Fail the draft if its verification list fails. Rewrite before showing it.

Public sentences say what a person can do and what they get (money, time, or status). They do not name actions, tables, bps, scope, or how a screen was filled. RAM may be named when the person pays it.

No em dash or en dash. Use a comma, a period, a colon, or a hyphen.

## Claims

Use sentences already on https://flex.forex, the home page, and flex.report pages that state the same fact. Do not invent ratings, user counts, TVL, guarantees, prices, savings percents, or scarcity.

If two sources disagree on a number, do not pick one. List it under **Needed from you**.

## Background

`press/style.txt` is `landing`. Do not invent a second style.

The plate background is the home page background, not a redraw:

- void `#050705`
- the three `.home-glow` ellipses from `src/pages/Home.css` (gold `#d4af37` at 28%, light `#ffe566` at 22%, green `#22c55e` at 14%)
- `public/tetra/pattern-field.svg` tiled at 208 by 180, layer opacity 0.28

`press/landing.html` is that CSS. `python3 press/diagram.py background` writes `press/landing-bg.png`.

Type, soft panels, and arrows come from the flex.report tool:

`/Users/fresh/Dropbox/htdocs/flex.report/.cursor/skills/make-hero-image/scripts/make_hero.py`

Read that skill before changing a plate. Use its Bebas and Open Sans helpers. Do not redraw the mesh. Do not go back to the twelve sample styles.

## Diagrams

One motion per image. A holo coin (`public/tokens/holoxtokens`) is the thing moving. A flat xtoken (`public/tokens/xtokens`) is the coin a person already knows. Crop coins round.

```bash
python3 press/diagram.py background
python3 press/diagram.py angel --out press/samples/angel-numbers.png --caption "Taken from reflections. Not an extra tax."
python3 press/package.py SLUG --caption "Taken from reflections. Not an extra tax."
```

The angel plate is the current example: pick 0 to 999, the draw falls, a match gets paid. That share comes out of reflections. It is not an extra tax.

`package.py` makes folders and the angel plate. It does not write the release.

## Screenshots

Open the live routes the release talks about. Save one desktop PNG per route into `screenshots/`. Shoot what a logged-out visitor sees after the page has finished loading. Do not save a skeleton.

Do not put `/admin` or `/preview` in a public package.

## When the user says "create a press release"

Also treat "make a press release" and "press package" as this phrase.

Build `press/releases/<slug>/`:

- `release.md`: one buyer, one reason, the offer, one Life-Force 8, the end result, the USP, the full relevant story, then the ask
- `headlines.md`: at least 8 headlines from the 22 starters, using only facts you can point to. Mark two as the pair to test first. Do not declare a winner
- `short.md`: one screen, same benefit, for a feed
- `captions.md`: one line per image
- `images/`: plates for the motions the story uses
- `screenshots/`: the live pages those words describe

The ask names the URL and the one next step. No guarantee you cannot point to on the site.

End `release.md` with **Needed from you** when a proof, number, deadline, or price is missing. Do not fill those gaps.

Lead the reply with the release. Keep the tactic audit to a short list: what landed, what is blocked on a missing fact.

## Informational posts

A post teaches one feature. It is not a release. Save it under `press/posts/`. Same claim rules, shorter story, one headline, one ask. No headline set, no image package.

The standing task prompt is `press/tasks/informational-posts.md`. Do not run it unless the user asks. When that task is running, write the posts, list the files, and stop. Wait for the phrase above before building a package.
