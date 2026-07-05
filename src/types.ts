export type PortfolioConfig = {
  name: string;
  description?: string | undefined;
};

export type MyfundConfig = {
  apiKey?: string | undefined;
  defaultPortfolio?: string | undefined;
  portfolios: PortfolioConfig[];
} & Record<string, unknown>;

export type ConfigReadResult = {
  path: string;
  exists: boolean;
  config: MyfundConfig;
};

export type SafeConfigInfo = {
  configPath: string;
  apiKeyConfigured: boolean;
  apiKeySource: "config" | "env" | null;
  envApiKeyPresent?: boolean;
  defaultPortfolio: string | null;
  portfolios: PortfolioConfig[];
};

export type ResolvedAuth = {
  apiKey: string;
  source: "config" | "env";
};

export type ResolvedPortfolio = {
  portfolio: string;
  source: "explicit" | "config";
};

export type MyfundApiStatus = {
  code?: number | string | undefined;
  message?: string | undefined;
  text?: string | undefined;
};

export type MyfundApiResponse = Record<string, unknown> & {
  status?: MyfundApiStatus | undefined;
};
