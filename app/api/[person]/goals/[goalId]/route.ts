import { connectToDatabase } from "@/lib/mongodb";
import { validateGoalInput } from "@/lib/goal-validation";
import { databaseUnavailable } from "@/lib/database-error";
import Goal, { type GoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string; goalId: string }>;
};

function isGoalPerson(person: string): person is GoalPerson {
  return person === "abigail" || person === "iam";
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

    return Response.json({
      goal: {
        id: goal._id.toString(),
        emoji: goal.emoji,
        name: goal.name,
        dueDate: goal.dueDate,
        successDefinition: goal.successDefinition,
        color: goal.color,
      },
    });
  } catch (error) {
    return databaseUnavailable("update", error);
  }
}
