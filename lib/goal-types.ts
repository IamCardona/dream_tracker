export type GoalTheme = "abigail" | "iam";

export type Task = {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  isCompleted: boolean;
};

export type Stage = {
  id: string;
  name: string;
  description: string;
  order: number;
  tasks: Task[];
};

export type Goal = {
  id: string;
  emoji: string;
  name: string;
  dueDate: string;
  successDefinition: string;
  color: string;
  stages: Stage[];
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    (candidate.dueDate === null || typeof candidate.dueDate === "string") &&
    typeof candidate.isCompleted === "boolean"
  );
}

function isStage(value: unknown): value is Stage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.order === "number" &&
    Array.isArray(candidate.tasks) &&
    candidate.tasks.every(isTask)
  );
}

export function isGoal(value: unknown): value is Goal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.emoji === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.dueDate === "string" &&
    typeof candidate.successDefinition === "string" &&
    typeof candidate.color === "string" &&
    HEX_COLOR_PATTERN.test(candidate.color) &&
    Array.isArray(candidate.stages) &&
    candidate.stages.every(isStage)
  );
}

export function isGoalList(value: unknown): value is Goal[] {
  return Array.isArray(value) && value.every(isGoal);
}

/** Percentage (0-100) of completed tasks within a stage. */
export function getStageProgress(stage: Stage): number {
  if (stage.tasks.length === 0) return 0;
  const completed = stage.tasks.filter((task) => task.isCompleted).length;
  return Math.round((completed / stage.tasks.length) * 100);
}

/** Percentage (0-100) of completed tasks across every stage of a goal. */
export function getGoalProgress(goal: Goal): number {
  const allTasks = goal.stages.flatMap((stage) => stage.tasks);
  if (allTasks.length === 0) return 0;
  const completed = allTasks.filter((task) => task.isCompleted).length;
  return Math.round((completed / allTasks.length) * 100);
}

/** Expands a 3-digit HEX color into its 6-digit form. */
export function expandHexColor(color: string): string {
  return color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
}

/** Today's date as `YYYY-MM-DD` in the user's local timezone. */
export function getLocalDate(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  return new Date(today.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/** Formats a `YYYY-MM-DD` string for display. */
export function formatDueDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Reads a `{ goal }` or `{ goals }` JSON envelope from an API response,
 * throwing a useful message when the request failed.
 */
export async function readGoalResponse(
  response: Response,
  fallbackMessage: string,
): Promise<Goal> {
  const result: unknown = await response.json();
  const payload =
    typeof result === "object" && result !== null
      ? (result as { goal?: unknown; error?: unknown })
      : {};

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : fallbackMessage,
    );
  }
  if (!isGoal(payload.goal)) {
    throw new Error("The cloud database returned an invalid goal response.");
  }

  return payload.goal;
}
