import type { GoalDocument } from "@/models/goal";

/** Shape of a task as sent to the client. */
export type SerializedTask = {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  isCompleted: boolean;
};

/** Shape of a stage as sent to the client. */
export type SerializedStage = {
  id: string;
  name: string;
  description: string;
  order: number;
  tasks: SerializedTask[];
};

/** Shape of a goal as sent to the client. */
export type SerializedGoal = {
  id: string;
  emoji: string;
  name: string;
  dueDate: string;
  successDefinition: string;
  color: string;
  stages: SerializedStage[];
};

/**
 * Converts a Mongoose goal document into the plain JSON shape the client
 * expects. Stages are always returned sorted by their `order` field so the
 * UI never has to sort them itself.
 */
export function serializeGoal(goal: GoalDocument): SerializedGoal {
  const stages = [...(goal.stages ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      id: stage._id.toString(),
      name: stage.name,
      description: stage.description ?? "",
      order: stage.order,
      tasks: [...(stage.tasks ?? [])].map((task) => ({
        id: task._id.toString(),
        name: task.name,
        description: task.description ?? "",
        dueDate: task.dueDate ?? null,
        isCompleted: Boolean(task.isCompleted),
      })),
    }));

  return {
    id: (goal._id as { toString(): string }).toString(),
    emoji: goal.emoji,
    name: goal.name,
    dueDate: goal.dueDate,
    successDefinition: goal.successDefinition,
    color: goal.color,
    stages,
  };
}
