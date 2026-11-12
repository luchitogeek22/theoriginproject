"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hasWebGL, useStageSync } from "./hooks";
import { ProgressRail, ScrollMeter, StaticSky, TopBar } from "./ui/Chrome";
import Hero from "./sections/Hero";
import Explore from "./sections/Explore";
import Mission from "./sections/Mission";
import Epochs from "./sections/Epochs";
import Objects from "./sections/Objects";
import Pipeline from "./sections/Pipeline";
import Platform from "./sections/Platform";
import Finale from "./sections/Finale";

const Experience = dynamic(() => import("./scene/Experience"), { ssr: false, loading: () => null });

export default function LandingExperience() {
  const t = useTranslations("landing");
  const { active, compact } = useStageSync();
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    setWebgl(hasWebGL());
  }, []);

  return (
    <div className="landing">
      <Link href="/" className="landing-skip landing-focus">
        {t("skip")}
      </Link>
      <div className="fixed inset-0 z-0" aria-hidden>
        <StaticSky />
        {webgl && (
          <div className="landing-canvas absolute inset-0">
            <Experience compact={compact} />
          </div>
        )}
      </div>
      <div className="landing-vignette pointer-events-none fixed inset-0 z-[1]" aria-hidden />
      <TopBar />
      <ProgressRail active={active} />
      <ScrollMeter active={active} />
      <main className="relative z-10">
        <Hero />
        <Explore />
        <Mission />
        <Epochs />
        <Objects />
        <Pipeline />
        <Platform />
        <Finale />
      </main>
    </div>
  );
}
