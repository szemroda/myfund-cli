export type JsonRecord = Record<string, unknown>;

export type PeriodReturns = Partial<Record<"1w" | "2w" | "1m" | "3m" | "6m" | "1y" | "3y" | "5y" | "mtd" | "ytd", number>>;

export interface NormalizedSummary {
  portfolio?: string;
  currency?: string;
  value?: number;
  profit?: number;
  returnPct?: number;
  dailyChangePct?: number;
  dailyProfit?: number;
  positionsCount?: number;
  benchmark?: string;
  periodReturns: PeriodReturns;
}

export interface NormalizedPosition {
  ticker?: string;
  name?: string;
  sourcePortfolio?: string;
  type?: string;
  originalType?: string;
  sector?: string;
  risk?: string;
  value?: number;
  weightPct?: number;
  returnPct?: number;
  profit?: number;
  dailyChangePct?: number;
  units?: number;
  lastPrice?: number;
  averageBuyPrice?: number;
  data?: string;
  investmentStartDate?: string;
  investmentDays?: number;
}

export interface PositionsOutput {
  portfolio?: string;
  count: number;
  positions: NormalizedPosition[];
}

export interface PositionCandidate {
  ticker?: string;
  name?: string;
}

export type PositionSearchResult =
  | { kind: "match"; position: NormalizedPosition }
  | { kind: "ambiguous"; query: string; candidates: PositionCandidate[] }
  | { kind: "not_found"; query: string };

export type AllocationBy = "asset-type" | "position";

export interface AllocationItem {
  name: string;
  value?: number;
  weightPct?: number;
}

export interface AllocationOutput {
  portfolio?: string;
  by: AllocationBy;
  items: AllocationItem[];
}

const EMPTY_MARKERS = new Set(["", "---", "&nbsp;"]);

const periodReturnFields: Array<[keyof PeriodReturns, string]> = [
  ["1w", "zmianaW"],
  ["2w", "zmiana2W"],
  ["1m", "zmianaM"],
  ["3m", "zmiana3M"],
  ["6m", "zmiana6M"],
  ["1y", "zmianaR"],
  ["3y", "zmiana3R"],
  ["5y", "zmiana5R"],
  ["mtd", "zmianaMdD"],
  ["ytd", "zmianaRdD"],
];

type StringValueKey<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
}[keyof T] &
  string;

type NumberValueKey<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T] &
  string;

type FieldMap<K extends string> = readonly (readonly [K, string])[];

const summaryLeadingTextFields = [
  ["portfolio", "nazwa"],
  ["currency", "waluta"],
] as const satisfies FieldMap<StringValueKey<NormalizedSummary>>;

const summaryNumberFields = [
  ["value", "wartosc"],
  ["profit", "zysk"],
  ["returnPct", "zmiana"],
  ["dailyChangePct", "zmianaDzienna"],
  ["dailyProfit", "zyskDzienny"],
  ["positionsCount", "tickersCount"],
] as const satisfies FieldMap<NumberValueKey<NormalizedSummary>>;

const summaryTrailingTextFields = [
  ["benchmark", "benchName"],
] as const satisfies FieldMap<StringValueKey<NormalizedSummary>>;

const positionLeadingTextFields = [
  ["ticker", "tickerClear"],
  ["name", "nazwa"],
  ["sourcePortfolio", "portfelOrg"],
  ["type", "typ"],
  ["originalType", "typOrg"],
  ["sector", "sektor"],
  ["risk", "ryzyko"],
] as const satisfies FieldMap<StringValueKey<NormalizedPosition>>;

const positionNumberFields = [
  ["value", "wartosc"],
  ["weightPct", "udzial"],
  ["returnPct", "zmiana"],
  ["profit", "zysk"],
  ["dailyChangePct", "zmianaDzienna"],
  ["units", "liczbaJednostek"],
  ["lastPrice", "close"],
  ["averageBuyPrice", "cenaZakupu"],
] as const satisfies FieldMap<NumberValueKey<NormalizedPosition>>;

const positionTrailingTextFields = [
  ["data", "data"],
  ["investmentStartDate", "dataInvStart"],
] as const satisfies FieldMap<StringValueKey<NormalizedPosition>>;

const positionTrailingNumberFields = [
  ["investmentDays", "okresInwestycji"],
] as const satisfies FieldMap<NumberValueKey<NormalizedPosition>>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (EMPTY_MARKERS.has(trimmed)) {
    return null;
  }

  const normalized = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  const decimalNormalized = normalized.includes(".") ? normalized : normalized.replace(",", ".");
  const parsed = Number(decimalNormalized.replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.replace(/\u00a0/g, " ").trim();
  return EMPTY_MARKERS.has(trimmed) ? undefined : trimmed;
}

