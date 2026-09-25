import { exigerAdmin } from "@/lib/admin";
import { MenuClient } from "@/app/(espace)/admin/menu/MenuClient";
import type { Plat } from "@/lib/types";

export default async function MenuPage() {
  const { supabase } = await exigerAdmin();
  const { data: plats } = await supabase
    .from("application_plats")
    .select("*")
    .order("actif", { ascending: false })
    .order("nom")
    .returns<Plat[]>();

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <MenuClient platsInitiaux={plats ?? []} />
    </div>
  );
}
