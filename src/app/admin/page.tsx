import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth/session";
export default async function Admin() {
  redirect((await currentAdmin()) ? "/admin/dashboard/" : "/admin/login/");
}
