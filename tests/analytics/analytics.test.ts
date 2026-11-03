import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  googleDailyCsv,
  searchAdapter,
} from "../../src/features/analytics/search-adapters";
import { utmSchema } from "../../src/features/analytics/validation";
import { can } from "../../src/lib/auth/permissions";
import { localDay } from "../../src/features/analytics/config";
test("上海日期在UTC16点切换，不按服务器UTC日统计", () => {
  assert.equal(localDay(new Date("2026-11-02T15:59:59Z")), "2026-11-02");
  assert.equal(localDay(new Date("2026-11-02T16:00:00Z")), "2026-11-03");
});

test("数据库不可用时真实API拒绝且不暴露连接详情", () => {
  const r = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/analytics/unavailable.ts",
    ],
    { env: process.env, stdio: "pipe" },
  );
  assert.equal(r.status, 0, "数据库不可用边界验证失败，连接详情不输出");
});

test("搜索平台实际日期列格式、中文映射与非法数据拒绝", () => {
  const csv = "Date,Clicks,Impressions,CTR,Position\n2026-10-01,2,100,2%,8";
  assert.equal(googleDailyCsv.parse(csv)[0].clicks, 2);
  assert.equal(
    googleDailyCsv.parse(
      "\ufeff日期,点击次数,展示次数,点击率,排名\n2026-10-01,2,100,2%,8",
    )[0].averagePosition,
    8,
  );
  for (const bad of [
    csv + "\n2026-10-01,2,100,2%,8",
    csv.replace("2,100", "200,100"),
    csv.replace("2026-10-01", "2026-02-30"),
    csv.replace("Date", "Query"),
    csv.replace("2%", "90%"),
  ])
    assert.throws(() => googleDailyCsv.parse(bad));
  assert.throws(() => searchAdapter("BING"));
  assert.throws(() => searchAdapter("BAIDU"));
  assert.equal(
    utmSchema.safeParse({ utm_source: "13800000000" }).success,
    false,
  );
  assert.equal(can({ role: "CONTENT_OPERATOR" }, "analytics.read"), true);
  for (const role of ["FINANCING_ADVISOR", "CONTENT_REVIEWER"] as const)
    assert.equal(can({ role }, "analytics.read"), false);
  assert.equal(can({ role: "CONTENT_OPERATOR" }, "analytics.manage"), false);
});

