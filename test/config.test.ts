import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getSafeConfigInfo,
  parseConfig,
  readConfig,
  writeConfig
} from "../src/lib/config.js";

const tempDirs: string[] = [];

const makeConfigPath = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "myfund-cli-test-"));
  tempDirs.push(dir);
  return path.join(dir, "nested", "config.json");
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config", () => {
  it("normalizes missing portfolios to an empty array", () => {
    expect(parseConfig({ apiKey: "secret" })).toEqual({
      apiKey: "secret",
      portfolios: []
    });
  });

  it("writes and reads config while preserving unknown top-level fields", async () => {
    const configPath = await makeConfigPath();

    await writeConfig(
      {
        apiKey: "secret",
        defaultPortfolio: "main",
        portfolios: [{ name: "main", description: "Primary" }],
        theme: "compact"
      },
      configPath
    );

    await expect(readConfig(configPath)).resolves.toEqual({
      path: configPath,
      exists: true,
      config: {
        apiKey: "secret",
        defaultPortfolio: "main",
        portfolios: [{ name: "main", description: "Primary" }],
        theme: "compact"
      }
    });
  });

  it("returns an empty config for missing files", async () => {
    const configPath = await makeConfigPath();

    await expect(readConfig(configPath)).resolves.toEqual({
      path: configPath,
      exists: false,
      config: {
        portfolios: []
      }
    });
  });

  it("omits apiKey from safe config info", () => {
    const safe = getSafeConfigInfo({
      path: "/tmp/config.json",
      exists: true,
      config: {
        apiKey: "secret",
        defaultPortfolio: "main",
        portfolios: [{ name: "main" }]
      }
    });

    expect(safe).toEqual({
      configPath: "/tmp/config.json",
      apiKeyConfigured: true,
      apiKeySource: "config",
      defaultPortfolio: "main",
      portfolios: [{ name: "main" }]
    });
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
});
