import { connectToDatabase } from "@/lib/mongodb";
import { databaseUnavailable } from "@/lib/database-error";
import { serializeGoal } from "@/lib/goal-serializer";
import {
  isObjectId,
  validateStageInput,
  validateStageOrder,
} from "@/lib/stage-validation";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string; goalId: string }>;
};

/** Creates a new stage at the end of the goal's stage list. */
export async function POST(request: Request, { params }: RouteContext) {
  const { person, goalId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId)) {
    return Response.json({ error: "Invalid goal ID." }, { status: 400 });
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

    const nextOrder = goal.stages.length
      ? Math.max(...goal.stages.map((stage) => stage.order)) + 1
      : 0;

    goal.stages.push({
      ...validation.value,
      order: nextOrder,
      tasks: [],
    });

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) }, { status: 201 });
  } catch (error) {
    return databaseUnavailable("create a stage for", error);
  }
}

/** Reorders the goal's stages to match the provided list of stage IDs. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { person, goalId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!isObjectId(goalId)) {
    return Response.json({ error: "Invalid goal ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateStageOrder(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOne({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    const requestedIds = validation.value;
    const existingIds = goal.stages.map((stage) => stage._id.toString());

    // The payload must describe exactly the stages this goal owns.
    if (
      requestedIds.length !== existingIds.length ||
      !requestedIds.every((id) => existingIds.includes(id))
    ) {
      return Response.json(
        { error: "The stage order must include every stage exactly once." },
        { status: 400 },
      );
    }

    for (const stage of goal.stages) {
      stage.order = requestedIds.indexOf(stage._id.toString());
    }

    await goal.save();
    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("reorder stages for", error);
  }
}
