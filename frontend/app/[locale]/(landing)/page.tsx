import LandingExperience from "@/components/landing/LandingExperience";
import { metadataFor } from "@/i18n/metadata";

export const generateMetadata = metadataFor("landing", "/");

export default function LandingPage() {
  return <LandingExperience />;
}
