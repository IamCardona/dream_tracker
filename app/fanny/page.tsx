import type { Metadata } from "next";
import GoalDashboard from "../components/goal-dashboard";

export const metadata: Metadata = {
  title: "Fanny · Dream Tracker",
  description: "Track Fanny's dreams and goals.",
};

export default function FannyPage() {
  return <GoalDashboard personName="Fanny" theme="fanny" />;
}
