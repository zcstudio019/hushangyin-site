import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
test(
  "PostgreSQL migrations + consultation transaction/consent/dedup/rollback + role scope",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const connection = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(connection.hostname) &&
        connection.pathname.endsWith("_test"),
      "Only a dedicated local *_test database is allowed",
    );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        { env: process.env, encoding: "utf8" },
      );
      assert.equal(
        result.status,
        0,
        "Migration deploy failed (details suppressed to protect connection information)",
      );
    }
    const { db } = await import("../../src/lib/db");
    const { createConsultation } =
      await import("../../src/features/leads/service");
    const { privateKey } = await import("../../src/lib/security");
    const { scope, changeStatus } =
      await import("../../src/features/leads/admin");
    const prisma = db();
    const ids: string[] = [];
    const input = {
      name: "合成测试（非客户）",
      phone: "13800000000",
      customerType: "ENTERPRISE" as const,
      financingAmount: "50万元以内" as const,
      sourcePage: "/contact/",
      consent: true as const,
    };
    try {
      const first = await createConsultation(input);
      ids.push(first.reference);
      assert.equal(
        await prisma.consent.count({ where: { leadId: first.reference } }),
        1,
      );
      await assert.rejects(() => createConsultation(input));
      const before = await prisma.submissionGuard.count();
      await assert.rejects(() =>
        createConsultation({
          ...input,
          phone: "13900000000",
          name: "x".repeat(41),
        }),
      );
      assert.equal(await prisma.submissionGuard.count(), before);
      const agent = {
        id: "nonexistent-test-agent",
        role: "FINANCING_ADVISOR" as const,
        email:"test@example.test", departmentId:null, mustChangePassword:false,sessionVersion:0,
        name: "Test",
        sessionId: "test",
      };
      assert.deepEqual(scope(agent), { assignedTo: agent.id });
      await assert.rejects(() =>
        changeStatus(agent, first.reference, "COMPLETED"),
      );
    } finally {
      await prisma.submissionGuard.deleteMany({where:{key:privateKey(JSON.stringify([input.phone,input.customerType,input.financingAmount]))}});
      await prisma.consent.deleteMany({ where: { leadId: { in: ids } } });
      await prisma.lead.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  },
);
