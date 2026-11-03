const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const p = new PrismaClient({ log: [] });
(async () => {
  const old = JSON.parse(
    fs.readFileSync(".local-postgres/backups/review-risk-before.json", "utf8"),
  );
  for (const [name, model] of [
    ["questions", "geoQuestion"],
    ["faqs", "faq"],
    ["articles", "article"],
    ["users", "adminUser"],
    ["leads", "lead"],
    ["departments", "department"],
  ]) {
    const rows = await p[model].findMany({
      where: { id: { in: old[name].map((r) => r.id) } },
    });
    assert.ok(rows.length === old[name].length, name + "：原记录数量变化");
    for (const original of old[name]) {
      const current = JSON.parse(
        JSON.stringify(rows.find((r) => r.id === original.id)),
      );
      assert.ok(
        Object.keys(original).every(
          (k) => JSON.stringify(current[k]) === JSON.stringify(original[k]),
        ),
        name + "：原记录内容发生变化",
      );
    }
  }
  const counts = {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    users: await p.adminUser.count(),
    leads: await p.lead.count(),
    departments: await p.department.count(),
    faqVersions: await p.faqVersion.count(),
    tasks: await p.geoGenerationTask.count(),
  };
  assert.equal(counts.questions, 100);
  assert.equal(counts.faqs, 60);
  assert.equal(counts.articles, 4);
  assert.equal(counts.users, old.users.length);
  assert.equal(counts.leads, 2);
  assert.equal(counts.tasks, 0);
  const result = {
    originalDataUnchanged: true,
    counts,
    realAiCalled: false,
  };
  fs.writeFileSync(
    "test-results/review-risk/preservation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
})().finally(() => p.$disconnect());
