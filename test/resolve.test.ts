import { describe, expect, it } from "vitest";
import { MyfundCliError } from "../src/lib/errors.js";
import { resolveApiKey, resolvePortfolio } from "../src/lib/resolve.js";
import type { MyfundConfig } from "../src/types.js";

const baseConfig: MyfundConfig = {
  portfolios: [{ name: "main" }, { name: "taxable" }]
};

describe("resolveApiKey", () => {
  it("prefers config apiKey over MYFUND_API_KEY", () => {
    expect(resolveApiKey({ ...baseConfig, apiKey: "from-config" }, {
      MYFUND_API_KEY: "from-env"
    })).toEqual({
      apiKey: "from-config",
      source: "config"
    });
  });

  it("falls back to MYFUND_API_KEY", () => {
    expect(resolveApiKey(baseConfig, { MYFUND_API_KEY: "from-env" })).toEqual({
      apiKey: "from-env",
      source: "env"
    });
  });

  it("throws MISSING_API_KEY when no key is configured", () => {
    expect(() => resolveApiKey(baseConfig, {})).toThrowError(MyfundCliError);

    try {
      resolveApiKey(baseConfig, {});
    } catch (error) {
      expect(error).toBeInstanceOf(MyfundCliError);
      expect((error as MyfundCliError).code).toBe("MISSING_API_KEY");
    }
  });
});

describe("resolvePortfolio", () => {
  it("prefers explicit portfolio over defaultPortfolio", () => {
    expect(resolvePortfolio({ ...baseConfig, defaultPortfolio: "main" }, "taxable")).toEqual({
      portfolio: "taxable",
      source: "explicit"
    });
  });

  it("falls back to defaultPortfolio", () => {
    expect(resolvePortfolio({ ...baseConfig, defaultPortfolio: "main" })).toEqual({
      portfolio: "main",
      source: "config"
    });
  });

  it("throws MISSING_PORTFOLIO without explicit or default portfolio", () => {
    try {
      resolvePortfolio(baseConfig);
    } catch (error) {
      expect(error).toBeInstanceOf(MyfundCliError);
      expect((error as MyfundCliError).code).toBe("MISSING_PORTFOLIO");
    }
  });

  it("throws PORTFOLIO_NOT_FOUND when selected portfolio is not configured", () => {
    try {
      resolvePortfolio({ ...baseConfig, defaultPortfolio: "missing" });
    } catch (error) {
      expect(error).toBeInstanceOf(MyfundCliError);
      expect((error as MyfundCliError).code).toBe("PORTFOLIO_NOT_FOUND");
    }
  });
});
