import { MyfundCliError } from "./errors.js";
import type { MyfundApiResponse, MyfundApiStatus } from "../types.js";

const endpoint = "https://myfund.pl/API/v1/getPortfel.php";

export type GetPortfolioOptions = {
  portfolio: string;
  apiKey: string;
  fetchFn?: typeof fetch;
};

export const getPortfolio = async (
  options: GetPortfolioOptions
): Promise<MyfundApiResponse> => {
  const response = await getResponse(options);

  if (!response.ok) {
    throw new MyfundCliError({
      code: "MYFUND_API_ERROR",
      message: `myfund.pl API returned HTTP ${response.status}`,
      details: { status: response.status, statusText: response.statusText }
    });
  }

  const payload = await parseJsonResponse(response);
  const apiResponse = normalizeApiResponse(payload);
  const status = normalizeStatus(apiResponse.status);

  if (status.code === 0 || status.code === undefined) {
    return apiResponse;
  }

  if (status.code === 7) {
    throw new MyfundCliError({
      code: "PORTFOLIO_NOT_FOUND",
      message: status.text ?? "Portfolio not found.",
      details: { portfolio: options.portfolio, statusCode: status.code }
    });
  }

  throw new MyfundCliError({
    code: "MYFUND_API_ERROR",
    message: status.text ?? `myfund.pl API returned status ${status.code}`,
    details: { statusCode: status.code, ...(status.text === undefined ? {} : { statusText: status.text }) }
  });
};

const getResponse = async (options: GetPortfolioOptions): Promise<Response> => {
  const fetchImpl = options.fetchFn ?? fetch;
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    portfel: options.portfolio,
    apiKey: options.apiKey,
    format: "json"
  }).toString();

  try {
    return await fetchImpl(url);
  } catch (error) {
    throw new MyfundCliError({
      code: "NETWORK_ERROR",
      message: "Unable to reach myfund.pl API",
      cause: error
    });
  }
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    throw new MyfundCliError({
      code: "MYFUND_API_ERROR",
      message: "myfund.pl API returned invalid JSON",
      cause: error
    });
  }
};

const normalizeApiResponse = (payload: unknown): MyfundApiResponse => {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const record = Object.fromEntries(Object.entries(payload));
    const status = normalizeRawStatus(record.status);

    return {
      ...record,
      ...(status === undefined ? {} : { status })
    };
  }

  throw new MyfundCliError({
    code: "MYFUND_API_ERROR",
    message: "myfund.pl API returned an unexpected payload"
  });
};

const normalizeRawStatus = (status: unknown): MyfundApiStatus | undefined => {
  if (status === undefined) {
    return undefined;
  }

  if (typeof status !== "object" || status === null || Array.isArray(status)) {
    return undefined;
  }

  const record = Object.fromEntries(Object.entries(status));
  const code = record.code;
  const message = record.message;
  const text = record.text;

  return {
    ...(typeof code === "number" || typeof code === "string" ? { code } : {}),
    ...(typeof message === "string" ? { message } : {}),
    ...(typeof text === "string" ? { text } : {})
  };
};

const normalizeStatus = (
  status: MyfundApiStatus | undefined
): { code?: number; text?: string } => {
  if (status === undefined) {
    return {};
  }

  const code = parseStatusCode(status.code);
  const text = status.text ?? status.message;

  return {
    ...(code === undefined ? {} : { code }),
    ...(typeof text === "string" ? { text } : {})
  };
};

const parseStatusCode = (code: MyfundApiStatus["code"]): number | undefined => {
  if (typeof code === "number" && Number.isFinite(code)) {
    return code;
  }

  if (typeof code === "string" && code.trim().length > 0) {
    const parsed = Number(code);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};
