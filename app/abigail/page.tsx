import type { Metadata } from "next";
import GoalDashboard from "../components/goal-dashboard";

export const metadata: Metadata = {
  title: "Abigail · Dream Tracker",
  description: "Track Abigail's dreams and goals.",
};

export default function AbigailPage() {
  return (
    <GoalDashboard
      personName="Abigail"
      theme="abigail"
    />
  );
}
