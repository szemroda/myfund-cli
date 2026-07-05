import {
  findPosition,
  normalizeAllocation,
  normalizePositions,
  normalizeSummary,
  parseNumber,
} from "../src/lib/normalize.js";
import { describe, expect, it } from "vitest";

const raw = {
  portfel: {
    nazwa: "Portfolio in total",
    waluta: "PLN",
    wartosc: "246334.01",
    zysk: 57469.48,
    zmiana: "+134.98",
    zmianaDzienna: "0.38",
    zyskDzienny: "920.35",
    tickersCount: "3",
    benchName: "WIG",
    zmianaW: "+2.62",
    zmiana2W: "+2.27",
    zmianaM: "",
    zmiana3M: "---",
    zmiana6M: "&nbsp;",
    zmianaR: "+23.10",
    zmiana3R: "+71.59",
    zmiana5R: "+57.54",
    zmianaMdD: "+2.12",
    zmianaRdD: "+8.33",
  },
  tickers: {
    "1": {
      tickerClear: "LSE_ISAC.L",
      nazwa: "iShares MSCI ACWI UCITS ETF USD (Acc) (ISAC.L)",
      portfelOrg: "Glowne",
      typ: "ETFs - international",
      typOrg: "Akcje ",
      sektor: "Financial Services",
      ryzyko: "Wysokie ryzyko",
      wartosc: "29559.74",
      udzial: "12.00",
      zmiana: 18.75,
      zysk: "4667.05",
      zmianaDzienna: "+0.13",
      liczbaJednostek: 65,
      close: 454.77,
      cenaZakupu: "382.96",
      data: "2026-07-03",
      dataInvStart: "2025-07-31",
      okresInwestycji: 339,
    },
    "2": {
      tickerClear: "LSE_IB01.L",
      nazwa: "iShares $ Treasury Bond 0-1yr UCITS ETF USD (Acc) (IB01.L)",
      portfelOrg: "Czarna Godzina",
      typ: "ETFs - international",
      wartosc: "31226.46",
      udzial: "12.68",
      zmiana: "4.02",
      zysk: "1204.96",
      zmianaDzienna: "-0.38",
      liczbaJednostek: "69",
      close: "452.56",
      cenaZakupu: "435.09",
      data: "&nbsp;",
      okresInwestycji: "---",
    },
    "3": {
      tickerClear: "WAL_BTC",
      nazwa: "Bitcoin (BTC)",
      typ: "Cryptocurrrncies",
      wartosc: "12135.87",
      udzial: "4.93",
    },
  },
  struktura: {
    "ETFs - international": "60786.20",
    Cryptocurrrncies: "+12135.87",
    Unknown: "---",
  },
  strukturaWalory: {
    "iShares MSCI ACWI UCITS ETF USD (Acc) (ISAC.L)": 12,
    "Bitcoin (BTC)": "4.93",
    Empty: "&nbsp;",
  },
};

describe("normalize", () => {
it("parseNumber handles API numeric variants", () => {
  expect(parseNumber(1.5)).toBe(1.5);
  expect(parseNumber("+2.62")).toBe(2.62);
  expect(parseNumber("-2.62")).toBe(-2.62);
  expect(parseNumber("")).toBeNull();
  expect(parseNumber("---")).toBeNull();
  expect(parseNumber("&nbsp;")).toBeNull();
  expect(parseNumber("not a number")).toBeNull();
});

it("normalizeSummary maps Polish API fields to English JSON", () => {
  expect(normalizeSummary(raw)).toEqual({
    portfolio: "Portfolio in total",
    currency: "PLN",
    value: 246334.01,
    profit: 57469.48,
    returnPct: 134.98,
    dailyChangePct: 0.38,
    dailyProfit: 920.35,
    positionsCount: 3,
    benchmark: "WIG",
    periodReturns: {
      "1w": 2.62,
      "2w": 2.27,
      "1y": 23.1,
      "3y": 71.59,
      "5y": 57.54,
      mtd: 2.12,
      ytd: 8.33,
    },
  });
});

it("normalizePositions emits focused useful position fields and omits empty values", () => {
  const positions = normalizePositions(raw);

  expect(positions.count).toBe(3);
  expect(positions.positions[0]?.ticker).toBe("LSE_ISAC.L");
  expect(positions.positions[0]?.dailyChangePct).toBe(0.13);
  expect(positions.positions[1]?.data).toBeUndefined();
  expect(positions.positions[1]?.investmentDays).toBeUndefined();
});

it("findPosition searches exact ticker, ticker substring, then name substring", () => {
  expect(findPosition(raw, "WAL_BTC")).toEqual({
    kind: "match",
    position: {
      ticker: "WAL_BTC",
      name: "Bitcoin (BTC)",
      type: "Cryptocurrrncies",
      value: 12135.87,
      weightPct: 4.93,
    },
  });

  expect(findPosition(raw, "IB01").kind).toBe("match");
  expect(findPosition(raw, "Bitcoin").kind).toBe("match");
  expect(findPosition(raw, "LSE_I").kind).toBe("ambiguous");
  expect(findPosition(raw, "missing")).toEqual({ kind: "not_found", query: "missing" });
});

it("normalizeAllocation maps API aggregate sections", () => {
  expect(normalizeAllocation(raw, "asset-type")).toEqual({
    portfolio: "Portfolio in total",
    by: "asset-type",
    items: [
      { name: "ETFs - international", value: 60786.2 },
      { name: "Cryptocurrrncies", value: 12135.87 },
    ],
  });

  expect(normalizeAllocation(raw, "position")).toEqual({
    portfolio: "Portfolio in total",
    by: "position",
    items: [
      { name: "iShares MSCI ACWI UCITS ETF USD (Acc) (ISAC.L)", weightPct: 12 },
      { name: "Bitcoin (BTC)", weightPct: 4.93 },
    ],
  });
});
});
