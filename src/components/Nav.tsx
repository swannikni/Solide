"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, MessageCircle, LogOut, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

const LIENS_CLIENT = [
  { href: "/dashboard", label: "Aujourd'hui", icon: LayoutDashboard },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/history", label: "Progrès", icon: TrendingUp },
  { href: "/messages", label: "Messages", icon: MessageCircle },
];

function estActif(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ estAdmin }: { estAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  // Onglet touché : il s'allume tout de suite, sans attendre la fin du chargement.
  // Oublié dès que la page change.
  const [touche, setTouche] = useState<{ href: string; depuis: string } | null>(null);
  const cible = touche?.depuis === pathname ? touche.href : null;
  const setCible = (href: string) => setTouche({ href, depuis: pathname });

  const liens = estAdmin
    ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }, ...LIENS_CLIENT]
    : LIENS_CLIENT;

  async function deconnexion() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // Planche d'étiquettes à imprimer : pas de barres.
  if (pathname.includes("/etiquettes")) return null;

  const actifSur = (href: string) => (cible ? cible === href : estActif(pathname, href));

  return (
    <>
      <header className="print:hidden fixed top-0 inset-x-0 z-20 h-[68px] md:h-20 bg-white/95 backdrop-blur-lg border-b border-black/[0.06]">
        <div className="max-w-3xl mx-auto h-full px-4 md:px-6 flex items-center justify-between">
          <Link href="/" aria-label="Accueil">
            <Logo className="h-11 md:h-[52px] w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {liens.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`text-[13px] font-medium transition ${
                  actifSur(href) ? "text-c2b-green font-bold" : "text-[#555] hover:text-c2b-green"
                }`}
              >
                {label}
              </Link>
            ))}
            <button onClick={deconnexion} className="text-[13px] font-medium text-[#555] hover:text-c2b-green">
              Déconnexion
            </button>
          </nav>
          <button
            onClick={deconnexion}
            className="md:hidden flex items-center gap-1.5 text-xs font-semibold text-c2b-muted"
            aria-label="Déconnexion"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <nav className="print:hidden md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur-lg border-t border-black/[0.06] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around">
          {liens.map(({ href, label, icon: Icon }) => {
            const actif = actifSur(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors active:scale-95 [-webkit-tap-highlight-color:transparent] ${
                  actif ? "text-c2b-green" : "text-c2b-muted"
                }`}
              >
                <Icon size={20} strokeWidth={actif ? 2.4 : 1.8} />
                <span>{label}</span>
                <span className={`h-1 w-1 rounded-full ${actif ? "bg-c2b-gold" : "bg-transparent"}`} />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
