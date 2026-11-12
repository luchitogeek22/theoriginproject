"use client";

import { useEffect, useRef, useState } from "react";
import { useSectionProgress } from "../hooks";
import { SIM_EPOCHS, simulatedReadout } from "../simulation";
import { stage } from "../stage";

const EPOCH_NAMES = ["Epoch 01", "Epoch 02", "Epoch 03"];

export default function Epochs() {
  const ref = useRef<HTMLElement>(null);
  const progress = useSectionProgress(ref);
  const [manual, setManual] = useState<number | null>(null);
  const [difference, setDifference] = useState(false);

  const scrolled = Math.min(1, Math.max(0, (progress - 0.15) / 0.6));
  const epoch = manual ?? scrolled;
  const readout = simulatedReadout(epoch);
  const nearest = SIM_EPOCHS.reduce((best, e, i) => (Math.abs(e - epoch) < Math.abs(SIM_EPOCHS[best] - epoch) ? i : best), 0);

  useEffect(() => {
    stage.epoch = epoch;
  }, [epoch]);
  useEffect(() => {
    stage.difference = difference ? 1 : 0;
  }, [difference]);
  useEffect(() => {
    if (progress <= 0 || progress >= 1) setManual(null);
  }, [progress]);

  return (
    <section ref={ref} id="epochs" data-chapter aria-labelledby="epochs-title" className="relative h-[260vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-start px-4 pt-24 md:items-center md:px-10 md:pt-0">
        <div className="landing-scrim w-full max-w-md py-6">
          <p className="landing-badge">Simulation · not a measurement</p>
          <h2 id="epochs-title" className="landing-h2 mt-4">The universe changes. We help you investigate.</h2>
          <p className="landing-body mt-4">
            The same patch of sky, seen at different times. One star drifts, another brightens. Drag through the epochs, then
            switch on the difference view to keep only what changed.
          </p>

          <fieldset className="mt-6">
            <legend className="sr-only">Choose an epoch</legend>
            <div className="flex gap-2">
              {EPOCH_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={nearest === i}
                  onClick={() => setManual(SIM_EPOCHS[i])}
                  className="landing-focus landing-chip"
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="sr-only">Time between epochs</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(epoch * 1000)}
                onChange={(e) => setManual(Number(e.target.value) / 1000)}
                className="landing-range landing-focus w-full"
              />
            </label>
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-stellar/80">
            <input type="checkbox" checked={difference} onChange={(e) => setDifference(e.target.checked)} className="landing-switch landing-focus" />
            Show difference (later epoch minus Epoch 01)
          </label>

          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-stellar/10 pt-4 font-mono text-[11px]">
            <div>
              <dt className="text-stellar/45">Observation date</dt>
              <dd className="mt-1 text-stellar/80">none (simulated)</dd>
            </div>
            <div>
              <dt className="text-stellar/45">Positional variation</dt>
              <dd className="mt-1 text-ion">{readout.shiftPx.toFixed(2)} px</dd>
            </div>
            <div>
              <dt className="text-stellar/45">Brightness variation</dt>
              <dd className="mt-1 text-nebula">
                {readout.brightnessPct >= 0 ? "+" : ""}
                {readout.brightnessPct.toFixed(0)}%
              </dd>
            </div>
          </dl>

          <p className="mt-5 hidden text-xs leading-relaxed text-stellar/55 md:block">
            Why compare epochs? A SPHEREx pixel spans about 6″ of sky, and the challenge&apos;s moving targets drift roughly
            5–10″ per year: often less than a pixel between visits. Seeing them takes aligned frames on one shared brightness
            scale.
          </p>
        </div>
      </div>
    </section>
  );
}
