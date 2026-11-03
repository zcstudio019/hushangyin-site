import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { DepartmentForm } from "@/components/forms/AccountForms";
export const metadata = { title: "部门管理" };
export default async function Departments() {
  await pageActor("departments.manage");
  const items = await db().department.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <h1>部门管理</h1>
      <p>停用前请转移部门内有效员工和线索；历史记录保留。</p>
      <h2>新增部门</h2>
      <DepartmentForm />
      <h2>现有部门</h2>
      {items.map((d) => (
        <section key={d.id}>
          <h3>{d.name}</h3>
          <DepartmentForm department={d} />
        </section>
      ))}
    </>
  );
}
