export const customerTypeNames = {
  ENTERPRISE: "企业客户",
  SELF_EMPLOYED: "个体经营者",
  PERSONAL: "个人客户",
} as const;
export const sourceParameterNames: Record<string, string> = {
  utm_source: "来源渠道",
  utm_medium: "传播方式",
  utm_campaign: "活动标记",
};
export const accountFieldNames: Record<string, string> = {
  name: "员工姓名",
  email: "登录邮箱",
  role: "角色",
  departmentId: "所属部门",
  isActive: "账号状态",
  oldPassword: "原密码",
  newPassword: "新密码",
  confirmation: "确认密码",
  reauthPassword: "管理员密码",
  assignedTo: "负责人",
};
