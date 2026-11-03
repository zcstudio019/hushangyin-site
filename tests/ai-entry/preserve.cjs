const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const p = new PrismaClient({ log: [] });
(async () => {
  const old = JSON.parse(
    fs.readFileSync(".local-postgres/backups/ai-entry-before.json", "utf8"),
  );
  for (const [key, model] of [
    ["questions", "geoQuestion"],
    ["faqs", "faq"],
    ["articles", "article"],
    ["users", "adminUser"],
    ["leads", "lead"],
  ]) {
    const rows = await p[model].findMany({
      where: { id: { in: old[key].map((r) => r.id) } },
    });
    assert.equal(rows.length, old[key].length);
    for (const orig of old[key]) {
      const row = JSON.parse(
        JSON.stringify(rows.find((r) => r.id === orig.id)),
      );
      for (const k of Object.keys(orig))
        assert.deepEqual(row[k], orig[k], key + ":" + k);
    }
  }
  const { taskId } = JSON.parse(
    fs.readFileSync("test-results/ai-entry/paid-task.json", "utf8"),
  );
  const task = await p.geoGenerationTask.findUniqueOrThrow({
    where: { id: taskId },
  });
  const counts = {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    users: await p.adminUser.count(),
    leads: await p.lead.count(),
    departments: await p.department.count(),
  };
  const result = {
    originalDataUnchanged: true,
    counts,
    taskId,
    status: task.status,
    articleId: task.outputArticleId,
    attempts: task.attempts,
    draftAudit: await p.auditLog.count({
      where: {
        action: "GENERATION_DRAFT_SAVED",
        resourceId: task.outputArticleId,
      },
    }),
  };
  fs.writeFileSync(
    "test-results/ai-entry/preservation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
})().finally(() => p.$disconnect());
