import { connectToDatabase } from "@/lib/mongodb";
import { databaseUnavailable } from "@/lib/database-error";
import { serializeGoal } from "@/lib/goal-serializer";
import { isObjectId, validateTaskInput } from "@/lib/stage-validation";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TASKS_PER_IMPORT = 500;

type RouteContext = {
  params: Promise<{ person: string; goalId: string; stageId: string }>;
};

/** Imports a validated task list into a stage, replacing or appending tasks. */
export async function PUT(request: Request, { params }: RouteContext) {
  const { person, goalId, stageId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId) || !isObjectId(stageId)) {
    return Response.json({ error: "Invalid goal or stage ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "An import object is required." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (payload.mode !== "replace" && payload.mode !== "append") {
    return Response.json(
      { error: 'Import mode must be "replace" or "append".' },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(payload.tasks) ||
    payload.tasks.length === 0 ||
    payload.tasks.length > MAX_TASKS_PER_IMPORT
  ) {
    return Response.json(
      { error: `Provide between 1 and ${MAX_TASKS_PER_IMPORT} tasks to import.` },
      { status: 400 },
    );
  }

  const tasks = [];
  for (const [index, task] of payload.tasks.entries()) {
    const validation = validateTaskInput(task);
    if (!validation.ok) {
      return Response.json(
        { error: `Task ${index + 1}: ${validation.error}` },
        { status: 400 },
      );
    }

    const candidate =
      typeof task === "object" && task !== null
        ? (task as Record<string, unknown>)
        : {};
    if (
      candidate.isCompleted !== undefined &&
      typeof candidate.isCompleted !== "boolean"
    ) {
      return Response.json(
        { error: `Task ${index + 1}: completion status must be a boolean.` },
        { status: 400 },
      );
    }

    tasks.push({
      ...validation.value,
      isCompleted: candidate.isCompleted === true,
    });
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

    if (payload.mode === "replace") stage.tasks.splice(0, stage.tasks.length);
    stage.tasks.push(...tasks);

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("import tasks for", error);
  }
}
