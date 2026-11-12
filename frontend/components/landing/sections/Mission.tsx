import SpectralBands from "../ui/SpectralBands";

const FACTS = [
  { value: "102", label: "spectral bands, from six detector arrays of 17 channels each" },
  { value: "0.75–5.0 µm", label: "near-infrared, beyond what the human eye can see" },
  { value: "6 months", label: "to map the whole sky, repeated since May 2025" },
];

export default function Mission() {
  return (
    <section id="mission" data-chapter aria-labelledby="mission-title" className="relative flex min-h-[170vh] items-center px-4 md:px-10">
      <div className="landing-scrim w-full max-w-xl py-16">
        <h2 id="mission-title" className="landing-h2">The power of SPHEREx</h2>
        <p className="landing-body mt-5">
          NASA&apos;s SPHEREx observatory photographs the entire sky again and again, splitting its light into colours we
          cannot see. Each repeat is a new chance to notice what moved or changed.
        </p>
        <dl className="mt-8 grid gap-5 sm:grid-cols-3">
          {FACTS.map((f) => (
            <div key={f.value}>
              <dt className="font-display text-2xl font-light text-stellar">{f.value}</dt>
              <dd className="mt-1 text-xs leading-snug text-stellar/60">{f.label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10">
          <p className="mb-3 text-sm text-stellar/80">Move across the bands to see what each part of the spectrum reveals.</p>
          <SpectralBands />
        </div>
        <p className="mt-6 text-xs text-stellar/45">
          The glowing strips on the sphere illustrate an all-sky survey filling in over time. They are not SPHEREx&apos;s
          real pointing schedule.
        </p>
      </div>
    </section>
  );
}
