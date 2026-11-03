// Only the explicit fixture saved by this acceptance run; never clear tables or match real names.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const manifest = JSON.parse(
  fs.readFileSync("test-results/analytics-acceptance/result.json", "utf8"),
);
assert.ok(/^V154-E2E-[a-f0-9-]{36}$/.test(manifest.marker));
assert.ok(Array.isArray(manifest.eventIds) && manifest.eventIds.length < 30);
const p = new PrismaClient({ log: [] });
try {
  const result = await p.$transaction(async (tx) => {
    const lead = manifest.fixtureLeadId
      ? await tx.lead.findUnique({
          where: { id: manifest.fixtureLeadId },
          include: { attribution: true },
        })
      : null;
    if (manifest.fixtureLeadId && !lead) {
      assert.equal(
        await tx.contentEvent.count({
          where: { id: { in: manifest.eventIds } },
        }),
        0,
        "线索不存在但仍有事件，停止自动清理",
      );
      return { alreadyCleaned: true };
    }
    if (lead) {
      assert.ok(
        lead.remark?.includes(
          manifest.marker + "；合成软件测试资料，不是真实客户。",
        ),
      );
      assert.equal(lead.attribution?.articleId, manifest.article.id);
    }
    const events = await tx.contentEvent.findMany({
      where: { id: { in: manifest.eventIds } },
    });
    assert.equal(
      events.length,
      manifest.eventIds.length,
      "原始事件缺失或已超期，停止以免错误扣减聚合",
    );
    if (lead)
      assert.ok(
        events.every((e) => e.sessionKey === lead.attribution?.sessionKey),
        "事件不是本次合成线索的授权会话，停止",
      );
    const groups = new Map();
    for (const e of events) {
      const key = JSON.stringify([e.day, e.contentKey, e.channel]);
      const g = groups.get(key) || {
        day: e.day,
        contentKey: e.contentKey,
        channel: e.channel,
        pv: 0,
        visits: 0,
        clicks: 0,
        convertedVisits: 0,
      };
      const field = {
        PV: "pv",
        VISIT: "visits",
        CLICK: "clicks",
        CONVERSION: "convertedVisits",
      }[e.type];
      assert.ok(field);
      g[field]++;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const where = {
          day_contentKey_channel: {
            day: g.day,
            contentKey: g.contentKey,
            channel: g.channel,
          },
        },
        old = await tx.contentDailyMetric.findUniqueOrThrow({ where });
      for (const key of ["pv", "visits", "clicks", "convertedVisits"])
        assert.ok(old[key] >= g[key], "聚合不一致，停止清理");
      const row = await tx.contentDailyMetric.update({
        where,
        data: {
          pv: { decrement: g.pv },
          visits: { decrement: g.visits },
          clicks: { decrement: g.clicks },
          convertedVisits: { decrement: g.convertedVisits },
        },
      });
      if (
        row.pv === 0 &&
        row.visits === 0 &&
        row.clicks === 0 &&
        row.convertedVisits === 0
      )
        await tx.contentDailyMetric.delete({ where });
    }
    await tx.contentEvent.deleteMany({
      where: { id: { in: manifest.eventIds } },
    });
    if (lead) {
      const key = createHmac("sha256", process.env.RATE_LIMIT_SECRET)
        .update(
          JSON.stringify([lead.phone, lead.customerType, lead.financingAmount]),
        )
        .digest("hex");
      await tx.submissionGuard.deleteMany({ where: { key } });
      await tx.consent.deleteMany({ where: { leadId: lead.id } });
      await tx.lead.delete({ where: { id: lead.id } });
    }
    await tx.auditLog.create({
      data: {
        action: "ANALYTICS_TEST_CLEANUP",
        resourceType: "analytics_fixture",
        resourceId: manifest.fixtureLeadId,
        metadata: { eventCount: events.length, syntheticOnly: true },
      },
    });
    return { syntheticLeadDeleted: !!lead, eventsDeleted: events.length };
  });
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "未完成清理，事务已回滚。请先核对本次清单、测试标记及原始事件；不要手工清空分析表。",
  );
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
