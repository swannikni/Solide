import Link from "next/link";
import { Logo } from "@/components/Logo";

// Mise en page des pages d'information (confidentialité, conditions).
export function PageLegale({ titre, majLe, children }: { titre: string; majLe: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-c2b-cream px-5 py-8">
      <main className="max-w-2xl mx-auto">
        <Link href="/profil" className="text-sm font-semibold text-c2b-muted">
          ← Retour
        </Link>
        <Logo className="h-14 w-auto mt-6" />
        <h1 className="titre text-[32px] mt-4">{titre}</h1>
        <p className="text-xs text-c2b-muted mt-1">Dernière mise à jour : {majLe}</p>
        <div className="carte p-6 mt-6 space-y-5 text-[15px] leading-relaxed text-c2b-text [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-c2b-green [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </main>
    </div>
  );
}
