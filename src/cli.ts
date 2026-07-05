#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { Command, CommanderError } from "commander";
import { getPortfolio } from "./lib/api-client.js";
import { getSafeConfigInfo, readConfig, writeConfig } from "./lib/config.js";
import { MyfundCliError, isMyfundCliError } from "./lib/errors.js";
import { selectHistory, type HistoryOptions } from "./lib/history.js";
import {
  findPosition,
  normalizeAllocation,
  normalizePerformance,
  normalizePositions,
  normalizeSummary,
  type AllocationBy,
  type NormalizedPosition,
  type PositionsOutput,
} from "./lib/normalize.js";
import { resolveApiKey, resolvePortfolio } from "./lib/resolve.js";
import { writeJson } from "./lib/output.js";
import type { ConfigReadResult, MyfundApiResponse, MyfundConfig } from "./types.js";

type ReadConfig = (configPath?: string) => Promise<ConfigReadResult>;
type WriteConfig = (config: MyfundConfig, configPath?: string) => Promise<void>;
type GetPortfolio = (options: { portfolio: string; apiKey: string }) => Promise<MyfundApiResponse>;

export type CliDeps = {
  readConfig?: ReadConfig;
  writeConfig?: WriteConfig;
  getPortfolio?: GetPortfolio;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  env?: Record<string, string | undefined>;
};

type CliContext = {
  readConfig: ReadConfig;
  writeConfig: WriteConfig;
  getPortfolio: GetPortfolio;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  env: Record<string, string | undefined>;
};

type GlobalOptions = {
  config?: string;
};

type PortfolioOptions = GlobalOptions & {
  portfolio?: string;
};

type PositionsOptions = PortfolioOptions & {
  sort?: string;
  type?: string;
  sourcePortfolio?: string;
  limit?: string;
};

type HistoryCommandOptions = PortfolioOptions & {
  metric?: string;
  period?: string;
  from?: string;
  to?: string;
  interval?: string;
  maxPoints?: string;
};

const positionSortKeys = ["value", "weight", "profit", "return", "daily-change"] as const;
type PositionSortKey = (typeof positionSortKeys)[number];
type PositionSortAccessor = (position: NormalizedPosition) => number | undefined;

const allocationKeys = ["asset-type", "position"] as const;
const historyMetrics = ["value", "profit", "contribution", "benchmark", "return"] as const;
const historyPeriods = ["30d", "90d", "1y", "ytd", "all"] as const;
const historyIntervals = ["daily", "weekly", "monthly"] as const;
const missingSortValue = Number.NEGATIVE_INFINITY;
const positionSortAccessors = {
  value: (position) => position.value,
  weight: (position) => position.weightPct,
  profit: (position) => position.profit,
  return: (position) => position.returnPct,
  "daily-change": (position) => position.dailyChangePct,
} satisfies Record<PositionSortKey, PositionSortAccessor>;

