import { reviewChecks } from "./config";

export const reviewNoteMinimum = 10;
export const reviewNoteMaximum = 1000;
export const workflowTimeoutMs = 15000;
export const reviewNoteHelp =
  "必填，去除首尾空白后10—1000字。请具体记录核验了哪些来源、支持哪些事实及适用时间；不能只填写“无”“同意”等简短结论。退回时请说明需修改的问题。";

export function reviewInputIssue(
  action: string,
  note: string,
  checklist: Record<string, boolean>,
) {
  if (!["approve", "reject"].includes(action)) return null;
  if (note.trim().length < reviewNoteMinimum || note.length > reviewNoteMaximum)
    return {
      code: "REVIEW_NOTE",
      field: "note",
      message:
        "人工核验说明至少10字、最多1000字，不能只填“无”。请写明核验来源、事实及适用时间；退回时说明修改原因。",
    };
  if (action === "approve") {
    const field = Object.keys(reviewChecks).find(
      (key) => checklist[key] !== true,
    );
    if (field)
      return {
        code: "REVIEW_REQUIRED",
        field,
        message: "人工核验项目尚未完成，请逐项核对并勾选全部7项后再审核通过。",
      };
  }
  return null;
}

export function workflowFailureMessage(
  status: number,
  code?: string,
  safeMessage?: string,
) {
  if (status === 401)
    return "登录已失效或账号权限已变更，请重新登录后核对审核状态。";
  if (code === "INDEPENDENT_REVIEW")
    return "当前账号参与了此版本创作、编辑、导入或提交，不满足独立审核要求，请由其他合格审核员处理。";
  if (code === "REVIEW_ASSIGNED_TO_OTHER")
    return "当前审核任务已分配给其他审核人，请由指定人员处理，或联系超级管理员重新分配。";
  if (status === 403)
    return safeMessage || "当前账号没有审核权限，请联系超级管理员。";
  if (["EVIDENCE_CHANGED", "RISK_REVIEW_REQUIRED"].includes(code || ""))
    return safeMessage || "证据已变化，请重新核验当前版本。";
  if (
    [
      "COMPLIANCE_REQUIRED",
      "STATE_INVALID",
      "REJECTED_EDIT_REQUIRED",
      "REVIEW_LOCKED",
      "APPROVAL_REQUIRED",
      "DUPLICATE",
    ].includes(code || "")
  )
    return safeMessage || "内容或状态校验未通过，请核对具体问题。";
  if (code === "STALE_VERSION")
    return (
      safeMessage ||
      "已保存版本与服务器不同，请先查看最新版本差异，确认后刷新；不会覆盖他人修改。"
    );
  if (status === 409)
    return "当前版本已被修改、撤回或由其他人员处理，本次操作未完成。请刷新页面核对最新版本和审核记录。";
  if (status >= 500)
    return "服务或数据库连接暂不可用，尚未确认审核结果。请稍后刷新核对状态和审核记录，再决定是否重试。";
  if (status === 429) return "审核操作过于频繁，请稍后重试。";
  // Only display messages from the existing safe API error envelope.
  return safeMessage || "操作未完成，请检查填写内容并重试。";
}
