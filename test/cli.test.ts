import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isMainModule, runCli, type CliDeps } from "../src/cli.js";
import type { ConfigReadResult, MyfundApiResponse, MyfundConfig } from "../src/types.js";

class MemoryWritable extends Writable {
  chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    callback();
  }

  text(): string {
    return this.chunks.join("");
  }
}

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
  written: MyfundConfig[];
  apiCalls: Array<{ portfolio: string; apiKey: string }>;
};

const rawPortfolio: MyfundApiResponse = {
  portfel: {
    nazwa: "Main",
    waluta: "PLN",
    wartosc: "1000",
    zysk: "100",
    zmiana: "10",
    zmianaDzienna: "1",
    tickersCount: "3",
  },
  tickers: {
    "1": {
      tickerClear: "AAA",
      nazwa: "Alpha",
      typ: "ETF",
      portfelOrg: "core",
      wartosc: "500",
      udzial: "50",
      zysk: "25",
      zmiana: "5",
      zmianaDzienna: "0.5",
    },
    "2": {
      tickerClear: "BBB",
      nazwa: "Beta",
      typ: "Stock",
      portfelOrg: "satellite",
      wartosc: "300",
      udzial: "30",
      zysk: "50",
      zmiana: "20",
      zmianaDzienna: "2",
    },
    "3": {
      tickerClear: "AAC",
      nazwa: "Alpha Credit",
      typ: "Bond",
      portfelOrg: "core",
      wartosc: "200",
      udzial: "20",
      zysk: "-5",
      zmiana: "-2",
      zmianaDzienna: "-0.2",
    },
  },
  struktura: {
    ETF: "500",
    Stock: "300",
  },
  wartoscWCzasie: {
    "2026-07-04": "900",
    "2026-07-05": "1000",
  },
};

const baseConfig: MyfundConfig = {
  apiKey: "secret",
  defaultPortfolio: "main",
  portfolios: [{ name: "main" }, { name: "taxable" }],
};

async function runCommand(
  args: string[],
  overrides: {
    config?: MyfundConfig;
    apiResponse?: MyfundApiResponse;
    env?: Record<string, string | undefined>;
  } = {}
): Promise<RunResult> {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const written: MyfundConfig[] = [];
  const apiCalls: Array<{ portfolio: string; apiKey: string }> = [];
  const config = structuredClone(overrides.config ?? baseConfig);
  const deps: CliDeps = {
    stdout,
    stderr,
    env: overrides.env ?? {},
    readConfig: async (configPath?: string): Promise<ConfigReadResult> => ({
      path: configPath ?? "/virtual/config.json",
      exists: true,
      config,
    }),
    writeConfig: async (nextConfig: MyfundConfig): Promise<void> => {
      written.push(structuredClone(nextConfig));
    },
    getPortfolio: async (options): Promise<MyfundApiResponse> => {
      apiCalls.push(options);
      return overrides.apiResponse ?? rawPortfolio;
    },
  };

  const code = await runCli(["node", "myfund", ...args], deps);
  return { code, stdout: stdout.text(), stderr: stderr.text(), written, apiCalls };
}

function parseLine(value: string): unknown {
  return JSON.parse(value.trim());
}

