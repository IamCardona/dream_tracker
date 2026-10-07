import { databaseUnavailable } from "@/lib/database-error";
import { connectToDatabase } from "@/lib/mongodb";
import { validateGoalInput } from "@/lib/goal-validation";
import { serializeGoal } from "@/lib/goal-serializer";
import Goal, { isGoalPerson } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ person: string }>;
};

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

  if (typeof body !== "object" || body === null || !("goals" in body)) {
    return Response.json({ error: "A goals list is required." }, { status: 400 });
  }

  const legacyGoals = body.goals;
  if (!Array.isArray(legacyGoals) || legacyGoals.length > 500) {
    return Response.json({ error: "The goals list is invalid or too large." }, { status: 400 });
  }

  const operations = [];
  for (const [index, legacyGoal] of legacyGoals.entries()) {
    if (typeof legacyGoal !== "object" || legacyGoal === null) {
      return Response.json(
        { error: `Goal ${index + 1} is invalid.` },
        { status: 400 },
      );
    }

    const legacyId = "id" in legacyGoal ? legacyGoal.id : undefined;
    if (typeof legacyId !== "string" || !legacyId.trim() || legacyId.length > 100) {
      return Response.json(
        { error: `Goal ${index + 1} has an invalid ID.` },
        { status: 400 },
      );
    }

    const validation = validateGoalInput(legacyGoal);
    if (validation.error) {
      return Response.json(
        { error: `Goal ${index + 1}: ${validation.error}` },
        { status: 400 },
      );
    }

    operations.push({
      updateOne: {
        filter: { person, legacyId: legacyId.trim() },
        update: {
          $setOnInsert: {
            ...validation.value,
            person,
            legacyId: legacyId.trim(),
          },
        },
        upsert: true,
      },
    });
  }

  try {
    await connectToDatabase();
    if (operations.length > 0) await Goal.bulkWrite(operations);

    const goals = await Goal.find({ person }).sort({ updatedAt: -1 });
    return Response.json({ goals: goals.map(serializeGoal) });
  } catch (error) {
    return databaseUnavailable("migrate locally saved", error);
  }
}
