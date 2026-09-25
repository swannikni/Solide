import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfilClient } from "@/app/(espace)/profil/ProfilClient";
import type { Client } from "@/lib/types";

export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase.from("application_clients").select("*").eq("id", user.id).single<Client>();
  if (!client) redirect("/login");

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <ProfilClient client={client} email={user.email ?? ""} />
    </div>
  );
}