export function normalizeSummary(raw: unknown): NormalizedSummary {
  const portfel = section(raw, "portfel");
  const periodReturns: PeriodReturns = {};

  for (const [target, source] of periodReturnFields) {
    const parsed = parseNumber(portfel[source]);
    if (parsed !== null) {
      periodReturns[target] = parsed;
    }
  }

  return {
    periodReturns,
    ...cleanTextFields(portfel, summaryLeadingTextFields),
    ...parseNumberFields(portfel, summaryNumberFields),
    ...cleanTextFields(portfel, summaryTrailingTextFields),
  };
}

export function normalizePerformance(raw: unknown): Pick<NormalizedSummary, "portfolio" | "periodReturns"> {
  const summary = normalizeSummary(raw);
  const performance: Pick<NormalizedSummary, "portfolio" | "periodReturns"> = { periodReturns: summary.periodReturns };
  if (summary.portfolio !== undefined) {
    performance.portfolio = summary.portfolio;
  }
  return performance;
}

export function normalizePositions(raw: unknown): PositionsOutput {
  const portfolio = normalizeSummary(raw).portfolio;
  const positions = recordValues(section(raw, "tickers")).map(normalizePosition);
  const output: PositionsOutput = { count: positions.length, positions };
  if (portfolio !== undefined) {
    output.portfolio = portfolio;
  }
  return output;
}

export function normalizePosition(raw: unknown): NormalizedPosition {
  const ticker = isRecord(raw) ? raw : {};

  return {
    ...cleanTextFields(ticker, positionLeadingTextFields),
    ...parseNumberFields(ticker, positionNumberFields),
    ...cleanTextFields(ticker, positionTrailingTextFields),
    ...parseNumberFields(ticker, positionTrailingNumberFields),
  };
}

export function findPosition(rawOrPositions: unknown, query: string): PositionSearchResult {
  const positions = Array.isArray(rawOrPositions)
    ? rawOrPositions.map(normalizePosition)
    : normalizePositions(rawOrPositions).positions;

  const exact = positions.filter((position) => position.ticker === query);
  const exactResult = matchOrAmbiguous(query, exact);
  if (exactResult !== undefined) {
    return exactResult;
  }

  const needle = query.toLocaleLowerCase();
  const tickerMatches = positions.filter((position) => position.ticker?.toLocaleLowerCase().includes(needle) === true);
  const tickerResult = matchOrAmbiguous(query, tickerMatches);
  if (tickerResult !== undefined) {
    return tickerResult;
  }

  const nameMatches = positions.filter((position) => position.name?.toLocaleLowerCase().includes(needle) === true);
  const nameResult = matchOrAmbiguous(query, nameMatches);
  if (nameResult !== undefined) {
    return nameResult;
  }

  return { kind: "not_found", query };
}

export function normalizeAllocation(raw: unknown, by: AllocationBy): AllocationOutput {
  const portfolio = normalizeSummary(raw).portfolio;
  const source = by === "asset-type" ? section(raw, "struktura") : section(raw, "strukturaWalory");
  const items: AllocationItem[] = [];

  for (const [name, value] of Object.entries(source)) {
    const parsed = parseNumber(value);
    if (parsed === null) {
      continue;
    }

    items.push(by === "asset-type" ? { name, value: parsed } : { name, weightPct: parsed });
  }

  const output: AllocationOutput = { by, items };
  if (portfolio !== undefined) {
    output.portfolio = portfolio;
  }
  return output;
}

export function section(raw: unknown, key: string): JsonRecord {
  if (!isRecord(raw)) {
    return {};
  }

  const value = raw[key];
  if (isRecord(value)) {
    return value;
  }

  return raw;
}

function recordValues(record: JsonRecord): unknown[] {
  return Object.keys(record)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => record[key]);
}

function cleanTextFields<K extends string>(source: JsonRecord, fields: FieldMap<K>): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};

  for (const [targetKey, sourceKey] of fields) {
    const cleaned = cleanText(source[sourceKey]);
    if (cleaned !== undefined) {
      result[targetKey] = cleaned;
    }
  }

  return result;
}

function parseNumberFields<K extends string>(source: JsonRecord, fields: FieldMap<K>): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};

  for (const [targetKey, sourceKey] of fields) {
    const parsed = parseNumber(source[sourceKey]);
    if (parsed !== null) {
      result[targetKey] = parsed;
    }
  }

  return result;
}

function matchOrAmbiguous(
  query: string,
  positions: NormalizedPosition[]
): PositionSearchResult | undefined {
  if (positions.length === 0) {
    return undefined;
  }

  if (positions.length > 1) {
    return ambiguous(query, positions);
  }

  const [position] = positions;
  return position === undefined ? undefined : { kind: "match", position };
}

function ambiguous(query: string, positions: NormalizedPosition[]): PositionSearchResult {
  return {
    kind: "ambiguous",
    query,
    candidates: positions.map((position) => {
      const candidate: PositionCandidate = {};
      if (position.ticker !== undefined) {
        candidate.ticker = position.ticker;
      }
      if (position.name !== undefined) {
        candidate.name = position.name;
      }
      return candidate;
    }),
  };
}
