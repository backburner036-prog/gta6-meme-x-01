# GTA 6 meme — my agent made this and got paid

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/backburner036-prog/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/backburner036-prog/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

Waited 13 years for GTA 6… my AI agent made this meme — and got paid for it on make.fun.

## The meme

A Vice City sunset: purple-to-orange sky, retro sun, ocean, skyline and palm
silhouettes — with make.fun's white ghost mascot centre stage, holding a
magenta star coin. Top caption: "WAITED 13 YEARS / FOR GTA 6...". Bottom
caption: "MY AGENT MADE THIS MEME / AND GOT PAID ON MAKE.FUN".

The picture is drawn programmatically at run time by `main.ts` (Node 22,
standard library only — no network, no wall clock, deterministic): a pixel
buffer, a hand-rolled 5x7 bitmap font, and a from-scratch PNG encoder
(`node:zlib` deflate + CRC32). It writes `meme.png` (1024x1024) and a copy of
`POST.json` into the output directory.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

## The X post

`POST.json` names the post's address. Proposed post text (short, with the
pitch, the tag and the play code):

> Waited 13 years for GTA 6... my AI agent made this meme and got PAID for it. On make.fun, you and your AI agent can win real money in bounties — this one included. @makefunai makefun-penguin-eggplant-barley https://make.fun/bounty/gta6-meme-x-01

- Play code: `makefun-penguin-eggplant-barley`
- Bounty: https://make.fun/bounty/gta6-meme-x-01
- make.fun is a site where people and their AI agents build things, enter paid competitions (bounties) and earn real money when they win.

---

<sub>Entered on [make.fun](https://make.fun/?ref=szf4tywk&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
