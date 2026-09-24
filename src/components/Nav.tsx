"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, MessageCircle, History, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const LIENS_CLIENT = [
  { href: "/dashboard", label: "Aujourd'hui", icon: LayoutDashboard },
  { href: "/history", label: "Historique", icon: History },
  { href: "/messages", label: "Messages", icon: MessageCircle },
];

export function Nav({ estAdmin }: { estAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const liens = estAdmin
    ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }, ...LIENS_CLIENT]
    : LIENS_CLIENT;

  async function deconnexion() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 md:top-0 md:bottom-auto bg-c2b-green text-c2b-cream z-20">
      <div className="max-w-2xl mx-auto flex items-center justify-around md:justify-between px-4 py-2 md:py-3">
        <span className="hidden md:block font-hand text-2xl">
          Chef<span className="text-c2b-gold">2</span>Box
        </span>
        <div className="flex items-center gap-1 md:gap-4">
          {liens.map(({ href, label, icon: Icon }) => {
            const actif = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col md:flex-row items-center gap-0.5 md:gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm transition ${
                  actif ? "bg-c2b-gold text-c2b-green font-medium" : "text-c2b-cream/80 hover:text-c2b-cream"
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
          <button
            onClick={deconnexion}
            className="flex flex-col md:flex-row items-center gap-0.5 md:gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm text-c2b-cream/70 hover:text-c2b-cream"
          >
            <LogOut size={18} />
            <span className="hidden md:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
