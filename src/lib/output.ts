export const toJson = (value: unknown): string => {
  return JSON.stringify(value);
};

export const writeJson = (
  value: unknown,
  stream: NodeJS.WritableStream = process.stdout
): void => {
  stream.write(`${toJson(value)}\n`);
};
