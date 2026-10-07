import { connectToDatabase } from "@/lib/mongodb";
import { validateGoalInput } from "@/lib/goal-validation";
import { databaseUnavailable } from "@/lib/database-error";
import { serializeGoal } from "@/lib/goal-serializer";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string; goalId: string }>;
};

/** Returns a single goal with all of its stages and tasks. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { person, goalId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!/^[a-f\d]{24}$/i.test(goalId)) {
    return Response.json({ error: "Invalid goal ID." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOne({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("load", error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { person, goalId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!/^[a-f\d]{24}$/i.test(goalId)) {
    return Response.json({ error: "Invalid goal ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateGoalInput(body);
  if (validation.error) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOneAndUpdate(
      { _id: goalId, person },
      { $set: validation.value },
      { new: true, runValidators: true },
    );

    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    return Response.json({ goal: serializeGoal(goal) });
  } catch (error) {
    return databaseUnavailable("update", error);
  }
}

/** Deletes a goal along with every stage and task it contains. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { person, goalId } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }
  if (!/^[a-f\d]{24}$/i.test(goalId)) {
    return Response.json({ error: "Invalid goal ID." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const goal = await Goal.findOneAndDelete({ _id: goalId, person });
    if (!goal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    return Response.json({ id: goalId });
  } catch (error) {
    return databaseUnavailable("delete", error);
  }
}
