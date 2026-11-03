import type { AdminRole } from "@prisma/client";
export const roleNames = {
  SUPER_ADMIN: "超级管理员",
  SALES_MANAGER: "销售主管",
  FINANCING_ADVISOR: "融资顾问",
  CONTENT_OPERATOR: "内容运营",
  CONTENT_REVIEWER: "独立内容审核员",
} satisfies Record<AdminRole, string>;
export const permissions = [
  "users.read",
  "users.create",
  "users.update",
  "users.disable",
  "roles.manage",
  "departments.manage",
  "leads.read_all",
  "leads.read_department",
  "leads.read_assigned",
  "leads.update_assigned",
  "leads.update_all",
  "leads.update_department",
  "leads.assign_department",
  "content.read",
  "content.create",
  "content.update",
  "content.review",
  "content.assign_review",
  "content.publish",
  "content.unpublish",
  "generation.create",
  "generation.manage",
  "analytics.read",
  "analytics.manage",
  "visibility.write",
  "audit.read",
] as const;
export type Permission = (typeof permissions)[number];
export const permissionNames: Record<Permission, string> = {
  "users.read": "查看员工",
  "users.create": "新增员工",
  "users.update": "编辑员工",
  "users.disable": "启用与停用员工",
  "roles.manage": "分配角色",
  "departments.manage": "管理部门",
  "leads.read_all": "查看全部线索",
  "leads.read_department": "查看本部门线索",
  "leads.read_assigned": "查看本人线索",
  "leads.update_assigned": "跟进本人线索",
  "leads.update_all": "跟进全部线索",
  "leads.update_department": "跟进本部门线索",
  "leads.assign_department": "分配授权范围内线索",
  "content.read": "查看运营内容",
  "content.create": "新增运营内容",
  "content.update": "编辑运营内容",
  "content.review": "审核运营内容",
  "content.assign_review": "分配独立内容审核人",
  "content.publish": "发布内容",
  "content.unpublish": "下线内容",
  "generation.create": "创建和查看本人内容生成任务",
  "generation.manage": "管理生成模板、核验资料和全部任务",
  "analytics.read": "查看内容聚合表现（不含客户明细）",
  "analytics.manage": "管理搜索数据源和导入同步",
  "visibility.write": "记录人工核验的GEO抽样观察",
  "audit.read": "查看审计记录",
};
export const rolePermissions: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: permissions,
  SALES_MANAGER: [
    "leads.read_department",
    "leads.update_department",
    "leads.assign_department",
  ],
  FINANCING_ADVISOR: ["leads.read_assigned", "leads.update_assigned"],
  CONTENT_OPERATOR: [
    "content.read",
    "content.create",
    "content.update",
    "generation.create",
    "analytics.read",
    "visibility.write",
  ],
  CONTENT_REVIEWER: ["content.read", "content.review"],
};
export function can(actor: { role: AdminRole }, permission: Permission) {
  return rolePermissions[actor.role].includes(permission);
}
export function canReadLeads(actor: { role: AdminRole }) {
  return (
    can(actor, "leads.read_all") ||
    can(actor, "leads.read_department") ||
    can(actor, "leads.read_assigned")
  );
}