test(
  "真实隔离PostgreSQL：幂等迁移、访问去重、咨询事务归因、导入和保留策略",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(url.hostname === "127.0.0.1" && url.pathname.endsWith("_test"));
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
    for (let i = 0; i < 2; i++)
      assert.equal(
        spawnSync(
          process.execPath,
          ["node_modules/prisma/build/index.js", "migrate", "deploy"],
          { env: process.env, stdio: "pipe" },
        ).status,
        0,
        "迁移失败，连接详情不输出",
      );
    const { db } = await import("../../src/lib/db"),
      p = db();
    const {
      newAnalyticsSession,
      anonymousSession,
      signAnalytics,
      readAnalytics,
    } = await import("../../src/features/analytics/tokens");
    const { recordEvent } = await import("../../src/features/analytics/events");
    const { createConsultation } =
      await import("../../src/features/leads/service");
    const { saveConnection, importSearch, requestSearchSync } =
      await import("../../src/features/analytics/search");
    const { retainAnalytics } =
      await import("../../src/features/analytics/retention");
    const { saveVisibility, visibilityData } =
      await import("../../src/features/analytics/visibility");
    const user = await p.adminUser.create({
      data: {
        name: "隔离分析测试",
        email: randomUUID() + "@example.invalid",
        passwordHash: "not-a-usable-password",
        role: "SUPER_ADMIN",
      },
    });
    const actor = { ...user, sessionId: "isolated-test" };
    const article = await p.article.create({
      data: {
        title: "隔离分析文章",
        slug: "analytics-" + randomUUID(),
        summary: "隔离测试",
        content: "基础金融知识",
        category: "融资风险与合规",
        isLive: true,
        publishedAt: new Date(),
        publishedRevision: 1,
        publishedSnapshot: {
          title: "隔离分析文章",
          category: "融资风险与合规",
        },
      },
    });
    const input = {
      name: "虚构分析测试",
      phone: "13800000941",
      customerType: "ENTERPRISE" as const,
      financingAmount: "50万元以内" as const,
      sourcePage: "/contact/",
      consent: true as const,
    };
    const ids: string[] = [],
      connections: string[] = [];
    const token = newAnalyticsSession(),
      session = anonymousSession(token.token)!;
    const context = signAnalytics({
      type: "CONTENT",
      kind: "ARTICLE",
      id: article.id,
      path: "/insights/" + article.slug + "/",
      channel: "DIRECT",
      utm: {},
      measurementKey: session.key,
      measurementExpiresAt: token.expiresAt,
      exp: token.expiresAt,
    });
    try {
      await t.test("授权凭证、防篡改及失效", () => {
        assert.ok(session.key);
        assert.equal(anonymousSession(token.token + "x"), null);
        assert.equal(
          readAnalytics(
            signAnalytics({ type: "ANON", exp: Date.now() - 1 }),
            "ANON",
          ),
          null,
        );
      });
      await t.test("事件重试与匿名访问次数去重", async () => {
        const event = {
          kind: "ARTICLE" as const,
          id: article.id,
          type: "PV" as const,
          eventId: randomUUID(),
          analyticsToken: token.token,
        };
        await p.$transaction((tx) => recordEvent(tx, event));
        assert.equal(
          (await p.$transaction((tx) => recordEvent(tx, event))).duplicate,
          true,
        );
        await p.$transaction((tx) =>
          recordEvent(tx, { ...event, eventId: randomUUID() }),
        );
        const m = await p.contentDailyMetric.findFirstOrThrow({
          where: { articleId: article.id },
        });
        assert.equal(m.pv, 2);
        assert.equal(m.visits, 1);
        await assert.rejects(() =>
          p.$transaction((tx) =>
            recordEvent(tx, {
              ...event,
              id: "nonpublic",
              eventId: randomUUID(),
            }),
          ),
        );
      });
      await t.test(
        "成功咨询与授权和归因同事务；重复请求无额外写入",
        async () => {
          const a = await createConsultation({
            ...input,
            attributionToken: context,
          });
          ids.push(a.reference);
          assert.equal(
            await p.consent.count({ where: { leadId: a.reference } }),
            1,
          );
          const source = await p.leadAttribution.findUniqueOrThrow({
            where: { leadId: a.reference },
          });
          assert.equal(source.articleId, article.id);
          assert.equal(source.confidence, "SIGNED_CONTEXT");
          assert.equal(source.measured, true);
          await assert.rejects(() =>
            createConsultation({ ...input, attributionToken: context }),
          );
          const b = await createConsultation({
            ...input,
            phone: "13800000942",
            attributionToken: context,
          });
          ids.push(b.reference);
          assert.equal(
            (
              await p.contentDailyMetric.findFirstOrThrow({
                where: { articleId: article.id },
              })
            ).convertedVisits,
            1,
          );
        },
      );
      await t.test("直接访问与篡改凭证均不错误归因GEO", async () => {
        for (const [phone, attributionToken] of [
          ["13800000943", undefined],
          ["13800000944", context + "x"],
        ]) {
          const a = await createConsultation({
            ...input,
            phone: phone!,
            attributionToken,
          });
          ids.push(a.reference);
          const row = await p.leadAttribution.findUniqueOrThrow({
            where: { leadId: a.reference },
          });
          assert.equal(row.articleId, null);
          assert.equal(row.measured, false);
        }
      });
      await t.test(
        "报表区分真实零与缺失、低样本隐藏比例、足量样本才计算，咨询趋势按上海日读取",
        async () => {
          const { analyticsReport } =
            await import("../../src/features/analytics/report");
          await p.leadAttribution.update({
            where: { leadId: ids[0] },
            data: { createdAt: new Date(localDay() + "T00:01:00+08:00") },
          });
          let report = await analyticsReport(actor, { days: "30" }),
            row = report.ranking.find((r) => r.id === article.id)!;
          assert.equal(row.pv, 2);
          assert.equal(row.clicks, 0);
          assert.equal(row.conversion, null);
          assert.ok(report.lastUpdatedAt);
          assert.ok(
            report.trend.some((d) => d.consults !== null && d.consults >= 2),
          );
          assert.ok(
            report.trend.find((d) => d.day === localDay())!.consults! >= 2,
          );
          assert.ok(report.trend.some((d) => d.pv === null));
          for (let i = 0; i < 19; i++)
            await p.$transaction((tx) =>
              recordEvent(tx, {
                kind: "ARTICLE",
                id: article.id,
                type: "PV",
                eventId: randomUUID(),
                analyticsToken: newAnalyticsSession().token,
              }),
            );
          report = await analyticsReport(actor, { days: "30" });
          row = report.ranking.find((r) => r.id === article.id)!;
          assert.equal(row.visits, 20);
          assert.equal(row.conversion, 1 / 20);
          assert.equal(row.lowSample, false);
        },
      );
      await t.test(
        "CSV预览确认、幂等跳过、冲突整批回滚与未授权同步阻塞",
        async () => {
          const c = await saveConnection(actor, {
            platform: "GOOGLE",
            siteUrl: "https://example.invalid/",
            label: "隔离夹具，非真实平台数据",
            isActive: true,
          });
          connections.push(c.id);
          const csv =
            "Date,Clicks,Impressions,CTR,Position\n2026-10-01,2,100,2%,8";
          const preview = await importSearch(actor, {
            connectionId: c.id,
            csv,
          });
          assert.equal(
            await p.searchPerformanceMetric.count({
              where: { connectionId: c.id },
            }),
            0,
          );
          const done = await importSearch(actor, {
            connectionId: c.id,
            csv,
            confirm: true,
            previewToken: preview.previewToken,
          });
          assert.equal("added" in done && done.added, 1);
          const again = await importSearch(actor, { connectionId: c.id, csv });
          const skipped = await importSearch(actor, {
            connectionId: c.id,
            csv,
            confirm: true,
            previewToken: again.previewToken,
          });
          assert.equal("skipped" in skipped && skipped.skipped, 1);
          const conflict =
            csv.replace("2,100,2%", "3,100,3%") + "\n2026-10-02,1,100,1%,7";
          const pre = await importSearch(actor, {
            connectionId: c.id,
            csv: conflict,
          });
          await assert.rejects(() =>
            importSearch(actor, {
              connectionId: c.id,
              csv: conflict,
              confirm: true,
              previewToken: pre.previewToken,
            }),
          );
          assert.equal(
            await p.searchPerformanceMetric.count({
              where: { connectionId: c.id },
            }),
            1,
          );
          assert.equal(
            (await requestSearchSync(actor, c.id)).status,
            "BLOCKED",
          );
        },
      );
      await t.test(
        "人工观察区分三个信号，阻止隐私资料与未来日期，审核员无分析权限",
        async () => {
          const fixture = {
            platform: "隔离软件夹具",
            query: "软件测试问题，不是实际AI结果",
            observedOn: "2026-10-01",
            brandMention: false,
            siteCitation: false,
            recommendation: false,
            articleId: null,
            evidenceUrl: "https://example.invalid/software-fixture",
            evidenceNote: "仅验证隔离库读写，不是已核验的真实平台结果。",
            verified: true,
          };
          const saved = await saveVisibility(actor, fixture);
          const rows = await visibilityData(actor);
          assert.ok(
            rows.some(
              (r) =>
                r.id === saved.id &&
                !r.brandMention &&
                !r.siteCitation &&
                !r.recommendation,
            ),
          );
          await assert.rejects(() =>
            saveVisibility(actor, { ...fixture, query: "13800000000" }),
          );
          await assert.rejects(() =>
            saveVisibility(actor, { ...fixture, observedOn: "2099-01-01" }),
          );
          await assert.rejects(() =>
            visibilityData({ ...actor, role: "CONTENT_REVIEWER" }),
          );
        },
      );
      await t.test("超期事件及会话链接清理不删除客户线索", async () => {
        await p.contentEvent.updateMany({
          where: { articleId: article.id },
          data: { createdAt: new Date(Date.now() - 31 * 86400000) },
        });
        await p.leadAttribution.updateMany({
          where: { leadId: { in: ids } },
          data: { createdAt: new Date(Date.now() - 31 * 86400000) },
        });
        await p.$transaction((tx) => retainAnalytics(tx));
        assert.equal(
          await p.contentEvent.count({ where: { articleId: article.id } }),
          0,
        );
        assert.equal(await p.lead.count({ where: { id: { in: ids } } }), 4);
        assert.equal(
          await p.leadAttribution.count({
            where: { leadId: { in: ids }, sessionKey: { not: null } },
          }),
          0,
        );
      });
    } finally {
      await p.contentEvent.deleteMany({ where: { articleId: article.id } });
      await p.contentDailyMetric.deleteMany({
        where: { articleId: article.id },
      });
      await p.consent.deleteMany({ where: { leadId: { in: ids } } });
      await p.lead.deleteMany({ where: { id: { in: ids } } });
      await p.analyticsSyncJob.deleteMany({
        where: { connectionId: { in: connections } },
      });
      await p.searchPerformanceMetric.deleteMany({
        where: { connectionId: { in: connections } },
      });
      await p.searchPlatformConnection.deleteMany({
        where: { id: { in: connections } },
      });
      await p.article.delete({ where: { id: article.id } });
      await p.geoVisibilityObservation.deleteMany({
        where: { actorId: user.id },
      });
      await p.auditLog.deleteMany({ where: { actorId: user.id } });
      await p.adminUser.delete({ where: { id: user.id } });
      await p.$disconnect();
    }
  },
);
