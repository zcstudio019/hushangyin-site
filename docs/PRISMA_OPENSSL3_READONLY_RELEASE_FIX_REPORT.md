# Prisma OpenSSL3 引擎与只读发布包修复报告

日期：2026-11-04。目标：Ubuntu22.04 x86_64 / Node24.22.2 / Prisma6.19.3。

**结果：本地隔离Linux构建、完整打包和普通用户只读离线Prisma验收通过；GitHub托管runner及ECS新包尚未执行。** 本轮未连接ECS或真实业务库，未修改systemd、Nginx、独立Node安装、业务代码或数据库表/迁移历史。

## 1. 根本原因与证据边界

当前源码中原generator只有`provider`，默认依赖构建机的`native`识别；派生SQLite/MySQL Schema也继承此行为。工作流虽固定Ubuntu22.04，却没有记录系统OpenSSL、Prisma实际平台或设置CLI下载目标。

原打包检查在`deploy/ci/package-release.mjs`只要求客户端目录中存在任意`.so.node`并检查ELF头，没有检查`debian-openssl-3.0.x`，也没有检查CLI的Schema Engine。原`smoke-release.mjs`只读取`Prisma.dmmf`，并未建立SQLite连接。因此只有1.1引擎的包也能通过旧门禁。

用户报告的包中只有1.1引擎，可确认产物没有覆盖ECS实际需要的平台。ECS的Prisma CLI识别3.0后，会通过`@prisma/engines.ensureNeededBinariesExist`补齐Schema Engine和CLI Query Engine，下载目录是`node_modules/@prisma/engines`；服务用户无写权限，就报`Can't write to node_modules/@prisma/engines`。**这是构建产物缺引擎，不是SQLite业务文件权限不足。**

旧Actions没有保留平台探测日志，不能断言当时是缺失libssl、探测回退、多个版本共存或其他镜像状态导致选中1.1。Prisma6在无法识别OpenSSL时确实会默认1.1，但本报告不把这一可能性冒充历史运行证据。源码缺少目标约束与验收门禁是已确认、已修复的原因。

Node自带的OpenSSL版本与Prisma探测的系统libssl不是同一个信息。新CI同时打印`openssl version`、Prisma binaryTarget/libssl/distro和Node的OpenSSL版本，并检查实际结果，不能仅凭Ubuntu或Node版本推断。

## 2. 修复实现

### Generator与CLI分别配置

唯一generator维护位置：`prisma/schema.prisma`：

