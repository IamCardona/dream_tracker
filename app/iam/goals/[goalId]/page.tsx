import type { Metadata } from "next";
import GoalDetail from "../../../components/goal-detail";

export const metadata: Metadata = {
  title: "Goal · Iam · Dream Tracker",
  description: "Track the stages and tasks of this goal.",
};

export default async function IamGoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;

  return <GoalDetail personName="Iam" theme="iam" goalId={goalId} />;
}
