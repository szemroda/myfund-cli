import { describe, expect, it } from "vitest";
import { MyfundCliError } from "../src/lib/errors.js";
import { downsample, normalizeHistorySeries, selectHistory } from "../src/lib/history.js";

const raw = {
  portfel: { nazwa: "Portfolio in total" },
  wartoscWCzasie: {
    "2026-01-01": "100",
    "2026-01-02": "101",
    "2026-01-05": "102",
    "2026-01-31": "123.32",
    "2026-02-01": "124",
    "2026-02-28": "133.86",
    "2026-03-31": "126.58",
    "2026-04-30": "129.31",
    "2026-05-31": "133.26",
    "2026-06-30": "130.11",
    "2026-07-01": "131.52",
    "2026-07-02": "132.81",
    "2026-07-03": "134.09",
    "2026-07-04": "134.20",
    "2026-07-05": "134.98",
  },
  zyskWCzasie: { "2026-07-05": "+57469.48" },
  wkladWCzasie: { "2026-07-05": "188864.53" },
  benchWCzasie: { "2026-07-05": "90.95" },
  stopaZwrotuWCzasie: { "2026-07-05": "+134.98" },
};

describe("history", () => {
it("normalizeHistorySeries parses and sorts date keyed series", () => {
  expect(normalizeHistorySeries({ "2026-01-02": "+2", bad: "3", "2026-01-01": "---" })).toEqual([
    { date: "2026-01-02", value: 2 },
  ]);
});

it("selectHistory defaults to 30d daily and one requested metric", () => {
  const result = selectHistory(raw, { metric: "value" });

  expect(result.metric).toBe("value");
  expect(result.interval).toBe("daily");
  expect(result.from).toBe("2026-06-06");
  expect(result.to).toBe("2026-07-05");
  expect(result.points.map((point) => point.date)).toEqual([
    "2026-06-30",
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
  ]);
});

it("selectHistory rejects period combined with explicit date range", () => {
  expect(() => selectHistory(raw, { metric: "value", period: "30d", from: "2026-01-01" })).toThrowError(MyfundCliError);
  try {
    selectHistory(raw, { metric: "value", period: "30d", from: "2026-01-01" });
  } catch (error) {
    expect(error).toBeInstanceOf(MyfundCliError);
    expect((error as MyfundCliError).code).toBe("INVALID_ARGUMENTS");
  }
});

it("weekly and monthly downsampling keep the last available point in each bucket", () => {
  const points = normalizeHistorySeries(raw.wartoscWCzasie);

  expect(downsample(points.slice(0, 4), "weekly")).toEqual([
    { date: "2026-01-02", value: 101 },
    { date: "2026-01-05", value: 102 },
    { date: "2026-01-31", value: 123.32 },
  ]);

  expect(downsample(points, "monthly").map((point) => point.date)).toEqual([
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
    "2026-06-30",
    "2026-07-05",
  ]);
});

it("selectHistory defaults interval by period", () => {
  const yearly = selectHistory(raw, { metric: "value", period: "1y" });
  const all = selectHistory(raw, { metric: "value", period: "all" });

  expect(yearly.interval).toBe("weekly");
  expect(all.interval).toBe("monthly");
});

it("selectHistory throws project TOO_MANY_POINTS error", () => {
  try {
    selectHistory(raw, { metric: "value", period: "all", interval: "daily", maxPoints: 2 });
  } catch (error) {
    expect(error).toBeInstanceOf(MyfundCliError);
    expect((error as MyfundCliError).code).toBe("TOO_MANY_POINTS");
    expect((error as MyfundCliError).details).toEqual({
      points: 15,
      maxPoints: 2,
    });
  }
});

it("selectHistory maps all supported metrics", () => {
  for (const metric of ["profit", "contribution", "benchmark", "return"] as const) {
    const result = selectHistory(raw, { metric });

    expect(result.points[0]?.date).toBe("2026-07-05");
  }
});

it("selectHistory validates explicit date options", () => {
  expect(() => selectHistory(raw, { metric: "value", from: "2026-99-01" })).toThrowError(MyfundCliError);
  expect(() =>
    selectHistory(raw, { metric: "value", from: "2026-07-05", to: "2026-07-01" })
  ).toThrowError(MyfundCliError);
});
});
