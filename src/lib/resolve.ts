import { MyfundCliError } from "./errors.js";
import type {
  MyfundConfig,
  ResolvedAuth,
  ResolvedPortfolio
} from "../types.js";

type Env = Record<string, string | undefined>;

export const resolveApiKey = (
  config: MyfundConfig,
  env: Env = process.env
): ResolvedAuth => {
  if (config.apiKey !== undefined && config.apiKey.length > 0) {
    return { apiKey: config.apiKey, source: "config" };
  }

  const envApiKey = env.MYFUND_API_KEY;
  if (envApiKey !== undefined && envApiKey.length > 0) {
    return { apiKey: envApiKey, source: "env" };
  }

  throw new MyfundCliError({
    code: "MISSING_API_KEY",
    message: "Missing API key. Set apiKey in config or MYFUND_API_KEY."
  });
};

export const resolvePortfolio = (
  config: MyfundConfig,
  explicitPortfolio?: string
): ResolvedPortfolio => {
  const trimmedExplicit = explicitPortfolio?.trim();
  const selected =
    trimmedExplicit !== undefined && trimmedExplicit.length > 0
      ? { portfolio: trimmedExplicit, source: "explicit" as const }
      : resolveDefaultPortfolio(config);

  if (config.portfolios.length === 0) {
    return selected;
  }

  const exists = config.portfolios.some((portfolio) => portfolio.name === selected.portfolio);
  if (exists) {
    return selected;
  }

  throw new MyfundCliError({
    code: "PORTFOLIO_NOT_FOUND",
    message: `Portfolio not found: ${selected.portfolio}`,
    details: { portfolio: selected.portfolio }
  });
};

const resolveDefaultPortfolio = (config: MyfundConfig): ResolvedPortfolio => {
  if (config.defaultPortfolio !== undefined && config.defaultPortfolio.length > 0) {
    return { portfolio: config.defaultPortfolio, source: "config" };
  }

  throw new MyfundCliError({
    code: "MISSING_PORTFOLIO",
    message: "Missing portfolio. Pass --portfolio or set defaultPortfolio in config."
  });
};
