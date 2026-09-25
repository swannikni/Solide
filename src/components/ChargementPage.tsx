// Affiché instantanément pendant le chargement d'un onglet.
export function ChargementPage() {
  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10" aria-busy="true" aria-label="Chargement">
      <div className="max-w-2xl mx-auto px-4 pt-7 space-y-6 animate-pulse">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-c2b-gold/20" />
          <div className="h-9 w-56 rounded-xl bg-c2b-green/10" />
        </div>
        <div className="h-44 rounded-[20px] bg-c2b-green/10" />
        <div className="space-y-2.5">
          <div className="h-16 rounded-[20px] bg-white/70" />
          <div className="h-16 rounded-[20px] bg-white/70" />
          <div className="h-16 rounded-[20px] bg-white/70" />
        </div>
      </div>
    </div>
  );
}
