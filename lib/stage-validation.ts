export type StageInput = {
  name: string;
  description: string;
};

export type TaskInput = {
  name: string;
  description: string;
  dueDate: string | null;
};

/**
 * Discriminated union on `ok` so TypeScript reliably narrows `value` after a
 * failure check, including inside nested scopes.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

/** Validates a `YYYY-MM-DD` string and confirms it is a real calendar date. */
function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validateStageInput(input: unknown): Result<StageInput> {
  const candidate = asRecord(input);
  if (!candidate) return { ok: false, error: "A stage object is required." };

  if (typeof candidate.name !== "string") {
    return { ok: false, error: "The stage name is required." };
  }

  const name = candidate.name.trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "The stage name must contain between 1 and 120 characters." };
  }

  const rawDescription =
    typeof candidate.description === "string" ? candidate.description : "";
  const description = rawDescription.trim();
  if (description.length > 600) {
    return { ok: false, error: "The stage description cannot exceed 600 characters." };
  }

  return { ok: true, value: { name, description } };
}

export function validateTaskInput(input: unknown): Result<TaskInput> {
  const candidate = asRecord(input);
  if (!candidate) return { ok: false, error: "A task object is required." };

  if (typeof candidate.name !== "string") {
    return { ok: false, error: "The task name is required." };
  }

  const name = candidate.name.trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "The task name must contain between 1 and 120 characters." };
  }

  const rawDescription =
    typeof candidate.description === "string" ? candidate.description : "";
  const description = rawDescription.trim();
  if (description.length > 600) {
    return { ok: false, error: "The task description cannot exceed 600 characters." };
  }

  // The due date is optional: accept null, undefined or an empty string.
  let dueDate: string | null = null;
  const rawDueDate = candidate.dueDate;
  if (typeof rawDueDate === "string" && rawDueDate.trim()) {
    const trimmed = rawDueDate.trim();
    if (!isValidCalendarDate(trimmed)) {
      return { ok: false, error: "Enter a valid task due date." };
    }
    dueDate = trimmed;
  } else if (rawDueDate !== null && rawDueDate !== undefined && rawDueDate !== "") {
    return { ok: false, error: "Enter a valid task due date." };
  }

  return { ok: true, value: { name, description, dueDate } };
}

/** Validates the ordered list of stage IDs used by drag-and-drop reordering. */
export function validateStageOrder(input: unknown): Result<string[]> {
  const candidate = asRecord(input);
  if (!candidate) return { ok: false, error: "A stage order payload is required." };

  const stageIds = candidate.stageIds;
  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    return { ok: false, error: "A non-empty list of stage IDs is required." };
  }
  if (stageIds.length > 200) {
    return { ok: false, error: "The stage list is too large." };
  }
  if (!stageIds.every((id): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id))) {
    return { ok: false, error: "The stage list contains an invalid stage ID." };
  }
  if (new Set(stageIds).size !== stageIds.length) {
    return { ok: false, error: "The stage list contains duplicated stage IDs." };
  }

  return { ok: true, value: stageIds };
}

/** Shared guard for MongoDB ObjectId path params. */
export function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}
