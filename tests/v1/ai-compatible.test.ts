import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  aiConfiguration,
  HttpAiProvider,
  testModelConnection,
  AiError,
  shouldRetryGeneration,
  chatText,
  aiSettingsSignature,
} from "../../src/lib/ai/provider";
import type { GenerationInput } from "../../src/features/generation/config";
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  AI_PROVIDER: "openai-compatible",
  AI_BASE_URL: "https://maimai.it.com/v1",
  AI_MODEL: "gpt-6-sol",
  AI_API_KEY: "NOT_A_REAL_GATEWAY_KEY_FOR_OFFLINE_TEST",
  AI_REASONING_EFFORT: "medium",
  AI_GENERATION_ENABLED: "true",
  AI_EXTERNAL_TRANSMISSION_APPROVED: "true",
};
const settings = aiConfiguration(env).settings;
const fixture = {
  title: "软件协议测试",
  summary: "这是离线协议验证。",
  markdown: "## 软件验收\n此为测试草稿，不是融资建议。",
  seoTitle: "软件协议测试",
  metaDescription: "这是测试摘要。",
  keywords: [],
  relatedQuestionIds: [],
  faqIds: [],
  references: [],
  verificationItems: [],
};
const input: GenerationInput = {
  knowledge: {
    question: {
      id: "q",
      question: "软件内容如何核验？",
      category: "融资规划",
      keywords: [],
      intent: "AWARENESS",
    },
    similarQuestions: [],
    faqs: [],
    articles: [],
    references: [],
    warnings: [],
    retrievedAt: "2026-10-31T00:00:00Z",
  },
  template: { id: "t", name: "模板", version: 1, content: "按章节输出" },
  articleType: "KNOWLEDGE",
  audience: "软件验收",
  depth: "STANDARD",
  supplement: "仅用于离线测试",
  requestFingerprint: "fixture",
};
async function offline<T>(f: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = f;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("自定义网关配置、别名、安全缺失状态及不重复路径", () => {
  assert.equal(aiConfiguration(env).available, true);
  assert.equal(settings.provider, "openai-compatible");
  assert.equal(settings.model, "gpt-6-sol");
  assert.equal(settings.reasoningEffort, "medium");
  for (const value of ["", undefined]) {
    const c = aiConfiguration({
      ...env,
      AI_API_KEY: value,
      OPENAI_API_KEY: "OTHER_PROVIDER_KEY_SHOULD_NOT_BE_REUSED",
    });
    assert.equal(c.available, false);
    assert.equal(c.settings.apiKey, "");
    assert.ok(c.missing.some((s) => s.includes("尚未配置 API 密钥")));
  }
  assert.equal(
    aiConfiguration({
      ...env,
      AI_BASE_URL: env.AI_BASE_URL + "/chat/completions",
    }).available,
    false,
  );
  assert.equal(
    aiConfiguration({ ...env, AI_BASE_URL: "http://localhost/v1" }).available,
    false,
  );
  assert.equal(
    aiConfiguration({ ...env, AI_BASE_URL: "https://host.invalid/v1?key=x" })
      .available,
    false,
  );
  assert.equal(
    aiConfiguration({ ...env, AI_PROVIDER: "compatible-chat" }).available,
    true,
  );
  assert.notEqual(
    aiSettingsSignature(settings),
    aiSettingsSignature({ ...settings, baseUrl: "https://another.invalid/v1" }),
  );
});
test("离线HTTP夹具：指定Chat端点/模型/medium/输出预算，无采样参数，结构化结果及用量", async () => {
  let calls = 0;
  await offline(
    async (url, init) => {
      calls++;
      assert.equal(String(url), "https://maimai.it.com/v1/chat/completions");
      assert.equal(init?.redirect, "error");
      const b = JSON.parse(String(init?.body));
      assert.equal(b.model, "gpt-6-sol");
      assert.equal(b.reasoning_effort, "medium");
      assert.equal(b.max_completion_tokens, 4000);
      for (const name of ["temperature", "top_p", "max_tokens"])
        assert.equal(name in b, false);
      assert.equal(b.response_format.type, "json_schema");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer " + settings.apiKey,
      );
      return response({
        model: "gpt-6-sol",
        choices: [
          {
            message: { content: JSON.stringify(fixture) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    },
    async () => {
      const out = await new HttpAiProvider().generate(
        input,
        settings,
        new AbortController().signal,
      );
      assert.equal(out.result.title, fixture.title);
      assert.deepEqual(out.usage, { input: 10, output: 20, total: 30 });
    },
  );
  assert.equal(calls, 1);
});
test("缺Key、客户敏感信息和原始金融资料必须在fetch前停止", async () => {
  let calls = 0;
  await offline(
    async () => {
      calls++;
      throw Error("No network allowed");
    },
    async () => {
      await assert.rejects(
        () =>
          testModelConnection(
            { ...settings, apiKey: "" },
            new AbortController().signal,
          ),
        (e: unknown) => e instanceof AiError && e.code === "KEY_MISSING",
      );
      for (const supplement of [
        "sk-fake_secret_marker_for_offline_test",
        "测试号码13800000000",
        "测试号码１３８００００００００",
        "银行流水明细",
        "资产负债表",
        "征信报告原文",
        "账号：12345678",
      ])
        await assert.rejects(
          () =>
            new HttpAiProvider().generate(
              { ...input, supplement },
              settings,
              new AbortController().signal,
            ),
          (e: unknown) => e instanceof AiError && e.code === "SENSITIVE_INPUT",
        );
    },
  );
  assert.equal(calls, 0);
});
test("离线网关错误分类：认证、模型、配额、限流及参数错误，无敏感错误回显或自动重发", async () => {
  for (const [status, code, expected] of [
    [401, "invalid_api_key", "AUTH_ERROR"],
    [404, "model_not_found", "MODEL_UNAVAILABLE"],
    [429, "insufficient_quota", "QUOTA_EXCEEDED"],
    [429, "rate_limit_exceeded", "RATE_LIMITED"],
    [400, "unsupported_parameter", "UNSUPPORTED_PARAMETERS"],
    [503, "upstream_error", "PROVIDER_ERROR"],
  ] as const) {
    let calls = 0;
    await offline(
      async () => {
        calls++;
        return response(
          { error: { code, message: "PRIVATE_UPSTREAM_BODY_MUST_NOT_LEAK" } },
          status,
        );
      },
      async () => {
        await assert.rejects(
          () => testModelConnection(settings, new AbortController().signal),
          (e: unknown) =>
            e instanceof AiError &&
            e.code === expected &&
            !e.message.includes("PRIVATE_"),
        );
      },
    );
    assert.equal(calls, 1);
  }
});
test("离线最小连接测试不发送知识/客户数据，不接受空输出或模型替换", async () => {
  await offline(
    async (_url, init) => {
      const b = JSON.parse(String(init?.body));
      assert.equal(b.max_completion_tokens, 256);
      assert.equal(b.messages.length, 1);
      assert.equal("response_format" in b, false);
      assert.equal(String(init?.body).includes("knowledge"), false);
      return response({
        model: "gpt-6-sol",
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      });
    },
    async () => {
      assert.equal(
        (await testModelConnection(settings, new AbortController().signal))
          .usage.total,
        6,
      );
    },
  );
  for (const body of [
    { model: "other-model", choices: [{ message: { content: "OK" } }] },
    { model: "gpt-6-sol", choices: [] },
  ])
    await offline(
      async () => response(body),
      async () => {
        await assert.rejects(
          () => testModelConnection(settings, new AbortController().signal),
          (e: unknown) =>
            e instanceof AiError &&
            ["MODEL_MISMATCH", "EMPTY_RESPONSE"].includes(e.code),
        );
      },
    );
  assert.equal(
    chatText({
      choices: [
        {
          message: {
            content: [{ type: "text", text: "OK" }],
            reasoning_content: "not exposed",
          },
        },
      ],
    }),
    "OK",
  );
});
test("超时/网络失败及租约未知结果不盲目重发，明确429可有限重试", async () => {
  const controller = new AbortController();
  controller.abort();
  await offline(
    async () => {
      throw new Error("aborted");
    },
    async () => {
      await assert.rejects(
        () => testModelConnection(settings, controller.signal),
        (e: unknown) =>
          e instanceof AiError && e.code === "TIMEOUT" && !e.retryable,
      );
    },
  );
  for (const code of [
    "TIMEOUT",
    "NETWORK_ERROR",
    "PROVIDER_ERROR",
    "DATABASE_UNAVAILABLE",
  ])
    assert.equal(
      shouldRetryGeneration(
        "openai-compatible",
        new AiError(code, "fixture", true),
        1,
        3,
      ),
      false,
    );
  assert.equal(
    shouldRetryGeneration(
      "openai-compatible",
      new AiError("RATE_LIMITED", "fixture", true),
      1,
      3,
    ),
    true,
  );
  assert.equal(
    shouldRetryGeneration(
      "openai-compatible",
      new AiError("RATE_LIMITED", "fixture", true),
      3,
      3,
    ),
    false,
  );
});
test("Next启动器与Worker使用相同本地配置，空Key可安全诊断且忽略文件已保护", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const name of ["start", "dev", "worker:geo"])
    assert.ok(
      pkg.scripts[name].includes(
        "--env-file-if-exists=.env --env-file-if-exists=.env.local",
      ),
    );
  assert.ok(
    readFileSync(".gitignore", "utf8").split(/\r?\n/).includes(".env.*"),
  );
  const raw = execFileSync(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--env-file-if-exists=.env.local",
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/geo-generation-worker.ts",
      "--check-config",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      env: { ...process.env, AI_API_KEY: "" },
    },
  );
  const status = JSON.parse(raw);
  assert.equal(status.model, "gpt-6-sol");
  assert.equal(status.keyConfigured, false);
  assert.equal(status.endpoint, "https://maimai.it.com/v1/chat/completions");
  assert.equal("apiKey" in status, false);
});