export function createProgram(deps: CliDeps = {}): Command {
  const context = makeContext(deps);
  const program = new Command();

  program
    .name("myfund")
    .description("JSON CLI for myfund.pl portfolios")
    .option("--config <path>", "path to config file")
    .exitOverride()
    .configureOutput({
      writeOut: (value) => context.stdout.write(value),
      writeErr: (value) => context.stderr.write(value),
    });

  program
    .command("summary")
    .option("-p, --portfolio <name>", "portfolio name")
    .action(async (options: PortfolioOptions) => {
      const raw = await loadPortfolio(context, commandOptions(program, options));
      writeJson(normalizeSummary(raw), context.stdout);
    });

  program
    .command("performance")
    .option("-p, --portfolio <name>", "portfolio name")
    .action(async (options: PortfolioOptions) => {
      const raw = await loadPortfolio(context, commandOptions(program, options));
      writeJson(normalizePerformance(raw), context.stdout);
    });

  program
    .command("positions")
    .option("-p, --portfolio <name>", "portfolio name")
    .option("--sort <key>", "value|weight|profit|return|daily-change", "weight")
    .option("--type <type>", "position type filter")
    .option("--source-portfolio <name>", "source portfolio filter")
    .option("--limit <count>", "maximum positions")
    .action(async (options: PositionsOptions) => {
      const raw = await loadPortfolio(context, commandOptions(program, options));
      writeJson(selectPositions(raw, options), context.stdout);
    });

  program
    .command("position")
    .argument("<query>", "ticker or position name")
    .option("-p, --portfolio <name>", "portfolio name")
    .action(async (query: string, options: PortfolioOptions) => {
      const raw = await loadPortfolio(context, commandOptions(program, options));
      const result = findPosition(raw, query);

      if (result.kind === "match") {
        const summary = normalizeSummary(raw);
        writeJson(
          {
            ...(summary.portfolio === undefined ? {} : { portfolio: summary.portfolio }),
            position: result.position,
          },
          context.stdout
        );
        return;
      }

      if (result.kind === "ambiguous") {
        throw new MyfundCliError({
          code: "AMBIGUOUS_POSITION",
          message: "Multiple positions match query.",
          details: { query: result.query, candidates: result.candidates },
        });
      }

      throw new MyfundCliError({
        code: "POSITION_NOT_FOUND",
        message: "No position matches query.",
        details: { query: result.query },
      });
    });

  program
    .command("allocation")
    .requiredOption("--by <key>", "asset-type|position")
    .option("-p, --portfolio <name>", "portfolio name")
    .action(async (options: PortfolioOptions & { by?: string }) => {
      const by = parseChoice(options.by, allocationKeys, "--by");
      const raw = await loadPortfolio(context, commandOptions(program, options));
      writeJson(normalizeAllocation(raw, by), context.stdout);
    });

  program
    .command("history")
    .requiredOption("--metric <metric>", "value|profit|contribution|benchmark|return")
    .option("-p, --portfolio <name>", "portfolio name")
    .option("--period <period>", "30d|90d|1y|ytd|all")
    .option("--from <date>", "start date YYYY-MM-DD")
    .option("--to <date>", "end date YYYY-MM-DD")
    .option("--interval <interval>", "daily|weekly|monthly")
    .option("--max-points <count>", "maximum points")
    .action(async (options: HistoryCommandOptions) => {
      const raw = await loadPortfolio(context, commandOptions(program, options));
      writeJson(selectHistory(raw, parseHistoryOptions(options)), context.stdout);
    });

  program
    .command("raw-response")
    .option("-p, --portfolio <name>", "portfolio name")
    .action(async (options: PortfolioOptions) => {
      writeJson(await loadPortfolio(context, commandOptions(program, options)), context.stdout);
    });

  const portfolios = program.command("portfolios");
  portfolios.command("list").action(async () => {
    const config = await context.readConfig(globalConfigPath(program));
    writeJson(
      {
        source: "local-config",
        defaultPortfolio: config.config.defaultPortfolio,
        portfolios: config.config.portfolios,
      },
      context.stdout
    );
  });
  portfolios
    .command("add")
    .argument("<name>", "portfolio name")
    .argument("[description]", "portfolio description")
    .option("--description <description>", "portfolio description")
    .action(async (name: string, descriptionArg: string | undefined, options: { description?: string }) => {
      const config = await context.readConfig(globalConfigPath(program));
      const description = options.description ?? descriptionArg;
      ensurePortfolioAbsent(config.config, name);
      config.config.portfolios.push(description === undefined ? { name } : { name, description });
      await context.writeConfig(config.config, config.path);
      writeJson({ portfolio: name, added: true }, context.stdout);
    });
  portfolios
    .command("remove")
    .argument("<name>", "portfolio name")
    .action(async (name: string) => {
      const config = await context.readConfig(globalConfigPath(program));
      const before = config.config.portfolios.length;
      config.config.portfolios = config.config.portfolios.filter((portfolio) => portfolio.name !== name);
      if (config.config.portfolios.length === before) {
        throw new MyfundCliError({
          code: "PORTFOLIO_NOT_FOUND",
          message: `Portfolio not found: ${name}`,
          details: { portfolio: name },
        });
      }
      if (config.config.defaultPortfolio === name) {
        delete config.config.defaultPortfolio;
      }
      await context.writeConfig(config.config, config.path);
      writeJson({ portfolio: name, removed: true }, context.stdout);
    });
  portfolios
    .command("set-default")
    .argument("<name>", "portfolio name")
    .action(async (name: string) => {
      const config = await context.readConfig(globalConfigPath(program));
      const added = ensurePortfolioListed(config.config, name);
      config.config.defaultPortfolio = name;
      await context.writeConfig(config.config, config.path);
      writeJson({ defaultPortfolio: name, added }, context.stdout);
    });

  const config = program.command("config");
  config.command("get").action(async () => {
    writeJson(getSafeConfigInfo(await context.readConfig(globalConfigPath(program)), context.env), context.stdout);
  });
  config.command("path").action(async () => {
    const result = await context.readConfig(globalConfigPath(program));
    writeJson({ configPath: result.path }, context.stdout);
  });

  const configSet = config.command("set");
  configSet
    .command("api-key")
    .argument("<apiKey>", "myfund.pl API key")
    .action(async (apiKey: string) => {
      const result = await context.readConfig(globalConfigPath(program));
      result.config.apiKey = apiKey;
      await context.writeConfig(result.config, result.path);
      writeJson({ apiKey: { configured: true, source: result.path } }, context.stdout);
    });
  configSet
    .command("default-portfolio")
    .argument("<name>", "portfolio name")
    .action(async (name: string) => {
      const result = await context.readConfig(globalConfigPath(program));
      const added = ensurePortfolioListed(result.config, name);
      result.config.defaultPortfolio = name;
      await context.writeConfig(result.config, result.path);
      writeJson({ defaultPortfolio: name, added }, context.stdout);
    });

  const configUnset = config.command("unset");
  configUnset.command("api-key").action(async () => {
    const result = await context.readConfig(globalConfigPath(program));
    delete result.config.apiKey;
    await context.writeConfig(result.config, result.path);
    writeJson({ apiKey: { configured: false, source: result.path } }, context.stdout);
  });
  configUnset.command("default-portfolio").action(async () => {
    const result = await context.readConfig(globalConfigPath(program));
    delete result.config.defaultPortfolio;
    await context.writeConfig(result.config, result.path);
    writeJson({ defaultPortfolio: null }, context.stdout);
  });

  return program;
}

