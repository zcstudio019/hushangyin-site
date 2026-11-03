import test from "node:test";
import assert from "node:assert/strict";
import {
  consultationSchema,
  statusSchema,
} from "../../src/lib/validations/consultation";
import { readJson, assertOrigin, failure, HttpError } from "../../src/lib/http";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { sealData, unsealData } from "iron-session";
import { consultationAvailable } from "../../src/lib/consultation-availability";
const valid = {
  name: "合成测试",
  phone: "13800000000",
  customerType: "ENTERPRISE",
  financingAmount: "50万元以内",
  hasProperty: null,
  hasCompany: true,
  remark: "测试数据",
  sourcePage: "/contact/",
  consent: true,
};
test("valid consultation, whitespace normalization, consent required", () => {
  assert.equal(
    consultationSchema.parse({ ...valid, name: " 测试 " }).name,
    "测试",
  );
  for (const item of [
    { ...valid, consent: false },
    { ...valid, phone: "123" },
    { ...valid, name: "" },
    { ...valid, name: "a".repeat(41) },
    { ...valid, remark: "a".repeat(601) },
    { ...valid, sourcePage: "https://bad.test/" },
    { ...valid, role: "ADMIN" },
    { ...valid, hasCompany: "yes" },
    { ...valid, customerType: "UNKNOWN" },
    { ...valid, remark: "<script>alert(1)</script>" },
  ])
    assert.equal(consultationSchema.safeParse(item).success, false);
});
test("only allowed lead states accepted", () => {
  for (const status of ["NEW", "PENDING", "FOLLOWING", "COMPLETED", "INVALID"])
    assert.equal(statusSchema.safeParse({ status }).success, true);
  assert.equal(statusSchema.safeParse({ status: "DELETED" }).success, false);
});
test("JSON size/type/format enforcement, including unknown content length stream", async () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://127.0.0.1/api/consultations/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  assert.deepEqual(await readJson(request('{"a":1}')), { a: 1 });
  for (const req of [
    request("x".repeat(8193)),
    request("{}", { "Content-Length": "9000" }),
  ])
    await assert.rejects(
      () => readJson(req),
      (e: unknown) => e instanceof HttpError && e.status === 413,
    );
  await assert.rejects(
    () => readJson(request("broken")),
    (e: unknown) => e instanceof HttpError && e.status === 400,
  );
  await assert.rejects(
    () => readJson(request("{}", { "Content-Type": "text/plain" })),
    (e: unknown) => e instanceof HttpError && e.status === 415,
  );
});
test("CSRF same-origin enforcement and safe failure responses", async () => {
  const origin = "http://127.0.0.1:3000";
  process.env.SITE_URL = origin;
  assert.doesNotThrow(() =>
    assertOrigin(new Request(origin, { headers: { Origin: origin } })),
  );
  for (const headers of [
    {},
    { Origin: "https://attacker.test" },
    { Origin: origin, "Sec-Fetch-Site": "cross-site" },
  ] as Record<string, string>[])
    assert.throws(
      () => assertOrigin(new Request(origin, { headers })),
      HttpError,
    );
  const result = await failure(
    new Error("postgres password private-phone"),
  ).json();
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes("private-phone"), false);
});
test("Argon2id hash verification and encrypted cookie tamper resistance", async () => {
  const password = randomBytes(24).toString("hex");
  const encoded = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  assert.match(encoded, /^\$argon2id\$/);
  assert.equal(await verify(encoded, password), true);
  assert.equal(await verify(encoded, password + "x"), false);
  const secret = randomBytes(32).toString("hex");
  const seal = await sealData(
    { token: "opaque-test-token" },
    { password: secret, ttl: 60 },
  );
  assert.equal(seal.includes("opaque-test-token"), false);
  assert.deepEqual(await unsealData(seal, { password: secret, ttl: 60 }), {
    token: "opaque-test-token",
  });
  assert.deepEqual(
    await unsealData(
      seal.slice(0, 40) + (seal[40] === "a" ? "b" : "a") + seal.slice(41),
      { password: secret, ttl: 60 },
    ),
    {},
  );
});

test("local test mode cannot enable consultation on non-loopback origin", () => {
  const names = [
    "DATABASE_URL",
    "RATE_LIMIT_SECRET",
    "CONSULTATIONS_ENABLED",
    "LOCAL_TEST_MODE",
    "SITE_URL",
  ];
  const before = Object.fromEntries(
    names.map((key) => [key, process.env[key]]),
  );
  try {
    process.env.DATABASE_URL = "synthetic";
    process.env.RATE_LIMIT_SECRET = "x".repeat(48);
    process.env.CONSULTATIONS_ENABLED = "true";
    process.env.LOCAL_TEST_MODE = "true";
    process.env.SITE_URL = "http://127.0.0.1:3000";
    assert.equal(consultationAvailable(), true);
    process.env.SITE_URL = "https://hushangyin.invalid";
    assert.equal(consultationAvailable(), false);
    process.env.CONSULTATIONS_ENABLED = "false";
    assert.equal(consultationAvailable(), false);
  } finally {
    for (const key of names) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
