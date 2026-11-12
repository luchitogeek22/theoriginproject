import LandingExperience from "@/components/landing/LandingExperience";
import { metadataFor } from "@/i18n/metadata";

export const generateMetadata = metadataFor("landing", "/landing-page");

export default function LandingPage() {
  return <LandingExperience />;
}
