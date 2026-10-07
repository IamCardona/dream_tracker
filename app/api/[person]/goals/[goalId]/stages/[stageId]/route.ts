import { connectToDatabase } from "@/lib/mongodb";
import { databaseUnavailable } from "@/lib/database-error";
import { serializeGoal } from "@/lib/goal-serializer";
import { isObjectId, validateStageInput } from "@/lib/stage-validation";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string; goalId: string; stageId: string }>;
};

/** Updates the name and description of a single stage. */
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

  const validation = validateStageInput(body);
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

    stage.name = validation.value.name;
    stage.description = validation.value.description;

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("update a stage for", error);
  }
}

/** Removes a stage (and all of its tasks), then compacts the remaining order. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { person, goalId, stageId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId) || !isObjectId(stageId)) {
    return Response.json({ error: "Invalid goal or stage ID." }, { status: 400 });
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

    stage.deleteOne();

    // Keep `order` values contiguous after the removal.
    [...goal.stages]
      .sort((a, b) => a.order - b.order)
      .forEach((remaining, index) => {
        remaining.order = index;
      });

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("delete a stage for", error);
  }
}