```prisma
generator client {
  provider      = "prisma-client-js"
  engineType    = "library"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

`native`保留本地Windows等开发环境能力，明确加入ECS目标。`scripts/prepare-db-schemas.mjs`检查这个契约，并将整个generator复制到SQLite/MySQL Schema；派生文件已通过该脚本重新生成，不手工维护另一套配置。只改变generator，不改变datasource或数据模型。

工作流job级别设置：

```ini
PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
```

变量在`npm ci`之前就存在，控制`@prisma/engines`的CLI Schema/Query Engine下载。**Client binaryTargets和CLI下载目标缺一不可**，仅改generator不能保证Schema Engine完整。

### 构建与打包门禁

1. 仅在一次性GitHub runner中安装/确认`openssl`、`libssl3`，输出OpenSSL版本及libssl3路径；不在ECS安装软件。
2. npm ci期间指定CLI目标；随后`prisma-engines.mjs prepare`检查Prisma6.19.3实际识别值，并调用锁定版本的官方引擎包下载接口，补齐官方引擎。npm生命周期脚本可能未获准执行，且Prisma postinstall部分下载失败可静默，所以不能只依赖安装成功。
3. 实际识别不是`debian-openssl-3.0.x` / `3.0.x`时直接失败，不伪装平台、不回退1.1，也不删除系统其他库掩盖问题。
4. 原`npm run build`生成三个客户端，构建阶段不连接业务数据库。
5. 打包前及打包副本中严格检查下列文件的存在、ELF64/x86_64头、Schema Engine执行位和生成Schema目标配置：

```text
node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x
node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node
node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
node_modules/@hsy/sqlite-client/libquery_engine-debian-openssl-3.0.x.so.node
node_modules/@hsy/mysql-client/libquery_engine-debian-openssl-3.0.x.so.node
```

6. RELEASE_MANIFEST增加`prismaBinaryTarget: debian-openssl-3.0.x`。
7. 普通启动冒烟通过后，必须再通过下面的只读离线验收，才允许upload-artifact。无continue-on-error；失败只留下runner中的候选临时文件，**不会上传可下载Artifact**。

生成与下载全部在构建机完成，没有在运行时设置下载脚本、777权限或服务用户npm install。

## 3. 只读普通用户验收设计

`prisma-readonly.mjs`从真正候选tar.gz解压一个隔离副本：

- 副本所有者设为root，递归去掉写位；保留引擎/目录必要的执行位。
- 使用UID/GID65534普通账户、清空附加组并设置no-new-privs，不创建或修改系统账户。
- 使用独立network namespace关闭外部网络；测试进程检查其namespace不同且不存在外部网络接口。
- 仅测试runtime目录和全新HOME/cache允许写，测试前没有缓存。release/node_modules和引擎目录对普通用户均不可写。
- 不传入生产环境。测试移除引擎路径覆盖与CLI目标强制变量，让Prisma按实际平台自动查找包内引擎。

普通用户顺序执行：

1. 系统OpenSSL及Prisma平台检查，必须仍识别3.0目标。
2. 包内Schema Engine `--version`。
3. 现有`scripts/db-tool.mjs validate sqlite`。
4. 在副本外新建一次性空SQLite文件，对该文件运行包内现有迁移，两次`prisma migrate deploy`验证幂等；核对迁移名称与包内SQL目录。
5. 真正dlopen三个客户端的3.0 Query Engine库。
6. SQLite PrismaClient连接临时库，在现有RateLimitBucket模型创建/更新/查询/删除一条合成标记，然后断开。

检查前后对整个release逐文件内容、路径、权限、所有者、大小、mtime及链接目标计算指纹，必须完全一致；不因读访问时间变化误报。结束后只清理本次临时副本和测试库。

这覆盖了真实CLI、迁移Schema Engine与SQLite Client，而非仅检查DMMF或文件名。网络完全隔离且HOME无缓存，成功说明不需要运行时下载；Query Engine实际读写完成，没有连接PG/MySQL或任何业务SQLite。

## 4. 修改文件清单

| 文件 | 作用 |
|---|---|
| `.github/workflows/linux-preview-build.yml` | OpenSSL安装/探测、安装前CLI目标、引擎下载/检查、上传前只读离线门禁 |
| `prisma/schema.prisma` | 唯一generator目标与library类型配置 |
| `prisma/sqlite/schema.prisma` | 由现有生成流程派生的generator |
| `prisma/mysql/schema.prisma` | 同上 |
| `scripts/prepare-db-schemas.mjs` | 校验并统一继承generator策略 |
| `deploy/ci/prisma-engines.mjs`（新增） | 实际平台检测、严格CLI下载、五个目标引擎检查 |
| `deploy/ci/package-release.mjs` | 接入严格引擎门禁、记录目标平台 |
| `deploy/ci/package.test.mjs` | 验证只有1.1或任一3.0引擎缺失必定失败 |
| `deploy/ci/prisma-readonly.mjs`（新增） | root所有只读副本、普通用户/网络隔离、整包指纹核对 |
| `deploy/ci/prisma-readonly-child.mjs`（新增） | CLI验证、临时迁移、引擎加载及SQLite真实读写 |
| 本报告、`docs/GITHUB_ACTIONS_LINUX_PREVIEW_BUILD.md` | 修复证据及重新构建发布说明 |

主Schema去除generator后，与此前源快照逐字一致；13个迁移相关文件（PG/SQLite/MySQL迁移SQL及锁文件）SHA逐一相同。没有新增或改动迁移、表字段、员工、客户、FAQ、文章或审计数据。

## 5. 实际测试结果

本地环境是**WSL Ubuntu26.04 x64**，不是ECS或GitHub Ubuntu22.04。Node24.22.2，系统OpenSSL3.5.5，Prisma6.19.3实际探测：

```json
{"prismaTarget":"debian-openssl-3.0.x","prismaLibssl":"3.0.x","prismaDistro":"debian","nodeOpenSSL":"3.5.9"}
```

Prisma将支持的OpenSSL3系列映射到3.0.x目标；没有发明3.5.x binaryTarget。

| 项目 | 结果 |
|---|---|
| 全新隔离源码，空数据库连接/密钥，npm ci | 通过，405个锁定依赖 |
| OpenSSL/Prisma实际平台输出及严格下载 | 通过，CLI两种3.0引擎存在 |
| 三客户端生成、原生产构建及TypeScript检查 | 通过，38项静态生成完成 |
| 目标缺失/1.1-only及打包安全夹具 | 4/4通过 |
| 打包前CLI + 三客户端完整性检查 | 通过 |
| tar解压实际Next启动、Argon2、Worker配置 | 通过，首页/robots200，未配置业务库health503 |
| 普通用户执行Schema validate | 通过 |
| Schema Engine执行、临时SQLite迁移两次 | 通过 |
| 三个3.0 Query Engine dlopen | 通过 |
| SQLite Client真实连接与CRUD | 通过，合成标记已删除 |
| 网络隔离、root所有只读目录 | 通过，测试UID65534 |
| release/node_modules内容与元数据指纹 | 完全不变 |
| 新增/修改MJS ESLint、格式检查 | 通过 |
| 工作流YAML、CLI目标和上传前强制门禁 | 通过静态校验 |
| GitHub Actions新一次真实运行 | **未执行，需用户提交后手动运行** |
| ECS新产物实际验收 | **未执行，没有服务器操作** |

真实只读测试输出：

```json
{"ordinaryUser":true,"rootOwnedReadonlyRelease":true,"networkIsolated":true,"schemaValidate":true,"schemaEngineExecute":true,"isolatedMigrationTwice":true,"threeQueryEnginesLoaded":true,"sqliteCrud":true,"realBusinessDatabaseUsed":false}
{"readonlyPrismaAcceptance":true,"releaseFingerprintUnchanged":true,"nodeModulesUnchanged":true}
```

没有把本地Linux通过冒充Ubuntu22.04托管runner/ECS通过。CI会在真实Ubuntu22.04上重复所有探测、构建和只读验收；sudo/unshare不可用或任何项失败都必须停止，不能跳过门禁上传。

## 6. 重新构建与发布步骤

1. 提交并推送本报告列出的变更，包括三个Schema生成配置和新增CI脚本；不提交.env、数据库、备份或本地测试产物。
2. GitHub Actions → `Linux private preview release` → `Run workflow`。确认日志显示系统OpenSSL3、Prisma目标3.0、严格下载检查和只读门禁全部成功。不能只看Next build完成。
3. 下载新run的.tar.gz和.sha256，核对SHA及RELEASE_MANIFEST的commit/run-id、Node24.22.2、Linux x64、私有SITE_URL和`prismaBinaryTarget`。旧1.1包不再使用，不在ECS补装或修改它的node_modules。
4. 依照[Linux发布包安装指南](GITHUB_ACTIONS_LINUX_PREVIEW_BUILD.md)安装到全新版本目录，由root管理、服务用户只读。保留旧release和现有SQLite；不覆盖source或数据库，不在ECS执行npm install/prisma generate。
5. 在ECS仅做以下**用户手动、无业务数据写入**的复核（将RELEASE换成真实新目录）：

```bash
set -euo pipefail
RELEASE='/opt/hushangyin/releases/ci-实际提交号-实际run-id'
cd "$RELEASE"
openssl version
sudo -u hushangyin test ! -w "$RELEASE/node_modules/@prisma/engines"
sudo -u hushangyin /bin/bash "$RELEASE/deploy/ecs/run-runtime.sh" node deploy/ci/prisma-engines.mjs check
sudo -u hushangyin "$RELEASE/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x" --version
sudo -u hushangyin /bin/bash "$RELEASE/deploy/ecs/run-runtime.sh" node \
  --env-file=/etc/hushangyin/app.env scripts/db-tool.mjs validate sqlite
