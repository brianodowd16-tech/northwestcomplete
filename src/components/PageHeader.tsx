export function PageHeader({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <section className="hero-bg text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-widest text-sea-300">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl font-display text-3xl font-bold sm:text-5xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-lg text-white/80">{intro}</p>}
      </div>
    </section>
  );
}
