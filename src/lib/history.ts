import { MyfundCliError } from "./errors.js";
import { cleanText, isRecord, parseNumber, section } from "./normalize.js";

export type HistoryMetric = "value" | "profit" | "contribution" | "benchmark" | "return";
export type HistoryPeriod = "30d" | "90d" | "1y" | "ytd" | "all";
export type HistoryInterval = "daily" | "weekly" | "monthly";

export interface HistoryPoint {
  date: string;
  value: number;
}

export interface HistoryOptions {
  metric: HistoryMetric;
  period?: HistoryPeriod;
  from?: string;
  to?: string;
  interval?: HistoryInterval;
  maxPoints?: number;
}

export interface HistoryOutput {
  portfolio?: string;
  metric: HistoryMetric;
  interval: HistoryInterval;
  from?: string;
  to?: string;
  points: HistoryPoint[];
}

const metricSections: Record<HistoryMetric, string> = {
  value: "wartoscWCzasie",
  profit: "zyskWCzasie",
  contribution: "wkladWCzasie",
  benchmark: "benchWCzasie",
  return: "stopaZwrotuWCzasie",
};

const DEFAULT_MAX_POINTS = 366;
const MILLISECONDS_PER_DAY = 86_400_000;

export function selectHistory(raw: unknown, options: HistoryOptions): HistoryOutput {
  validateDateOptions(options);

  if (options.period !== undefined && (options.from !== undefined || options.to !== undefined)) {
    throw new MyfundCliError({
      code: "INVALID_ARGUMENTS",
      message: "Use either --period or --from/--to, not both."
    });
  }

  const allPoints = normalizeHistorySeries(section(raw, metricSections[options.metric]));
  const range = resolveDateRange(allPoints, options);
  const interval = options.interval ?? defaultInterval(options.period, range.from, range.to);
  const filtered = allPoints.filter((point) => point.date >= range.from && point.date <= range.to);
  const points = downsample(filtered, interval);
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;

  if (points.length > maxPoints) {
    throw new MyfundCliError({
      code: "TOO_MANY_POINTS",
      message: "History query would return too many points. Narrow the range, increase interval, or pass --max-points.",
      details: {
        points: points.length,
        maxPoints
      }
    });
  }

  const output: HistoryOutput = {
    metric: options.metric,
    interval,
    from: range.from,
    to: range.to,
    points
  };
  const portfolio = portfolioName(raw);
  if (portfolio !== undefined) {
    output.portfolio = portfolio;
  }

  return output;
}

export function normalizeHistorySeries(rawSeries: unknown): HistoryPoint[] {
  if (!isRecord(rawSeries)) {
    return [];
  }

  return Object.entries(rawSeries)
    .flatMap(([date, rawValue]) => {
      if (!isIsoDate(date)) {
        return [];
      }

      const value = parseNumber(rawValue);
      return value === null ? [] : [{ date, value }];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function downsample(points: HistoryPoint[], interval: HistoryInterval): HistoryPoint[] {
  if (interval === "daily") {
    return points;
  }

  const buckets = new Map<string, HistoryPoint>();
  for (const point of points) {
    const bucket = interval === "weekly" ? weekBucket(point.date) : point.date.slice(0, 7);
    buckets.set(bucket, point);
  }

  return Array.from(buckets.values());
}

function resolveDateRange(points: HistoryPoint[], options: HistoryOptions): { from: string; to: string } {
  const first = points[0]?.date;
  const last = points.at(-1)?.date;
  const to = options.to ?? last;

  if (first === undefined || last === undefined || to === undefined) {
    return { from: options.from ?? "", to: options.to ?? "" };
  }

  if (options.from !== undefined) {
    return { from: options.from, to };
  }

  if (options.to !== undefined) {
    return { from: addDays(to, -29), to };
  }

  const period = options.period ?? "30d";
  if (period === "all") {
    return { from: first, to: last };
  }
  if (period === "ytd") {
    return { from: `${last.slice(0, 4)}-01-01`, to: last };
  }
  if (period === "1y") {
    return { from: addYears(last, -1), to: last };
  }
  if (period === "90d") {
    return { from: addDays(last, -89), to: last };
  }
  if (period === "30d") {
    return { from: addDays(last, -29), to: last };
  }

  throw new MyfundCliError({
    code: "INVALID_ARGUMENTS",
    message: "Unsupported history period."
  });
}

function validateDateOptions(options: HistoryOptions): void {
  if (options.from !== undefined) {
    validateIsoDateOption(options.from, "--from");
  }

  if (options.to !== undefined) {
    validateIsoDateOption(options.to, "--to");
  }

  if (options.from !== undefined && options.to !== undefined && options.from > options.to) {
    throw new MyfundCliError({
      code: "INVALID_ARGUMENTS",
      message: "--from must be earlier than or equal to --to."
    });
  }
}

function validateIsoDateOption(value: string, optionName: string): void {
  if (isValidIsoDate(value)) {
    return;
  }

  throw new MyfundCliError({
    code: "INVALID_ARGUMENTS",
    message: `${optionName} must use YYYY-MM-DD format.`,
    details: { option: optionName, value }
  });
}

function defaultInterval(period: HistoryPeriod | undefined, from: string, to: string): HistoryInterval {
  if (period === "all") {
    return "monthly";
  }
  if (period === "1y") {
    return "weekly";
  }

  const dayCount = daysBetween(from, to) + 1;
  if (dayCount <= 90) {
    return "daily";
  }

  return "monthly";
}

function portfolioName(raw: unknown): string | undefined {
  const name = cleanText(section(raw, "portfel").nazwa);
  return name;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidIsoDate(value: string): boolean {
  if (!isIsoDate(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const fromTime = new Date(`${from}T00:00:00.000Z`).getTime();
  const toTime = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((toTime - fromTime) / MILLISECONDS_PER_DAY));
}

function weekBucket(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((parsed.getTime() - yearStart.getTime()) / MILLISECONDS_PER_DAY + 1) / 7);
  return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
