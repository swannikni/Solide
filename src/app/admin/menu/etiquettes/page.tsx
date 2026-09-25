import { exigerAdmin } from "@/lib/admin";
import { EtiquettesClient } from "@/app/admin/menu/etiquettes/EtiquettesClient";
import type { Plat } from "@/lib/types";

export default async function EtiquettesPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { supabase } = await exigerAdmin();
  const ids = ((await searchParams).ids ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 100);

  const { data: plats } = ids.length
    ? await supabase.from("application_plats").select("*").in("id", ids).order("nom").returns<Plat[]>()
    : { data: [] as Plat[] };

  return <EtiquettesClient plats={plats ?? []} />;
}
