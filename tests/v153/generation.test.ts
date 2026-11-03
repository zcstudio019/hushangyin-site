import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  aiConfiguration,
  decodeProviderResponse,
  AiError,
  type AiProvider,
  type AiSettings,
} from "../../src/lib/ai/provider";
import {
  compliance,
  validateGrounding,
} from "../../src/features/generation/compliance";
import {
  defaultTemplate,
  type GenerationInput,
} from "../../src/features/generation/config";
import {
  claimTask,
  executeTask,
  recoverExpired,
} from "../../src/features/generation/worker";
import {
  postgresKnowledge,
  assertEvidence,
} from "../../src/features/generation/knowledge";
import { checkFaqRisk } from "../../src/features/geo/risk-evidence";
import {
  articleFacts,
  actOnArticleFacts,
} from "../../src/features/generation/fact-actions";
import {
  createTask,
  taskItem,
  taskAction,
} from "../../src/features/generation/service";
import { workflow, saveContent } from "../../src/features/geo/service";
import { db } from "../../src/lib/db";
import type { Actor } from "../../src/lib/auth/session";
import type { GeneratedResult } from "../../src/features/generation/validation";
const checks: string[] = [];
const record = (s: string) => checks.push(s);
test(`真实隔离${process.env.DATABASE_PROVIDER === "sqlite" ? "SQLite" : "PostgreSQL"} + 确定性测试适配器（非真实 AI 调用）`, async (t) => {
  const sqlite = process.env.DATABASE_PROVIDER === "sqlite";
  if (sqlite) {
    assert.equal(process.env.LOCAL_TEST_MODE, "true");
    assert.ok(
      process.env.DATABASE_URL?.startsWith("file:") &&
        process.env.DATABASE_URL.endsWith("_test.sqlite"),
    );
  } else {
    assert.ok(process.env.TEST_DATABASE_URL);
    assert.ok(
      new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"),
    );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  process.env.NODE_ENV = "test";
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      ...(sqlite ? ["--schema", "prisma/sqlite/schema.prisma"] : []),
    ],
    {
      env: {
        ...process.env,
        ...(sqlite ? { SQLITE_DATABASE_URL: process.env.DATABASE_URL } : {}),
      },
      stdio: "pipe",
    },
  );
  const p: PrismaClient = db(),
    run = "v153-" + randomUUID(),
    userIds: string[] = [],
    questionIds: string[] = [],
    articleIds: string[] = [],
    sourceIds: string[] = [],
    faqIds: string[] = [],
    taskIds: string[] = [];
  const original = {
    keyAlias: process.env.AI_API_KEY,
    enabled: process.env.AI_GENERATION_ENABLED,
    key: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL,
    approved: process.env.AI_EXTERNAL_TRANSMISSION_APPROVED,
  };
  if (sqlite) delete process.env.AI_API_KEY;
  const actor = async (
    role: "SUPER_ADMIN" | "CONTENT_OPERATOR",
  ): Promise<Actor> => {
    const u = await p.adminUser.create({
      data: {
        name: "隔离测试人员",
        email: randomUUID() + "@example.invalid",
        role,
        passwordHash: "not-a-login-credential",
        isActive: true,
      },
    });
    userIds.push(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      departmentId: null,
      mustChangePassword: false,
      sessionVersion: u.sessionVersion,
      sessionId: randomUUID(),
    };
  };
  let root: Actor, op: Actor, other: Actor;
  let input: GenerationInput;
  let result: GeneratedResult;
  const settings: AiSettings = {
    provider: "openai-responses",
    model: "isolated-fixture",
    apiKey: "NOT_A_REAL_API_KEY_NOT_TRANSMITTED",
    baseUrl: "https://example.invalid/v1",
    timeoutMs: 5000,
    maxOutputTokens: 4000,
    inputPrice: null,
    outputPrice: null,
  };
  const provider: AiProvider = {
    async generate() {
      return { result, usage: { input: 10, output: 20, total: 30 } };
    },
  };
  async function enqueue(timeoutMs = 1000) {
    const item = await p.geoGenerationTask.create({
      data: {
        questionId: input.knowledge.question.id,
        createdById: op.id,
        creatorSessionVersion: op.sessionVersion,
        articleType: "CASH_FLOW",
        audience: "合成测试对象",
        depth: "STANDARD",
        templateId: defaultTemplate.id,
        templateVersion: 1,
        providerName: settings.provider,
        modelName: settings.model,
        inputSnapshot: input as unknown as Prisma.InputJsonValue,
        idempotencyKey: randomUUID(),
        activeKey: randomUUID(),
        timeoutMs,
      },
    });
    taskIds.push(item.id);
    return item;
  }
  const keys = [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ];
  const flow = async (
    a: Actor,
    id: string,
    action: string,
    revision?: number,
  ) =>
    workflow(a, "articles", id, {
      action,
      revision:
        revision ??
        (await p.article.findUniqueOrThrow({ where: { id } })).revision,
      note: "隔离系统夹具核验，不代表真实融资内容或真实模型验收。",
      checklist: Object.fromEntries(keys.map((k) => [k, true])),
    });
  try {
    await t.test("缺失配置禁止生成；安全解码与合规规则", () => {
      assert.equal(aiConfiguration({}).available, false);
      assert.ok(
        compliance("包过，不必考虑风险").some((f) => f.severity === "MUST_FIX"),
      );
      assert.throws(() =>
        decodeProviderResponse({
          output: [
            { content: [{ type: "output_text", text: '{"bad":true}' }] },
          ],
        }),
      );
      record("配置缺失、输出校验与合规规则");
    });
    root = await actor("SUPER_ADMIN");
    op = await actor("CONTENT_OPERATOR");
    other = await actor("CONTENT_OPERATOR");
    await p.geoGenerationTemplate.upsert({
      where: { id: defaultTemplate.id },
      create: defaultTemplate,
      update: {},
    });
    const q = await p.geoQuestion.create({
      data: {
        question: run + " 企业有利润却缺现金流，应该先融资还是先改善回款？",
        category: "企业现金流",
        keywords: ["现金流"],
        intent: "DECISION",
        priority: 3,
        status: "OPEN",
      },
    });
    questionIds.push(q.id);
    const pending = await p.faq.create({
      data: {
        question: run + " 未审核问答",
        answer: "未审核内容不能作为事实",
        category: "企业现金流",
        status: "IN_REVIEW",
      },
    });
    faqIds.push(pending.id);
    await t.test("知识检索排除待审核 FAQ", async () => {
      const k = await postgresKnowledge.retrieve(p, q.id);
      assert.equal(
        k.faqs.some((f) => f.id === pending.id),
        false,
      );
      assert.ok(k.warnings.length);
      record("待审核 FAQ 排除与分类/中文检索");
    });
    await t.test(
      "专业判断审核FAQ可检索，缺审核/具体主张/版本变化不能绕过",
      async () => {
        const general = await p.faq.create({
          data: {
            question: run + " 通用知识如何使用？",
            answer: "仅用于隔离软件测试的通用说明，不是金融事实。",
            category: "企业现金流",
            status: "APPROVED",
            sources: [],
            revision: 1,
          },
        });
        faqIds.push(general.id);
        assert.ok(
          !(await postgresKnowledge.retrieve(p, q.id)).faqs.some(
            (f) => f.id === general.id,
          ),
        );
        const assessment = await checkFaqRisk(p, general, {
          level: "LOW",
          confirmed: true,
          basis: "独立测试人员逐条检查本条软件测试说明，不含融资数据。",
          evidence: [],
        });
        await p.contentReview.create({
          data: {
            faqId: general.id,
            revision: 1,
            reviewerId: root.id,
            decision: "APPROVED",
            note: "隔离夹具，不代表真实金融人工审核",
            checklist: JSON.parse(
              JSON.stringify({
                comprehensive: true,
                riskAssessment: assessment,
              }),
            ),
          },
        });
        const k = await postgresKnowledge.retrieve(p, q.id);
        assert.ok(
          k.faqs.some(
            (f) =>
              f.id === general.id && f.evidenceKind === "PROFESSIONAL_REVIEW",
          ),
        );
        await assertEvidence(p, k);
        await p.faq.update({
          where: { id: general.id },
          data: { answer: "某银行最新贷款利率是多少？" },
        });
        assert.ok(
          !(await postgresKnowledge.retrieve(p, q.id)).faqs.some(
            (f) => f.id === general.id,
          ),
        );
        await assert.rejects(() => assertEvidence(p, k));
        await p.faq.update({
          where: { id: general.id },
          data: { answer: general.answer, revision: 2 },
        });
        assert.ok(
          !(await postgresKnowledge.retrieve(p, q.id)).faqs.some(
            (f) => f.id === general.id,
          ),
        );
        record("风险分级专业判断FAQ检索与证据/版本二次校验");
      },
    );
    const approved = await p.faq.create({
      data: {
        question: run + " 已审核的零号版本问答",
        answer: "这是已审核知识检索的软件夹具，不是融资事实。",
        category: "企业现金流",
        revision: 0,
        status: "APPROVED",
        sources: [
          {
            title: "隔离资料",
            url: "https://example.invalid/fixture",
            checkedAt: new Date().toISOString().slice(0, 10),
          },
        ],
      },
    });
    faqIds.push(approved.id);
    await p.contentReview.create({
      data: {
        faqId: approved.id,
        revision: 0,
        reviewerId: root.id,
        decision: "APPROVED",
        note: "隔离夹具人工审核标记",
        checklist: {},
      },
    });
    await t.test("已审核 FAQ 可用且兼容导入数据的零号版本", async () => {
      const k = await postgresKnowledge.retrieve(p, q.id);
      assert.ok(k.faqs.some((f) => f.id === approved.id && f.revision === 0));
      record("已审核 FAQ 检索兼容零号版本");
    });
    const reference = await p.articleSource.create({
      data: {
        title: "仅隔离数据库的合成资料",
        sourceUrl: "https://example.invalid/fixture",
        excerpt: "这是软件验证夹具，不是已核验金融知识。",
        verifiedAt: new Date(),
        verifiedById: root.id,
      },
    });
    sourceIds.push(reference.id);
    input = {
      knowledge: await postgresKnowledge.retrieve(p, q.id),
      template: {
        id: defaultTemplate.id,
        name: defaultTemplate.name,
        version: 1,
        content: defaultTemplate.templateContent,
      },
      articleType: "CASH_FLOW",
      audience: "合成测试对象",
      depth: "STANDARD",
      supplement: "软件测试夹具",
      requestFingerprint: run,
    };
    result = {
      title: "合成系统测试文章",
      summary: "隔离环境中验证草稿保存与审核。",
      markdown:
        "## 核心问题\n这是软件验证夹具，不是融资建议。\n\n## 风险提示\n应评估还款能力和还款风险。",
      seoTitle: "合成搜索标题",
      metaDescription: "合成搜索描述",
      keywords: ["合成测试"],
      relatedQuestionIds: [q.id],
      faqIds: [approved.id],
      references: [
        {
          sourceId: reference.id,
          paragraph: "这是软件验证夹具，不是融资建议。",
        },
      ],
      verificationItems: ["这不是模型生成的真实融资内容。"],
    };
    await t.test("严格结构输出解码、拒绝与不完整响应处理", () => {
      const body = {
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(result) }] },
        ],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };
      assert.equal(decodeProviderResponse(body).usage.total, 30);
      assert.throws(() => decodeProviderResponse({ status: "incomplete" }), {
        code: "OUTPUT_LIMIT",
      });
      assert.throws(
        () =>
          decodeProviderResponse({
            output: [{ content: [{ type: "refusal" }] }],
          }),
        { code: "REFUSED" },
      );
      const found = compliance(
        "银行合作 最新利率3% 贷款额度100万 最新政策 客户案例 包装资料 还款风险。",
        ["测试"],
        true,
      );
      assert.ok(
        ["BANK_RELATION", "RATE", "AMOUNT", "POLICY", "CASE", "ADVICE"].every(
          (code) => found.some((f) => f.code === code),
        ),
      );
      record("严格结构输出解码与合规分类（仅本地响应夹具）");
    });
    await t.test("来源和关联 ID 不可伪造", () => {
      assert.throws(() =>
        validateGrounding({ ...result, faqIds: [pending.id] }, input.knowledge),
      );
      assert.throws(() =>
        validateGrounding(
          {
            ...result,
            references: [{ sourceId: "unknown", paragraph: "不存在" }],
          },
          input.knowledge,
        ),
      );
      record("来源段落与知识 ID 白名单校验");
    });
    await t.test("同一请求去重、本人任务隔离及缺失配置拒绝", async () => {
      process.env.AI_GENERATION_ENABLED = "false";
      const v = {
        questionId: q.id,
        templateId: defaultTemplate.id,
        templateVersion: 1,
        articleType: "CASH_FLOW",
        audience: "合成对象",
        depth: "STANDARD",
        supplement: "",
        idempotencyKey: randomUUID(),
        approvedNonSensitive: true,
      };
      await assert.rejects(() => createTask(op, v), {
        code: "AI_NOT_CONFIGURED",
      });
      process.env.AI_GENERATION_ENABLED = "true";
      process.env.OPENAI_API_KEY = settings.apiKey;
      process.env.AI_MODEL = settings.model;
      process.env.AI_EXTERNAL_TRANSMISSION_APPROVED = "true";
      const a = await createTask(op, v);
      taskIds.push(a.id);
      assert.equal((await createTask(op, v)).id, a.id);
      assert.equal(
        (await createTask(op, { ...v, idempotencyKey: randomUUID() })).id,
        a.id,
      );
      await assert.rejects(() => taskItem(other, a.id), { status: 404 });
      await taskAction(op, a.id, "cancel");
      record("幂等、活跃去重、任务行级隔离、缺失配置拒绝");
    });
    let completedId = "";
    await t.test("并发领取不重复；Markdown 原子保存现有文章", async () => {
      await enqueue();
      const claims = await Promise.all([claimTask(p), claimTask(p)]);
      assert.equal(claims.filter(Boolean).length, 1);
      const c = claims.find(Boolean)!;
      await executeTask(p, c, { provider, settings });
      const task = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: c.id },
      });
      assert.equal(task.status, "SUCCEEDED");
      assert.ok(task.outputArticleId);
      completedId = task.outputArticleId!;
      articleIds.push(completedId);
      assert.equal(
        (await p.article.findUniqueOrThrow({ where: { id: completedId } }))
          .status,
        "DRAFT",
      );
      assert.equal(
        await p.articleVersion.count({ where: { articleId: completedId } }),
        1,
      );
      assert.equal(
        (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
        "PLANNED",
      );
      const initialArticle = await p.article.findUniqueOrThrow({
        where: { id: completedId },
      });
      const manualContent =
        initialArticle.content + "\n\n人工补充的软件测试说明，不是融资事实。";
      await saveContent(
        op,
        "articles",
        {
          title: initialArticle.title,
          slug: initialArticle.slug,
          summary: initialArticle.summary,
          content: manualContent,
          category: initialArticle.category,
          tags: initialArticle.tags,
          sources: initialArticle.sources,
          relatedIds: [],
          aiAssisted: true,
          revision: initialArticle.revision,
        },
        completedId,
      );
      await executeTask(p, c, { provider, settings });
      const afterLate = await p.article.findUniqueOrThrow({
        where: { id: completedId },
      });
      assert.equal(afterLate.content, manualContent);
      assert.equal(afterLate.revision, 2);
      assert.equal(await p.article.count({ where: { id: completedId } }), 1);
      record("数据库并发领取、原子保存、版本与问题关联（测试适配器）");
    });
    await t.test(
      "来源同日变更会阻止旧草稿审核，编辑保存后必须重新审核",
      async () => {
        await p.articleSource.update({
          where: { id: reference.id },
          data: {
            verifiedAt: new Date(Date.now() - 1),
            excerpt: "这是更新后的隔离软件夹具，不是融资事实。",
          },
        });
        await assert.rejects(() => flow(op, completedId, "submit"), {
          code: "COMPLIANCE_REQUIRED",
        });
        const a = await p.article.findUniqueOrThrow({
          where: { id: completedId },
        });
        await saveContent(
          op,
          "articles",
          {
            title: a.title,
            slug: a.slug,
            summary: a.summary,
            content: a.content,
            category: a.category,
            tags: a.tags,
            sources: a.sources,
            relatedIds: [],
            aiAssisted: false,
            revision: a.revision,
            seoTitle: a.seoTitle || "",
            metaDescription: a.metaDescription || "",
          },
          a.id,
        );
        const saved = await p.article.findUniqueOrThrow({
          where: { id: completedId },
        });
        assert.equal(saved.revision, 3);
        assert.equal(saved.aiAssisted, true);
        assert.equal(saved.status, "DRAFT");
        // Existing queued snapshots must be refreshed rather than silently using changed evidence.
        input.knowledge = await postgresKnowledge.retrieve(p, q.id);
        record("同日来源变更拦截、既有编辑器保存新版本与强制保留生成标记");
      },
    );
    await t.test("必须独立人工审核；发布/下线重新计算问题状态", async () => {
      await assert.rejects(() => flow(op, completedId, "publish"), {
        status: 403,
      });
      await assert.rejects(() => flow(root, completedId, "publish"), {
        code: "APPROVAL_REQUIRED",
      });
      await flow(op, completedId, "submit");
      await flow(root, completedId, "approve");
      await flow(root, completedId, "publish");
      assert.equal(
        (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
        "ANSWERED",
      );
      assert.equal(
        (await p.article.findUniqueOrThrow({ where: { id: completedId } }))
          .publishedRevision,
        3,
      );
      const a = await p.article.create({
        data: {
          title: "第二份合成解答",
          slug: run,
          summary: "合成",
          content: "合成",
          category: "企业现金流",
          revision: 1,
          isLive: true,
          publishedSnapshot: { title: "合成" },
        },
      });
      articleIds.push(a.id);
      await p.articleQuestionRelation.create({
        data: { articleId: a.id, questionId: q.id },
      });
      await flow(root, completedId, "offline");
      assert.equal(
        (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
        "ANSWERED",
      );
      await flow(root, a.id, "offline");
      assert.equal(
        (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
        "PLANNED",
      );
      record(
        "真实 PostgreSQL 审核权限、发布/下线多对多状态一致性（非真实 AI）",
      );
    });
    await t.test("超时有限重试；失败不产生文章", async () => {
      await enqueue(30);
      const c = (await claimTask(p))!;
      await executeTask(p, c, {
        provider: { generate: () => new Promise(() => {}) },
        settings,
      });
      let state = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: c.id },
      });
      assert.equal(state.status, "QUEUED");
      assert.equal(state.errorCode, "TIMEOUT");
      assert.equal(state.outputArticleId, null);
      await p.geoGenerationTask.update({
        where: { id: c.id },
        data: { availableAt: new Date(), attempts: 2 },
      });
      const last = (await claimTask(p))!;
      await executeTask(p, last, {
        provider: {
          async generate() {
            throw new AiError("NETWORK_ERROR", "合成网络故障", true);
          },
        },
        settings,
      });
      state = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: c.id },
      });
      assert.equal(state.status, "FAILED");
      assert.equal(state.attempts, 3);
      record("超时、有限重试与失败无残缺文章");
    });
    await t.test("执行器崩溃后租约恢复与取消后禁止迟到写入", async () => {
      await enqueue();
      const c = (await claimTask(p))!;
      await p.geoGenerationTask.update({
        where: { id: c.id },
        data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      assert.equal(await recoverExpired(p), 1);
      await p.geoGenerationTask.update({
        where: { id: c.id },
        data: { availableAt: new Date() },
      });
      const next = (await claimTask(p))!;
      await taskAction(op, next.id, "cancel");
      await executeTask(p, next, { provider, settings });
      const state = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: next.id },
      });
      assert.equal(state.status, "CANCELLED");
      assert.equal(state.outputArticleId, null);
      record("失效租约恢复与取消迟到写入抑制");
    });
    await t.test("知识失效时不调用模型；撤销账号权限后不保存", async () => {
      await enqueue();
      const c = (await claimTask(p))!;
      await p.articleSource.update({
        where: { id: reference.id },
        data: { isActive: false },
      });
      let calls = 0;
      await executeTask(p, c, {
        provider: {
          async generate() {
            calls++;
            return provider.generate(
              input,
              settings,
              new AbortController().signal,
            );
          },
        },
        settings,
      });
      assert.equal(calls, 0);
      assert.equal(
        (await p.geoGenerationTask.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
        "FAILED",
      );
      await p.articleSource.update({
        where: { id: reference.id },
        data: { isActive: true },
      });
      await p.adminUser.update({
        where: { id: root.id },
        data: { sessionVersion: { increment: 1 } },
      });
      root.sessionVersion++;
      await taskAction(root, c.id, "retry");
      assert.equal(
        (await p.geoGenerationTask.findUniqueOrThrow({ where: { id: c.id } }))
          .creatorSessionVersion,
        op.sessionVersion,
      );
      const retry = (await claimTask(p))!;
      await executeTask(p, retry, { provider, settings });
      const retried = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: c.id },
      });
      assert.equal(retried.status, "SUCCEEDED");
      assert.ok(retried.outputArticleId);
      articleIds.push(retried.outputArticleId!);
      record("失败任务刷新知识后安全重试成功（测试适配器）");
      await enqueue();
      const d = (await claimTask(p))!;
      await p.adminUser.update({
        where: { id: op.id },
        data: { isActive: false },
      });
      await executeTask(p, d, { provider, settings });
      assert.equal(
        (await p.geoGenerationTask.findUniqueOrThrow({ where: { id: d.id } }))
          .errorCode,
        "PERMISSION_CHANGED",
      );
      record("引用失效与账号停用即时阻止生成");
    });
    await t.test("受控内部资料不进入AI知识检索", async () => {
      const q = await p.geoQuestion.create({
        data: {
          question: run + " 内部资料隔离验证",
          category: "融资规划",
          keywords: [],
          priority: 3,
        },
      });
      questionIds.push(q.id);
      const source = await p.articleSource.create({
        data: {
          title: run + " 内部资料",
          sourceUrl: "internal:isolated-fixture-v1",
          sourceType: "INTERNAL_BANK",
          excerpt: "仅作受控资料测试，不得发送第三方模型。",
          verifiedAt: new Date(),
          verifiedById: root.id,
          isActive: true,
        },
      });
      sourceIds.push(source.id);
      const found = await postgresKnowledge.retrieve(p, q.id);
      assert.equal(
        found.references.some(
          (r) => r.id === source.id || r.url.startsWith("internal:"),
        ),
        false,
      );
      record("内部资料目录被显式排除，未向模型发送");
    });
    await t.test(
      "兼容网关租约中断停止自动重发，手动重试须确认费用",
      async () => {
        const owner = await actor("CONTENT_OPERATOR");
        const task = await p.geoGenerationTask.create({
          data: {
            questionId: input.knowledge.question.id,
            createdById: owner.id,
            creatorSessionVersion: owner.sessionVersion,
            status: "RUNNING",
            providerName: "openai-compatible",
            modelName: "gpt-6-sol",
            articleType: "CASH_FLOW",
            audience: "隔离测试",
            depth: "STANDARD",
            templateId: defaultTemplate.id,
            templateVersion: 1,
            inputSnapshot: input as unknown as Prisma.InputJsonValue,
            idempotencyKey: randomUUID(),
            activeKey: randomUUID(),
            attempts: 1,
            maxAttempts: 3,
            leaseToken: randomUUID(),
            leaseUntil: new Date(Date.now() - 1000),
          },
        });
        taskIds.push(task.id);
        await p.generationCallLog.create({
          data: {
            taskId: task.id,
            attempt: 1,
            provider: "openai-compatible",
            model: "gpt-6-sol",
            status: "RUNNING",
          },
        });
        await recoverExpired(p);
        const interrupted = await p.geoGenerationTask.findUniqueOrThrow({
          where: { id: task.id },
        });
        assert.equal(interrupted.status, "FAILED");
        assert.equal(interrupted.attempts, 1);
        assert.equal(interrupted.outputArticleId, null);
        await assert.rejects(
          () => taskAction(owner, task.id, "retry"),
          /额外Token费用/,
        );
        const old = {
          provider: process.env.AI_PROVIDER,
          key: process.env.AI_API_KEY,
          model: process.env.AI_MODEL,
        };
        try {
          process.env.AI_PROVIDER = "openai-compatible";
          process.env.AI_API_KEY = "NOT_A_REAL_GATEWAY_KEY_FOR_ISOLATED_TEST";
          process.env.AI_MODEL = "gpt-6-sol";
          await taskAction(owner, task.id, "retry", true);
          assert.equal(
            (
              await p.geoGenerationTask.findUniqueOrThrow({
                where: { id: task.id },
              })
            ).status,
            "QUEUED",
          );
        } finally {
          if (old.provider === undefined) delete process.env.AI_PROVIDER;
          else process.env.AI_PROVIDER = old.provider;
          if (old.key === undefined) delete process.env.AI_API_KEY;
          else process.env.AI_API_KEY = old.key;
          if (old.model === undefined) delete process.env.AI_MODEL;
          else process.env.AI_MODEL = old.model;
        }
        record(
          "真实隔离库验证未知计费不自动重发、明确确认后才重新排队；没有调用模型",
        );
      },
    );
    await t.test(
      "文章逐项依据复核：内部资料无需URL，版本与资料变化重新阻断",
      async () => {
        const factAuthor = await actor("CONTENT_OPERATOR"),
          factReviewer = await actor("SUPER_ADMIN");
        const a = await saveContent(factAuthor, "articles", {
          title: "隔离资料核验",
          slug: "facts-" + randomUUID(),
          summary: "仅为软件规则测试，不是金融事实。",
          content: "测试资料准备满3天。请评估还款风险。",
          category: "融资风险与合规",
          tags: [],
          sources: [],
          relatedIds: [],
          aiAssisted: true,
        });
        articleIds.push(a.id);
        await p.article.update({
          where: { id: a.id },
          data: { generationMetadata: { model: "隔离软件夹具（未调用AI）" } },
        });
        const catalog = await p.articleSource.create({
          data: {
            title: "隔离软件假设资料（不是银行产品依据）",
            sourceType: "INTERNAL_BANK",
            sourceUrl: "internal:TEST-FACT/1",
            excerpt:
              "本夹具假设测试资料准备满3天，仅用于软件规则验证，不支持实际金融条件。",
            verifiedById: factReviewer.id,
            verifiedAt: new Date(),
            isActive: true,
          },
        });
        sourceIds.push(catalog.id);
        const state = await articleFacts(factAuthor, a.id),
          f = state.findings.find((f) => f.code === "FACT_EVIDENCE")!;
        assert.ok(f);
        const request = await actOnArticleFacts(factAuthor, a.id, {
          action: "request",
          revision: a.revision,
          findingKey: f.key,
          note: "请独立核对隔离软件夹具的假设和资料版本。",
        });
        const requestId = (request as { id: string }).id;
        await assert.rejects(
          () =>
            actOnArticleFacts(factAuthor, a.id, {
              action: "decide",
              revision: a.revision,
              requestId,
              accepted: true,
              note: "作者不能替代独立审核人员。",
            }),
          { status: 403 },
        );
        const approved = await actOnArticleFacts(factReviewer, a.id, {
          action: "decide",
          revision: a.revision,
          requestId,
          accepted: true,
          note: "已逐项核对本条假设与受控软件夹具，仅用于隔离测试。",
          risk: {
            level: "MEDIUM",
            confirmed: true,
            basis: "已核对软件夹具定义及版本，不作实际金融核验结论。",
            evidence: [
              {
                claim: f.claim,
                catalogId: catalog.id,
                catalogVersion: catalog.updatedAt.toISOString(),
              },
            ],
          },
        });
        assert.ok(
          !(approved as { findings: { severity: string }[] }).findings.some(
            (f) => f.severity === "MUST_FIX",
          ),
        );
        await p.articleSource.update({
          where: { id: catalog.id },
          data: { excerpt: "软件假设已修改，旧核验结论不得继续使用。" },
        });
        assert.ok(
          (await articleFacts(factAuthor, a.id)).findings.some(
            (f) => f.code === "FACT_EVIDENCE" && f.severity === "MUST_FIX",
          ),
        );
        await assert.rejects(
          () =>
            actOnArticleFacts(factAuthor, a.id, {
              action: "check",
              revision: a.revision + 1,
            }),
          { code: "STALE_VERSION" },
        );
        record(
          "文章内部依据版本绑定、独立权限及证据变更失效（隔离假设，不是真实金融资料）",
        );
      },
    );
  } finally {
    await p.geoGenerationTask.deleteMany({ where: { id: { in: taskIds } } });
    await p.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await p.geoQuestion.updateMany({
      where: { id: { in: questionIds } },
      data: { articleId: null },
    });
    await p.contentReview.deleteMany({
      where: { articleId: { in: articleIds } },
    });
    await p.articleVersion.deleteMany({
      where: { articleId: { in: articleIds } },
    });
    await p.article.deleteMany({ where: { id: { in: articleIds } } });
    await p.articleSource.deleteMany({ where: { id: { in: sourceIds } } });
    await p.contentReview.deleteMany({ where: { faqId: { in: faqIds } } });
    await p.faq.deleteMany({ where: { id: { in: faqIds } } });
    await p.geoQuestion.deleteMany({ where: { id: { in: questionIds } } });
    await p.adminUser.deleteMany({ where: { id: { in: userIds } } });
    process.env.AI_GENERATION_ENABLED = original.enabled;
    process.env.OPENAI_API_KEY = original.key;
    if (original.keyAlias === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = original.keyAlias;
    process.env.AI_MODEL = original.model;
    process.env.AI_EXTERNAL_TRANSMISSION_APPROVED = original.approved;
    await p.$disconnect();
    mkdirSync(sqlite ? "test-results/v16" : "test-results/v153", {
      recursive: true,
    });
    writeFileSync(
      sqlite
        ? "test-results/v16/isolated.json"
        : "test-results/v153/isolated.json",
      JSON.stringify(
        {
          mode: `真实隔离${sqlite ? "SQLite" : "PostgreSQL"} + 确定性适配器，未调用模型`,
          checks,
          syntheticDataCleaned: true,
        },
        null,
        2,
      ),
    );
  }
});
