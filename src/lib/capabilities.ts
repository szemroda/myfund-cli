type OptionInfo = {
  name: string;
  values?: string[];
  required?: boolean;
  default?: string | number;
  description: string;
};

type CommandInfo = {
  command: string;
  purpose: string;
  useWhen: string;
  requiresApi: boolean;
  output: string;
  options?: OptionInfo[];
  examples: string[];
  notes?: string[];
};

export type CapabilitiesOutput = {
  cli: "myfund";
  outputFormat: "minified-json";
  errorFormat: "minified-json-stderr";
  config: {
    path: string;
    apiKeyPriority: string[];
    portfolioPriority: string[];
  };
  commandSelection: CommandInfo[];
};

export function getCapabilities(): CapabilitiesOutput {
  return {
    cli: "myfund",
    outputFormat: "minified-json",
    errorFormat: "minified-json-stderr",
    config: {
      path: "~/.config/myfund-cli/config.json",
      apiKeyPriority: ["config apiKey", "MYFUND_API_KEY"],
      portfolioPriority: ["--portfolio", "config defaultPortfolio"],
    },
    commandSelection: [
      {
        command: "summary",
        purpose: "Return the current portfolio snapshot and cheap aggregate period returns.",
        useWhen: "Use for a compact overview: total value, profit, return, daily change, benchmark, and position count.",
        requiresApi: true,
        output: "single summary object",
        options: [portfolioOption()],
        examples: ['myfund summary --portfolio "Wszystkie"'],
      },
      {
        command: "performance",
        purpose: "Return only aggregate period returns from the portfolio summary.",
        useWhen: "Use when the user asks about returns over periods such as 1w, 1m, ytd, or 1y.",
        requiresApi: true,
        output: "portfolio plus periodReturns object",
        options: [portfolioOption()],
        examples: ['myfund performance --portfolio "Wszystkie"'],
      },
      {
        command: "positions",
        purpose: "Return normalized current positions with optional sorting, limiting, and filtering.",
        useWhen: "Use for holdings lists, largest positions, best/worst profit, type filters, or source-portfolio filters.",
        requiresApi: true,
        output: "positions array with count",
        options: [
          portfolioOption(),
          {
            name: "--sort",
            values: ["value", "weight", "profit", "return", "daily-change"],
            default: "weight",
            description: "Sort positions descending by the selected metric.",
          },
          { name: "--limit", description: "Return at most this many positions." },
          { name: "--type", description: "Filter by API asset type label." },
          { name: "--source-portfolio", description: "Filter by API portfelOrg/source portfolio label." },
        ],
        examples: [
          'myfund positions --portfolio "Wszystkie" --sort value --limit 5',
          'myfund positions --portfolio "Wszystkie" --source-portfolio "Główne"',
        ],
      },
      {
        command: "position",
        purpose: "Find one position by ticker or name query.",
        useWhen: "Use when the user asks about a specific holding, ticker, asset, or position.",
        requiresApi: true,
        output: "portfolio plus one position object, or POSITION_NOT_FOUND/AMBIGUOUS_POSITION",
        options: [
          { name: "<query>", required: true, description: "Ticker or case-insensitive name substring." },
          portfolioOption(),
        ],
        examples: ['myfund position BTC --portfolio "Crypto"'],
        notes: ["Search order: exact ticker, ticker substring, then name substring."],
      },
      {
        command: "allocation",
        purpose: "Return API-provided allocation aggregates.",
        useWhen: "Use for allocation breakdowns by asset type or by position.",
        requiresApi: true,
        output: "allocation items",
        options: [
          {
            name: "--by",
            values: ["asset-type", "position"],
            required: true,
            description: "Select allocation dimension.",
          },
          portfolioOption(),
        ],
        examples: ['myfund allocation --portfolio "Wszystkie" --by asset-type'],
      },
      {
        command: "history",
        purpose: "Return one bounded time series.",
        useWhen: "Use for historical value, profit, contribution, benchmark, or return over a bounded date range.",
        requiresApi: true,
        output: "one metric series with points",
        options: [
          {
            name: "--metric",
            values: ["value", "profit", "contribution", "benchmark", "return"],
            required: true,
            description: "Select the only returned time series.",
          },
          portfolioOption(),
          { name: "--period", values: ["30d", "90d", "1y", "ytd", "all"], default: "30d", description: "Relative date range." },
          { name: "--from", description: "Start date in YYYY-MM-DD format." },
          { name: "--to", description: "End date in YYYY-MM-DD format." },
          { name: "--interval", values: ["daily", "weekly", "monthly"], description: "Downsample interval." },
          { name: "--max-points", default: 366, description: "Maximum final points after filtering/downsampling." },
        ],
        examples: ['myfund history --portfolio "Wszystkie" --metric value --period 30d'],
        notes: ["Do not combine --period with --from/--to.", "Use raw-response only if unrelated time series are needed."],
      },
      {
        command: "raw-response",
        purpose: "Return the full myFund API response.",
        useWhen: "Use only as an explicit escape hatch when focused commands cannot answer the request.",
        requiresApi: true,
        output: "full raw API payload",
        options: [portfolioOption()],
        examples: ['myfund raw-response --portfolio "Wszystkie"'],
        notes: ["May be large because it includes all time series fields."],
      },
      {
        command: "config",
        purpose: "Inspect or mutate local CLI configuration without exposing secrets.",
        useWhen: "Use for setup, API key/default portfolio state, and config file path.",
        requiresApi: false,
        output: "config metadata or mutation result",
        examples: ["myfund config get", "myfund config path", "myfund config set default-portfolio <name>"],
        notes: ["config get never prints the API key."],
      },
      {
        command: "portfolios",
        purpose: "Manage local known portfolio names and default portfolio.",
        useWhen: "Use for listing, adding, removing, or setting local portfolio names.",
        requiresApi: false,
        output: "local portfolio config state or mutation result",
        examples: ["myfund portfolios list", "myfund portfolios add <name>", "myfund portfolios set-default <name>"],
      },
      {
        command: "capabilities",
        purpose: "Return this agent-facing command catalog.",
        useWhen: "Use first when unsure which command answers the user's portfolio question.",
        requiresApi: false,
        output: "capabilities object",
        examples: ["myfund capabilities"],
      },
    ],
  };
}

function portfolioOption(): OptionInfo {
  return {
    name: "--portfolio",
    description: "Real myFund portfolio name sent to the API. Falls back to config defaultPortfolio.",
  };
}
