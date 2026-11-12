import type { Metadata } from "next";
import LandingExperience from "@/components/landing/LandingExperience";

export const metadata: Metadata = {
  title: "The Origin Project — Explore the universe. Discover what changes.",
  description:
    "An interactive scientific platform to explore real SPHEREx observations and investigate the dynamic universe. Built for the 2026 NASA Space Apps Challenge.",
};

export default function LandingPage() {
  return <LandingExperience />;
}