describe("cli", () => {
  it("recognizes the entry module through an installed package symlink", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "myfund-cli-"));
    const realEntry = path.join(directory, "cli.js");
    const linkedEntry = path.join(directory, "installed-cli.js");

    try {
      await writeFile(realEntry, "");
      await symlink(realEntry, linkedEntry);

      expect(isMainModule(pathToFileURL(realEntry).href, linkedEntry)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("prints agent-facing capabilities without config or API access", async () => {
    const result = await runCommand(["capabilities"]);
    const capabilities = parseLine(result.stdout);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.apiCalls).toEqual([]);
    expect(capabilities).toMatchObject({
      cli: "myfund",
      outputFormat: "minified-json",
      commandSelection: expect.arrayContaining([
        expect.objectContaining({
          command: "summary",
          useWhen: expect.stringContaining("compact overview"),
          requiresApi: true,
        }),
        expect.objectContaining({
          command: "capabilities",
          requiresApi: false,
        }),
      ]),
    });
  });

  it("prints normalized summary as minified JSON and resolves auth/portfolio", async () => {
    const result = await runCommand(["summary"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      '{"periodReturns":{},"portfolio":"Main","currency":"PLN","value":1000,"profit":100,"returnPct":10,"dailyChangePct":1,"positionsCount":3}\n'
    );
    expect(result.apiCalls).toEqual([{ portfolio: "main", apiKey: "secret" }]);
  });

  it("sorts and limits positions after filters", async () => {
    const result = await runCommand([
      "positions",
      "--sort",
      "profit",
      "--type",
      "Stock",
      "--limit",
      "1",
    ]);

    expect(result.code).toBe(0);
    expect(parseLine(result.stdout)).toEqual({
      portfolio: "Main",
      count: 1,
      positions: [
        {
          ticker: "BBB",
          name: "Beta",
          sourcePortfolio: "satellite",
          type: "Stock",
          value: 300,
          weightPct: 30,
          returnPct: 20,
          profit: 50,
          dailyChangePct: 2,
        },
      ],
    });
  });

  it("returns documented JSON error for ambiguous position queries", async () => {
    const result = await runCommand(["position", "AA"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(parseLine(result.stderr)).toEqual({
      error: {
        code: "AMBIGUOUS_POSITION",
        message: "Multiple positions match query.",
        query: "AA",
        candidates: [
          { ticker: "AAA", name: "Alpha" },
          { ticker: "AAC", name: "Alpha Credit" },
        ],
      },
    });
  });

  it("wraps a single position with portfolio context", async () => {
    const result = await runCommand(["position", "BBB"]);

    expect(result.code).toBe(0);
    expect(parseLine(result.stdout)).toEqual({
      portfolio: "Main",
      position: {
        ticker: "BBB",
        name: "Beta",
        sourcePortfolio: "satellite",
        type: "Stock",
        value: 300,
        weightPct: 30,
        returnPct: 20,
        profit: 50,
        dailyChangePct: 2,
      },
    });
  });

  it("validates positive integer limits as JSON errors", async () => {
    const result = await runCommand(["positions", "--limit", "0"]);

    expect(result.code).toBe(2);
    expect(parseLine(result.stderr)).toEqual({
      error: {
        code: "INVALID_ARGUMENTS",
        message: "--limit must be a positive integer.",
        option: "--limit",
        value: "0",
      },
    });
  });

  it("supports history portfolio option and history selectors", async () => {
    const result = await runCommand([
      "history",
      "--portfolio",
      "taxable",
      "--metric",
      "value",
      "--period",
      "30d",
      "--max-points",
      "5",
    ]);

    expect(result.code).toBe(0);
    expect(result.apiCalls).toEqual([{ portfolio: "taxable", apiKey: "secret" }]);
    expect(parseLine(result.stdout)).toEqual({
      portfolio: "Main",
      metric: "value",
      interval: "daily",
      from: "2026-06-06",
      to: "2026-07-05",
      points: [
        { date: "2026-07-04", value: 900 },
        { date: "2026-07-05", value: 1000 },
      ],
    });
  });

  it("does not expose API key secret in config get", async () => {
    const result = await runCommand(["config", "get"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("secret");
    expect(parseLine(result.stdout)).toEqual({
      configPath: "/virtual/config.json",
      apiKeyConfigured: true,
      apiKeySource: "config",
      defaultPortfolio: "main",
      portfolios: [{ name: "main" }, { name: "taxable" }],
    });
  });

  it("reports env API key source in config get", async () => {
    const result = await runCommand(["config", "get"], {
      config: { defaultPortfolio: "main", portfolios: [{ name: "main" }] },
      env: { MYFUND_API_KEY: "env-secret" },
    });

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("env-secret");
    expect(parseLine(result.stdout)).toEqual({
      configPath: "/virtual/config.json",
      apiKeyConfigured: true,
      apiKeySource: "env",
      envApiKeyPresent: true,
      defaultPortfolio: "main",
      portfolios: [{ name: "main" }],
    });
  });

  it("mutates config for nested config and portfolio commands", async () => {
    const setKey = await runCommand(["config", "set", "api-key", "new-secret"]);
    expect(setKey.code).toBe(0);
    expect(setKey.written[0]?.apiKey).toBe("new-secret");
    expect(setKey.stdout).not.toContain("new-secret");

    const addPortfolio = await runCommand(["portfolios", "add", "new", "--description", "New portfolio"]);
    expect(addPortfolio.code).toBe(0);
    expect(addPortfolio.written[0]?.portfolios).toEqual([
      { name: "main" },
      { name: "taxable" },
      { name: "new", description: "New portfolio" },
    ]);
  });

  it("adds missing portfolios when setting defaults", async () => {
    const result = await runCommand(["portfolios", "set-default", "new"]);

    expect(result.code).toBe(0);
    expect(parseLine(result.stdout)).toEqual({ defaultPortfolio: "new", added: true });
    expect(result.written[0]).toMatchObject({
      defaultPortfolio: "new",
      portfolios: [{ name: "main" }, { name: "taxable" }, { name: "new" }],
    });
  });
});
