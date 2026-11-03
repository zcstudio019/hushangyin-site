import assert from "node:assert/strict";
(async () => {
  process.env.DATABASE_URL =
    "postgresql://unavailable:unavailable@127.0.0.1:1/unavailable?connect_timeout=1";
  process.env.SITE_URL = "http://127.0.0.1:3000";
  process.env.LOCAL_TEST_MODE = "true";
  process.env.CONSULTATIONS_ENABLED = "true";
  const { POST } = await import("../../src/app/api/consultations/route");
  const response = await POST(
    new Request("http://127.0.0.1:3000/api/consultations/", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "虚构不可用测试",
        phone: "13800000945",
        customerType: "PERSONAL",
        financingAmount: "50万元以内",
        sourcePage: "/contact/",
        consent: true,
      }),
    }),
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.ok(!JSON.stringify(body).includes("postgresql"));
})().catch(() => {
  console.error("不可用数据库边界检查失败；详情不输出。");
  process.exitCode = 1;
});