sudo -u hushangyin /bin/bash "$RELEASE/deploy/ecs/run-runtime.sh" node -e '
for(const dir of [".prisma/client","@hsy/sqlite-client","@hsy/mysql-client"]){
 const engine=require("./node_modules/"+dir+"/libquery_engine-debian-openssl-3.0.x.so.node");
 if(typeof engine.QueryEngine!=="function")process.exit(1);
} console.log("三个OpenSSL3引擎加载成功，未连接数据库");'
```

`prisma-engines.mjs check`只读检查完整性，不下载；不要在ECS运行其prepare子命令。Schema validate只校验Schema，不迁移现有业务库；上面的引擎加载也不连接业务库。不要为验证临时库而把现有preview.sqlite复制回包内或重置它。CI的临时库验证已完成，不需要把测试数据传到ECS。

后续激活仍按已有私有预发布授权流程进行。现有`deploy-preview.sh`包含备份/迁移步骤，须核对其原有审批与迁移状态后由用户决定执行；本轮未运行它。systemd、3120、独立Node24、私密配置、备份、回滚和公网限制保留。

参考：[Prisma6环境变量 / CLI目标](https://www.prisma.io/docs/orm/v6/reference/environment-variables-reference)、[Prisma6系统要求及OpenSSL探测回退](https://www.prisma.io/docs/orm/v6/reference/system-requirements)、[Prisma6 Schema generator配置](https://docs.prisma.io/docs/orm/v6/reference/prisma-schema-reference)。实际实现同时核对了已安装6.19.3的`@prisma/engines`和`@prisma/get-platform`源码。
