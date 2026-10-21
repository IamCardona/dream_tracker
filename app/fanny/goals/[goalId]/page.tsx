import type { Metadata } from "next";
import GoalDetail from "../../../components/goal-detail";

export const metadata: Metadata = {
  title: "Goal · Fanny · Dream Tracker",
  description: "Track the stages and tasks of this goal.",
};

export default async function FannyGoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;

  return <GoalDetail personName="Fanny" theme="fanny" goalId={goalId} />;
}
