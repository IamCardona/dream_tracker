import type { Metadata } from "next";
import GoalDashboard from "../components/goal-dashboard";

export const metadata: Metadata = {
  title: "Iam · Dream Tracker",
  description: "Track Iam's dreams and goals.",
};

export default function IamPage() {
  return (
    <GoalDashboard
      personName="Iam"
      theme="iam"
    />
  );
}
