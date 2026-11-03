import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth/session";
import { LoginForm } from "@/components/forms/AdminForms";
export const metadata = { title: "管理员登录" };
export default async function Login() {
  if (await currentAdmin()) redirect("/admin/dashboard/");
  return (
    <main className="tw:max-w-xl tw:mx-auto">
      <Link href="/">← 沪上银官网</Link>
      <h1>管理员登录</h1>
      <p>仅限获授权的工作人员访问。</p>
      <LoginForm />
    </main>
  );
}
