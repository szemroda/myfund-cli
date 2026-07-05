# myFund CLI

Agent-friendly JSON CLI for querying myFund portfolio data without pushing the full beta API payload into your context window.

`myfund` calls the myfund.pl API, normalizes the parts agents usually need, and writes compact JSON that is easy to parse from scripts, skills, and automation.

## Why Prefer the CLI Over the Official API?

The official myFund API is the source of truth, but its beta response can be too broad for agent workflows. Pulling the full payload into context by default wastes tokens, makes parsing more fragile, and exposes data the current task may not need.

This CLI keeps the workflow agentic:

- Token efficiency: focused commands return only the requested slice of portfolio data.
- Progressive disclosure: agents can start with `summary`, then drill into `positions`, `position`, `allocation`, or `history` only when needed.
- Bounded history: `history` returns one metric at a time and enforces range, interval, and point limits.

## Requirements

- Node.js 20 or newer
- A myFund API key from [myFund account settings](https://myfund.pl/index.php?raport=ustawieniaKona)
- A myFund portfolio name

## Installation

Install from npm after the package is published:

```bash
npm install -g myfund-cli
```

## Codex Skill

This repository includes a Codex skill at `skills/myfund-cli` for agents that should prefer the CLI over direct myFund API calls.

```bash
npx skills add https://github.com/szemroda/myfund-cli --skill myfund-cli
```

## Quick Start

Configure an API key and a default portfolio:

```bash
myfund config set api-key <key>
myfund portfolios add "Portfolio in total" --description "Aggregated portfolio"
myfund portfolios set-default "Portfolio in total"
```

Query the default portfolio:

```bash
myfund summary
myfund positions --sort value --limit 10
myfund history --metric value --period 90d --interval weekly
```

Query a portfolio without storing it as the default:

```bash
myfund summary --portfolio "Long-term portfolio"
```

## Configuration

Default config path:

```text
~/.config/myfund-cli/config.json
```

Use a different config file for any command:

```bash
myfund --config ./myfund.config.json summary
```

API key resolution order:

1. Config `apiKey`
2. `MYFUND_API_KEY`

Portfolio resolution order for API-backed commands:

1. `--portfolio <name>`
2. Config `defaultPortfolio`

Useful config commands:

```bash
myfund config get
myfund config path
myfund config set api-key <key>
myfund config unset api-key
myfund config set default-portfolio <name>
myfund config unset default-portfolio
```

`myfund config get` reports whether an API key is configured, but never prints the key.

## Commands

### Portfolio Data

```bash
myfund summary [--portfolio <name>]
myfund performance [--portfolio <name>]
myfund positions [--portfolio <name>] [--sort value|weight|profit|return|daily-change] [--limit <n>] [--type <type>] [--source-portfolio <name>]
myfund position <query> [--portfolio <name>]
myfund allocation --by asset-type|position [--portfolio <name>]
myfund history --metric value|profit|contribution|benchmark|return [--portfolio <name>] [--period 30d|90d|1y|ytd|all] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--interval daily|weekly|monthly] [--max-points <n>]
myfund raw-response [--portfolio <name>]
```

### Portfolio Registry

The portfolio registry is local metadata stored in the config file. It does not create, rename, or delete portfolios in myFund.

```bash
myfund portfolios list
myfund portfolios add <name> [description]
myfund portfolios add <name> --description <text>
myfund portfolios remove <name>
myfund portfolios set-default <name>
```

### Config

```bash
myfund config get
myfund config path
myfund config set api-key <key>
myfund config unset api-key
myfund config set default-portfolio <name>
myfund config unset default-portfolio
```

## Output Contract

Successful commands write minified JSON to stdout.

Example success shape:

```json
{"portfolio":"Portfolio in total","value":12345.67,"periodReturns":{"1m":1.23,"ytd":4.56}}
```

Errors write minified JSON to stderr and return a non-zero exit code.

Example error shape:

```json
{"error":{"code":"MISSING_PORTFOLIO","message":"Missing portfolio. Pass --portfolio or configure defaultPortfolio."}}
```

Common error codes include:

- `MISSING_API_KEY`
- `MISSING_PORTFOLIO`
- `PORTFOLIO_NOT_FOUND`
- `MYFUND_API_ERROR`
- `NETWORK_ERROR`
- `INVALID_ARGUMENTS`
- `POSITION_NOT_FOUND`
- `AMBIGUOUS_POSITION`
- `TOO_MANY_POINTS`
- `CONFIG_ERROR`

## History Queries

History is the largest and riskiest part of the myFund API response for agent workflows. The `history` command returns only one requested metric and enforces bounded output.

Supported metrics:

- `value`
- `profit`
- `contribution`
- `benchmark`
- `return`

Defaults:

- `--period 30d` when no range is supplied
- `daily` interval for ranges up to 90 days
- `weekly` interval for `--period 1y`
- `monthly` interval for `--period all` and ranges longer than 90 days
- `--max-points 366`

Use either `--period` or `--from`/`--to`, not both.

Examples:

```bash
myfund history --metric value --period 30d
myfund history --metric return --period ytd
myfund history --metric profit --from 2026-01-01 --to 2026-06-30 --interval monthly
```

Use `raw-response` only when you explicitly need the complete myFund API payload:

```bash
myfund raw-response --portfolio "Portfolio in total"
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm audit
npm run verify
```

`npm run verify` runs typecheck, tests, build, and audit.

The package targets Node.js 20+. Dependencies intentionally avoid packages that require newer Node versions.
