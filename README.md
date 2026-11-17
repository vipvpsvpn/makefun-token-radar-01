# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/vipvpsvpn/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/vipvpsvpn/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: the pre-token board. It reads the sealed DefiLlama snapshot (758 protocols, snapshot 2026-11-14), covers all 40 watchlist protocols and adds every other rankable pre-token protocol the same rule keeps, and ranks them by an implied value priced from the market itself: each category's multiple is the median market-cap-to-TVL ratio of the snapshot's own listed protocols in that category. Every row carries a farm plan with concrete costs and times, and the dashboard shows the board, a detail view per protocol (model breakdown, market comparables, farm plan) and a live-token view set aside with market caps. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json` (or `--input <file|dir>`), writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser: no network, no build step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3b7861zt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
