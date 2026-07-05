# myFund CLI

Agent-first JSON CLI for querying useful myFund portfolio information without loading the full beta API response into context.

## Requirements

- Node.js 20 or newer
- A myFund API key
- A myFund portfolio name

## Install

```bash
npm ci
npm run build
```

After the package is published:

```bash
npm install -g myfund-cli
```

Run locally:

```bash
node dist/cli.js config path
```

During development:

```bash
npm run dev -- summary --portfolio "Portfolio in total"
```

## Configuration

The config file lives at:

```text
~/.config/myfund-cli/config.json
```

API key resolution:

1. Config `apiKey`
2. `MYFUND_API_KEY`

Portfolio resolution for API-backed commands:

1. `--portfolio <name>`
2. Config `defaultPortfolio`

Useful setup commands:

```bash
myfund config set api-key <key>
myfund portfolios add "Portfolio in total" --description "Aggregated portfolio"
myfund portfolios set-default "Portfolio in total"
myfund config get
```

`config get` never prints the API key.

## Commands

```bash
myfund summary [--portfolio <name>]
myfund performance [--portfolio <name>]
myfund positions [--portfolio <name>] [--sort value|weight|profit|return|daily-change] [--limit <n>] [--type <type>] [--source-portfolio <name>]
myfund position <query> [--portfolio <name>]
myfund allocation --by asset-type|position [--portfolio <name>]
myfund history --metric value|profit|contribution|benchmark|return [--portfolio <name>] [--period 30d|90d|1y|ytd|all] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--interval daily|weekly|monthly] [--max-points <n>]
myfund raw-response [--portfolio <name>]
myfund portfolios list
myfund portfolios add <name> [--description <text>]
myfund portfolios remove <name>
myfund portfolios set-default <name>
myfund config get
myfund config path
myfund config set api-key <key>
myfund config unset api-key
myfund config set default-portfolio <name>
myfund config unset default-portfolio
```

All successful output is minified JSON on stdout. Errors are minified JSON on stderr.

## History

History is the token-risky part of the myFund API response. The CLI only returns one requested series and enforces bounded output.

Defaults:

- `--period 30d` when no range is supplied
- `daily` interval for ranges up to 90 days
- `weekly` for `1y`
- `monthly` for `all`
- `--max-points 366`

`raw-response` is the explicit escape hatch for the full API response and can be large.

## Development

```bash
npm run typecheck
npm test
npm run build
npm audit
npm run verify
```

The package supports Node.js 20+. Dependencies intentionally avoid packages that require newer Node versions.

## Skill Install

The repository includes a Codex/skills.sh skill at `skills/myfund-cli`.

Install it from GitHub:

```bash
npx skills add https://github.com/szemroda/myfund-cli --skill myfund-cli
```

Preview the skill prompt without installing:

```bash
npx skills use https://github.com/szemroda/myfund-cli --skill myfund-cli
```
