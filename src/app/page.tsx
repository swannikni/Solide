import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: client } = await supabase
    .from("application_clients")
    .select("est_admin")
    .eq("id", user.id)
    .single();

  redirect(client?.est_admin ? "/admin" : "/dashboard");
}