export async function runCli(argv: string[] = process.argv, deps: CliDeps = {}): Promise<number> {
  const context = makeContext(deps);
  const program = createProgram({
    ...deps,
    stdout: context.stdout,
    stderr: context.stderr,
  });

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    const cliError = toCliError(error);
    writeJson(cliError.toJSON(), context.stderr);
    return cliError.exitCode;
  }
}

function makeContext(deps: CliDeps): CliContext {
  return {
    readConfig: deps.readConfig ?? readConfig,
    writeConfig: deps.writeConfig ?? writeConfig,
    getPortfolio: deps.getPortfolio ?? getPortfolio,
    stdout: deps.stdout ?? process.stdout,
    stderr: deps.stderr ?? process.stderr,
    env: deps.env ?? process.env,
  };
}

async function loadPortfolio(context: CliContext, options: PortfolioOptions): Promise<MyfundApiResponse> {
  const config = await context.readConfig(options.config);
  const auth = resolveApiKey(config.config, context.env);
  const portfolio = resolvePortfolio(config.config, options.portfolio);
  return context.getPortfolio({ apiKey: auth.apiKey, portfolio: portfolio.portfolio });
}

function selectPositions(raw: unknown, options: PositionsOptions): PositionsOutput {
  const sortKey = parseChoice(options.sort ?? "weight", positionSortKeys, "--sort");
  const limit = options.limit === undefined ? undefined : parsePositiveInteger(options.limit, "--limit");
  const normalized = normalizePositions(raw);
  const filtered = normalized.positions
    .filter((position) => options.type === undefined || position.type === options.type)
    .filter(
      (position) =>
        options.sourcePortfolio === undefined || position.sourcePortfolio === options.sourcePortfolio
    )
    .sort((left, right) => sortValue(right, sortKey) - sortValue(left, sortKey));
  const positions = limit === undefined ? filtered : filtered.slice(0, limit);
  return {
    ...(normalized.portfolio === undefined ? {} : { portfolio: normalized.portfolio }),
    count: positions.length,
    positions,
  };
}

function sortValue(position: NormalizedPosition, sortKey: PositionSortKey): number {
  return positionSortAccessors[sortKey](position) ?? missingSortValue;
}

function parseHistoryOptions(options: HistoryCommandOptions): HistoryOptions {
  const parsed = {
    metric: parseChoice(options.metric, historyMetrics, "--metric"),
    ...(options.period === undefined ? {} : { period: parseChoice(options.period, historyPeriods, "--period") }),
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.to === undefined ? {} : { to: options.to }),
    ...(options.interval === undefined
      ? {}
      : { interval: parseChoice(options.interval, historyIntervals, "--interval") }),
    ...(options.maxPoints === undefined ? {} : { maxPoints: parsePositiveInteger(options.maxPoints, "--max-points") }),
  };
  return parsed;
}

function parseChoice<const T extends readonly string[]>(
  value: string | undefined,
  choices: T,
  optionName: string
): T[number] {
  if (value !== undefined && choices.includes(value)) {
    return value;
  }

  throw new MyfundCliError({
    code: "INVALID_ARGUMENTS",
    message: `Invalid ${optionName}. Expected one of: ${choices.join(", ")}.`,
    details: { option: optionName, value, choices: [...choices] },
  });
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new MyfundCliError({
    code: "INVALID_ARGUMENTS",
    message: `${optionName} must be a positive integer.`,
    details: { option: optionName, value },
  });
}

function commandOptions<T extends GlobalOptions>(program: Command, options: T): T {
  return {
    ...program.opts<GlobalOptions>(),
    ...options,
  };
}

function globalConfigPath(program: Command): string | undefined {
  return program.opts<GlobalOptions>().config;
}

function ensurePortfolioAbsent(config: MyfundConfig, name: string): void {
  if (!config.portfolios.some((portfolio) => portfolio.name === name)) {
    return;
  }

  throw new MyfundCliError({
    code: "INVALID_ARGUMENTS",
    message: `Portfolio already exists: ${name}`,
    details: { portfolio: name },
  });
}

function ensurePortfolioListed(config: MyfundConfig, name: string): boolean {
  if (config.portfolios.some((portfolio) => portfolio.name === name)) {
    return false;
  }

  config.portfolios.push({ name });
  return true;
}

function toCliError(error: unknown): MyfundCliError {
  if (isMyfundCliError(error)) {
    return error;
  }

  if (error instanceof CommanderError) {
    return new MyfundCliError({
      code: "INVALID_ARGUMENTS",
      message: error.message,
      exitCode: error.exitCode === 0 ? 2 : error.exitCode,
    });
  }

  return new MyfundCliError({
    code: "CONFIG_ERROR",
    message: error instanceof Error ? error.message : "Unexpected CLI error",
    cause: error,
    exitCode: 1,
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}
