import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { MyfundCliError } from "./errors.js";
import type { ConfigReadResult, MyfundConfig, SafeConfigInfo } from "../types.js";

type Env = Record<string, string | undefined>;

const portfolioSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1).optional()
  })
  .strict();

const configSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    defaultPortfolio: z.string().min(1).optional(),
    portfolios: z.array(portfolioSchema).default([])
  })
  .passthrough();

export const getDefaultConfigPath = (): string => {
  return path.join(os.homedir(), ".config", "myfund-cli", "config.json");
};

export const parseConfig = (input: unknown, source = "config"): MyfundConfig => {
  const result = configSchema.safeParse(input);

  if (!result.success) {
    throw new MyfundCliError({
      code: "CONFIG_ERROR",
      message: `Invalid ${source}`,
      details: { issues: result.error.issues }
    });
  }

  return result.data;
};

export const readConfig = async (
  configPath = getDefaultConfigPath()
): Promise<ConfigReadResult> => {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    return {
      path: configPath,
      exists: true,
      config: parseConfig(parsed, configPath)
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        path: configPath,
        exists: false,
        config: parseConfig({}, configPath)
      };
    }

    if (error instanceof SyntaxError) {
      throw new MyfundCliError({
        code: "CONFIG_ERROR",
        message: `Invalid JSON in ${configPath}`,
        cause: error
      });
    }

    if (error instanceof MyfundCliError) {
      throw error;
    }

    throw new MyfundCliError({
      code: "CONFIG_ERROR",
      message: `Unable to read config from ${configPath}`,
      cause: error
    });
  }
};

export const writeConfig = async (
  config: MyfundConfig,
  configPath = getDefaultConfigPath()
): Promise<void> => {
  const normalized = parseConfig(config, configPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
};

export const getSafeConfigInfo = (
  result: ConfigReadResult,
  env: Env = process.env
): SafeConfigInfo => {
  const configApiKeyPresent = typeof result.config.apiKey === "string";
  const envApiKeyPresent = typeof env.MYFUND_API_KEY === "string" && env.MYFUND_API_KEY.length > 0;
  const apiKeySource = configApiKeyPresent ? "config" : envApiKeyPresent ? "env" : null;

  return {
    configPath: result.path,
    apiKeyConfigured: apiKeySource !== null,
    apiKeySource,
    ...(envApiKeyPresent ? { envApiKeyPresent: true } : {}),
    defaultPortfolio: result.config.defaultPortfolio ?? null,
    portfolios: result.config.portfolios
  };
};

const isNotFoundError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
};
