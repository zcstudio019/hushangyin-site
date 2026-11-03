import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const development = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("PORT_INVALID");
const local =
  process.env.LOCAL_TEST_MODE === "true" &&
  ["http://127.0.0.1:3000", "http://localhost:3000"].includes(
    process.env.SITE_URL?.replace(/\/$/, ""),
  );
let redirect;
if (local && port === 3000) {
  redirect = http.createServer((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Cache-Control": "no-store",
      });
      response.end("Use the current website at http://127.0.0.1:3000/");
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1:8080");
    response.writeHead(307, {
      Location: "http://127.0.0.1:3000" + url.pathname + url.search,
      "Cache-Control": "no-store",
      "X-Hushangyin-Service": "legacy-redirect",
    });
    response.end();
  });
  redirect.on("error", () => {
    console.error(
      "[沪上银] 旧预览端口8080被占用，请停止本项目旧静态服务；当前平台地址为 http://127.0.0.1:3000/",
    );
  });
  redirect.listen(8080, "127.0.0.1", () =>
    console.log("[沪上银] 旧预览8080已统一跳转至3000。"),
  );
}
console.log("[沪上银] 项目目录：" + root);
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    development ? "dev" : "start",
    ...(development ? ["--webpack"] : []),
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: root, env: process.env, stdio: "inherit", windowsHide: true },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  redirect?.close();
  child.kill("SIGINT");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("error", () => {
  redirect?.close();
  console.error("[沪上银] 应用启动失败。");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  redirect?.close();
  process.exitCode = code ?? 0;
});
