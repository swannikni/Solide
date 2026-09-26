"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, ShieldCheck, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";

// racine : partie de l'adresse qui allume l'onglet (Admin couvre /admin/...).
const LIENS_CLIENT = [
  { href: "/dashboard", racine: "/dashboard", label: "Aujourd'hui", icon: LayoutDashboard },
  { href: "/assistant", racine: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/history", racine: "/history", label: "Progrès", icon: TrendingUp },
  { href: "/messages", racine: "/messages", label: "Messages", icon: MessageCircle },
];

function estActif(pathname: string, racine: string) {
  return pathname === racine || pathname.startsWith(`${racine}/`);
}

export function Nav({
  estAdmin,
  pastilles = { messages: 0, admin: 0 },
  assistantActif = true,
}: {
  estAdmin: boolean;
  // Nombre d'éléments en attente affiché sur l'onglet (messages non lus, etc.).
  pastilles?: { messages: number; admin: number };
  assistantActif?: boolean;
}) {
  const pathname = usePathname();
  // Onglet touché : il s'allume tout de suite, sans attendre la fin du chargement.
  // Oublié dès que la page change.
  const [touche, setTouche] = useState<{ href: string; depuis: string } | null>(null);
  const cible = touche?.depuis === pathname ? touche.href : null;
  const setCible = (href: string) => setTouche({ href, depuis: pathname });

  const liensClient = LIENS_CLIENT.filter((l) => assistantActif || l.href !== "/assistant");
  const liens = estAdmin
    ? [{ href: "/admin/clients", racine: "/admin", label: "Admin", icon: ShieldCheck }, ...liensClient]
    : liensClient;
  const pastille = (href: string) =>
    href === "/messages" ? pastilles.messages : href === "/admin/clients" ? pastilles.admin : 0;

  // Planche d'étiquettes à imprimer : pas de barres.
  if (pathname.includes("/etiquettes")) return null;

  const actifSur = (href: string, racine: string) => (cible ? cible === href : estActif(pathname, racine));

  return (
    <>
      <header className="print:hidden fixed top-0 inset-x-0 z-20 h-[68px] md:h-20 bg-white/95 backdrop-blur-lg border-b border-black/[0.06]">
        <div className="max-w-3xl mx-auto h-full px-4 md:px-6 flex items-center justify-between">
          <Link href="/" aria-label="Accueil">
            <Logo className="h-11 md:h-[52px] w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {liens.map(({ href, racine, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`text-[13px] font-medium transition ${
                  actifSur(href, racine) ? "text-c2b-green font-bold" : "text-[#555] hover:text-c2b-green"
                }`}
              >
                {label}
                {pastille(href) > 0 && (
                  <span className="ml-1.5 rounded-full bg-c2b-gold px-1.5 py-0.5 text-[10px] font-bold text-c2b-green">
                    {pastille(href)}
                  </span>
                )}
              </Link>
            ))}
            <Link
              href="/profil"
              onClick={() => setCible("/profil")}
              className={`text-[13px] font-medium transition ${
                actifSur("/profil", "/profil") ? "text-c2b-green font-bold" : "text-[#555] hover:text-c2b-green"
              }`}
            >
              Mon profil
            </Link>
          </nav>
          <Link
            href="/profil"
            onClick={() => setCible("/profil")}
            className={`md:hidden w-10 h-10 -mr-1.5 rounded-full flex items-center justify-center transition ${
              actifSur("/profil", "/profil") ? "bg-c2b-green text-c2b-cream" : "bg-c2b-green/[0.06] text-c2b-green"
            }`}
            aria-label="Mon profil"
          >
            <UserRound size={20} />
          </Link>
        </div>
      </header>

      {/* Barre du bas flottante, vert Chef2Box : l'onglet actif est une case dorée
          (mêmes couleurs que la carte « Objectif du jour »). */}
      <nav className="print:hidden md:hidden fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 rounded-[22px] bg-c2b-green p-1.5 shadow-[0_10px_30px_rgba(28,46,30,0.35)]">
        <div className="flex gap-1">
          {liens.map(({ href, racine, label, icon: Icon }) => {
            const actif = actifSur(href, racine);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`relative flex h-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-semibold transition-colors active:scale-95 [-webkit-tap-highlight-color:transparent] ${
                  actif ? "bg-c2b-gold text-c2b-green" : "text-c2b-cream/60 active:bg-white/10"
                }`}
              >
                <Icon size={21} strokeWidth={actif ? 2.3 : 1.9} />
                <span className="whitespace-nowrap">{label}</span>
                {pastille(href) > 0 && (
                  <span
                    className={`absolute top-1 left-[calc(50%+6px)] min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] text-center ring-2 ${
                      actif ? "bg-c2b-green text-c2b-cream ring-c2b-gold" : "bg-c2b-gold text-c2b-green ring-c2b-green"
                    }`}
                    aria-label={`${pastille(href)} en attente`}
                  >
                    {pastille(href) > 9 ? "9+" : pastille(href)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
