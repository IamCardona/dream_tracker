import { connectToDatabase } from "@/lib/mongodb";
import { validateGoalInput } from "@/lib/goal-validation";
import { databaseUnavailable } from "@/lib/database-error";
import Goal, { type GoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string }>;
};

function isGoalPerson(person: string): person is GoalPerson {
  return person === "abigail" || person === "iam";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { person } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }

  try {
    await connectToDatabase();
    const goals = await Goal.find({ person }).sort({ updatedAt: -1 }).lean();
    return Response.json({
      goals: goals.map(({ _id, ...goal }) => ({
        ...goal,
        id: _id.toString(),
      })),
    });
  } catch (error) {
    return databaseUnavailable("load", error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { person } = await params;
  if (!isGoalPerson(person)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
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
    const goal = await Goal.create({ ...validation.value, person });
    return Response.json(
      {
        goal: {
          id: goal._id.toString(),
          emoji: goal.emoji,
          name: goal.name,
          dueDate: goal.dueDate,
          successDefinition: goal.successDefinition,
          color: goal.color,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return databaseUnavailable("create", error);
  }
}
