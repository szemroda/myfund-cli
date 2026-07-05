---
name: myfund-cli
description: Query myFund portfolio data through the myfund JSON CLI. Use when agents need portfolio summaries, performance, positions, allocation, bounded history, local myFund CLI config, or raw myFund API escape-hatch access without handling API details directly.
metadata:
  openclaw:
    requires:
      bins:
        - myfund
    install:
      - kind: node
        package: myfund-cli
        bins:
          - myfund
    homepage: https://github.com/szemroda/myfund-cli
---

# myFund CLI

- Use `myfund` for myFund portfolio queries instead of calling the myFund API directly.
- Prefer focused commands (`summary`, `performance`, `positions`, `position`, `allocation`, `history`) over `raw-response`.
- Use `raw-response` only when the user explicitly needs the full API payload; it can be large.
- Use `history` only with an explicit metric and bounded range/options when possible.

## Useful Commands

```bash
myfund summary [--portfolio <name>]
myfund performance [--portfolio <name>]
myfund positions [--portfolio <name>] [--sort value|weight|profit|return|daily-change] [--limit <n>] [--type <type>] [--source-portfolio <name>]
myfund position <query> [--portfolio <name>]
myfund allocation --by asset-type|position [--portfolio <name>]
myfund history --metric value|profit|contribution|benchmark|return [--portfolio <name>] [--period 30d|90d|1y|ytd|all] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--interval daily|weekly|monthly] [--max-points <n>]
```

## Config

- Config path: `~/.config/myfund-cli/config.json`.
- API key priority: config `apiKey`, then `MYFUND_API_KEY`.
- Portfolio priority: command `--portfolio`, then config `defaultPortfolio`.
- `myfund config get` never prints the API key.

Useful setup and inspection:

```bash
myfund config get
myfund config path
myfund config set api-key <key>
myfund portfolios list
myfund portfolios add <name> [--description <text>]
myfund portfolios set-default <name>
```
