export type GoalInput = {
  emoji: string;
  name: string;
  dueDate: string;
  successDefinition: string;
  color: string;
};

type ValidationResult =
  | { value: GoalInput; error?: never }
  | { value?: never; error: string };

export function validateGoalInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "A goal object is required." };
  }

  const candidate = input as Record<string, unknown>;
  const fields = [
    "emoji",
    "name",
    "dueDate",
    "successDefinition",
    "color",
  ] as const;

  if (fields.some((field) => typeof candidate[field] !== "string")) {
    return { error: "Complete every goal field before saving." };
  }

  const goal = {
    emoji: (candidate.emoji as string).trim(),
    name: (candidate.name as string).trim(),
    dueDate: (candidate.dueDate as string).trim(),
    successDefinition: (candidate.successDefinition as string).trim(),
    color: (candidate.color as string).trim().toUpperCase(),
  };

  if (!goal.emoji || goal.emoji.length > 32) {
    return { error: "The emoji must contain between 1 and 32 characters." };
  }
  if (!goal.name || goal.name.length > 80) {
    return { error: "The goal name must contain between 1 and 80 characters." };
  }
  const dueDate = new Date(`${goal.dueDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(goal.dueDate) ||
    Number.isNaN(dueDate.getTime()) ||
    dueDate.toISOString().slice(0, 10) !== goal.dueDate
  ) {
    return { error: "Enter a valid target date." };
  }
  if (!goal.successDefinition || goal.successDefinition.length > 400) {
    return {
      error: "The success definition must contain between 1 and 400 characters.",
    };
  }
  if (!/^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/.test(goal.color)) {
    return { error: "Enter a valid 3 or 6 digit HEX color." };
  }

  return { value: goal };
}
