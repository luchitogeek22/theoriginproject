export default function Explore() {
  return (
    <section id="explore" data-chapter aria-labelledby="explore-title" className="relative flex min-h-[150vh] items-center px-4 md:px-10">
      <div className="landing-scrim max-w-lg py-16">
        <h2 id="explore-title" className="landing-h2">Every region of the sky tells a story.</h2>
        <p className="landing-body mt-5">
          Point at any patch of sky by its coordinates — right ascension and declination — and The Origin Project asks the
          SPHEREx archive what it saw there, and when.
        </p>
        <dl className="mt-8 grid gap-4 text-sm">
          <div>
            <dt className="font-mono text-xs text-ion">RA / Dec grid</dt>
            <dd className="text-stellar/70">The coordinate system astronomers use to address any point on the sky.</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-nebula">Constellation lines</dt>
            <dd className="text-stellar/70">Landmarks for orientation: Orion, Ursa Major, Cassiopeia and Crux.</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-stellar">Named markers</dt>
            <dd className="text-stellar/70">The five challenge targets, placed at their catalogue positions.</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
