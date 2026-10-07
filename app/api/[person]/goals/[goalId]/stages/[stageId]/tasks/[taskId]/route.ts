import { connectToDatabase } from "@/lib/mongodb";
import { databaseUnavailable } from "@/lib/database-error";
import { serializeGoal } from "@/lib/goal-serializer";
import { isObjectId, validateTaskInput } from "@/lib/stage-validation";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    person: string;
    goalId: string;
    stageId: string;
    taskId: string;
  }>;
};

/** Replaces a task's editable fields. */
export async function PUT(request: Request, { params }: RouteContext) {
  const { person, goalId, stageId, taskId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId) || !isObjectId(stageId) || !isObjectId(taskId)) {
    return Response.json({ error: "Invalid goal, stage or task ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateTaskInput(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOne({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    const stage = goal.stages.id(stageId);
    if (!stage) {
      return Response.json({ error: "Stage not found." }, { status: 404 });
    }

    const task = stage.tasks.id(taskId);
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    task.name = validation.value.name;
    task.description = validation.value.description;
    task.dueDate = validation.value.dueDate;

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("update a task for", error);
  }
}

/** Toggles (or explicitly sets) a task's completion state. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { person, goalId, stageId, taskId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId) || !isObjectId(stageId) || !isObjectId(taskId)) {
    return Response.json({ error: "Invalid goal, stage or task ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const payload =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof payload.isCompleted !== "boolean") {
    return Response.json(
      { error: "The `isCompleted` field must be a boolean." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOne({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    const stage = goal.stages.id(stageId);
    if (!stage) {
      return Response.json({ error: "Stage not found." }, { status: 404 });
    }

    const task = stage.tasks.id(taskId);
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    task.isCompleted = payload.isCompleted;

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("update a task for", error);
  }
}

/** Removes a task from its stage. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { person, goalId, stageId, taskId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId) || !isObjectId(stageId) || !isObjectId(taskId)) {
    return Response.json({ error: "Invalid goal, stage or task ID." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOne({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    const stage = goal.stages.id(stageId);
    if (!stage) {
      return Response.json({ error: "Stage not found." }, { status: 404 });
    }

    const task = stage.tasks.id(taskId);
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    task.deleteOne();

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("delete a task for", error);
  }
}
