import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL;
test(
  "Running Next server: missing DB fails closed, validation, CSRF, unauthorized API",
  { skip: !base },
  async () => {
    const valid = {
      name: "合成测试",
      phone: "13800000000",
      customerType: "ENTERPRISE",
      financingAmount: "50万元以内",
      sourcePage: "/contact/",
      consent: true,
    };
    async function post(body: unknown, origin = base!) {
      return fetch(base + "/api/consultations/", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    assert.equal((await post({ ...valid, consent: false })).status, 400);
    assert.equal((await post({ ...valid, phone: "123" })).status, 400);
    assert.equal((await post(valid, "https://attacker.test")).status, 403);
    assert.equal(
      (await post({ ...valid, remark: "x".repeat(10000) })).status,
      413,
    );
    if (!process.env.TEST_DATABASE_URL)
      assert.equal((await post(valid)).status, 503);
    for (const suffix of ["/api/admin/leads/", "/api/admin/leads/missing/"]) {
      const response = await fetch(base + suffix);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(
      (
        await fetch(base + "/api/admin/leads/missing/", {
          method: "PATCH",
          headers: { Origin: base!, "Content-Type": "application/json" },
          body: '{"status":"COMPLETED"}',
        })
      ).status,
      401,
    );
    const login = await fetch(base + "/api/admin/login/", {
      method: "POST",
      headers: {
        Origin: "https://attacker.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(login.status, 403);
    for (const path of [
      "/admin/",
      "/admin/dashboard/",
      "/admin/leads/",
      "/admin/leads/missing/",
    ]) {
      const response = await fetch(base + path, { redirect: "manual" });
      assert.ok([303, 307, 308].includes(response.status));
      assert.ok(response.headers.get("location")?.includes("/admin/login/"));
    }
    const response = await fetch(base + "/api/consultations/", {
      method: "POST",
      headers: { Origin: base!, "Content-Type": "multipart/form-data" },
      body: "sensitive-file-not-accepted",
    });
    assert.equal(response.status, 415);
  },
);
