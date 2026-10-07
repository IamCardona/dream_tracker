function summarizeError(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" };

  const details: Record<string, string> = { name: error.name };
  const errorWithCode = error as Error & { code?: unknown };
  if (typeof errorWithCode.code === "string") details.code = errorWithCode.code;

  const cause = error.cause;
  if (cause instanceof Error) {
    details.causeName = cause.name;
    const causeWithCode = cause as Error & { code?: unknown };
    if (typeof causeWithCode.code === "string") {
      details.causeCode = causeWithCode.code;
    }
  }

  return details;
}

export function databaseUnavailable(operation: string, error: unknown) {
  console.error(
    `Failed to ${operation} goals in MongoDB:`,
    summarizeError(error),
  );
  return Response.json(
    { error: "The cloud database is unavailable. Please try again shortly." },
    { status: 503 },
  );
}
