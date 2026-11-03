# ECS 独立 Node.js 24 私有预发布配置修正

日期：2026-11-03。本文优先于 V1.6 原手册中固定 `/usr/bin/node` 的旧操作说明。

本轮仅修改本地 `deploy/` 和文档。未执行 ECS 命令，未修改业务代码、Prisma Schema、数据库、旧项目、全局 Node/npm、Nginx 或公网配置；没有替用户更新 GitHub。

## 一、实际问题与修复

服务器 `/usr/bin/node` 为22.23.2，既有项目继续使用它。旧配置中 web、Worker、备份 unit，以及部署检查/迁移/备份都硬编码此路径，与项目的 Node24要求冲突。现改为：

- 单一设置文件 `/etc/hushangyin/runtime.env`，内容 `HSY_NODE_BIN=/opt/node24/bin/node`；默认同一路径。
- 所有运行入口经过 `deploy/ecs/run-runtime.sh node|npm|npx ...`。只接受真实主版本24；缺失或错误版本失败退出，无系统Node/npm回退。
- npm/npx 通过选定 Node执行**同一发行包**的 CLI；仅为当前进程及其子进程设置PATH，保证 npm生命周期命令、Prisma的 `process.execPath` 子进程与Worker一致，不写 `/etc/profile`、`/usr/bin`、update-alternatives或全局npm配置。
- runtime.env仅解析一个绝对路径赋值，不执行shell表达式；重复设置及与显式环境变量不一致时拒绝。不要在app.env/backup.env重复配置HSY_NODE_BIN。
- 审计脚本仍有 `/usr/bin/node --version`，这是**只读查看旧版本**，不是部署调用；其余运行调用均使用新入口。

准备脚本显式创建独立系统组并设置主组；已有账号的home、nologin、UID及主组不符合时拒绝，不修改其他账号。

systemd仍采用 `/opt/hushangyin/current` WorkingDirectory，web/Worker读取app.env，backup读取backup.env；包装脚本再读取共享runtime.env。所有服务以hushangyin用户运行，`/opt/node24`和release只读，SQLite、缓存、备份写目录独立。首次准备不建立假current，也不启动服务，只有验证好的release才切成current。

已修复发布目录 `.env.*` 检查的glob位置（检查release而不是调用者cwd）；增加服务用户读取产物、写数据库/父目录、数据库0600/归属、私密配置权限检查；首次启动健康失败时停止本项目新服务。发布前核对3120监听进程必须属于本项目systemd cgroup，否则拒绝。SQLite备份、迁移、不覆盖非空数据库、代码回滚不回滚数据、私有loopback3120、生产开关关闭等限制保留。

## 二、首次接管 /opt/hushangyin

不能手工无条件 `touch .hsy-managed`。新脚本只在以下条件**全部满足**且显式设置 `APPROVE_HSY_SOURCE_ONLY_ADOPTION=true` 时接管已有目录：

1. `/opt/hushangyin` 是root所有、不可被group/other写入的真实目录。
2. 其全部直接子项（包括隐藏文件）恰好只有`source`。
3. source不是符号链接，有.git，且是当前执行脚本所属的源码目录。
4. 其他数据/备份/配置/缓存目录不存在，或已经是本项目合法管理目录；拒绝目录或marker符号链接。
5. 已有同名systemd unit必须内容相同，否则在创建用户和目录前拒绝，要求先人工备份比较；不覆盖旧unit。

通过后只调整顶层目录权限、增加管理标记及本项目私有目录，不递归chown source、不删除文件、不覆盖源码/数据库。重复执行兼容已有管理标记。若发现其他目录、隐藏文件或已有业务，不支持自动接管，必须人工核查。不要为绕过拒绝而删除不明文件。

## 三、独立 Node24 安装方案

固定 Node24.22.2 LTS，官方发布页：[Node.js 24.22.2](https://nodejs.org/en/blog/release/v24.22.2)。安装脚本按CPU选择Linux x64/arm64官方包；不使用musl包（Ubuntu22.04使用glibc），不使用镜像站脚本或apt升级全局Node。

`install-node24.sh` 下载官方HTTPS `SHASUMS256.txt`及发布包，同时要求清单值与仓库中经官方发布页核对的固定SHA一致，然后`sha256sum --check --strict`，**通过后才解压/执行**。x64 SHA256：

```text
48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75
```

默认安装到`/opt/node24`，不创建全局链接。目标存在且不是相同已管理安装时拒绝，不覆盖；新路径仅可选择独立`/opt/node24*`目录，并同步runtime.env。版本升级须先核对官方新版本及SHA并更新固定清单，不自动跟随latest。下载校验使用HTTPS及固定SHA，本轮没有声称执行了GPG签名验证。

**本地实际验证**：官方x64包已下载并计算SHA，与官方清单/固定值一致；本地WSL实际运行Node24.22.2，配套npm/npx11.19.1。arm64校验值已对照官方发布页，但未下载/运行arm64包。未在ECS安装。

## 四、内存约束

服务器总3.4GiB、当前可用约1.4GiB、无Swap。不能依据此快照保证服务共存能力，也不自动配置Swap或调整旧项目。

候选限制已改为：web JS heap512MiB、MemoryHigh640M、MemoryMax896M；Worker heap256MiB、High256M、Max384M；备份Max256M。Worker默认关闭、备份timer首次不启用；不要同时开启全部服务并假设可用内存足够。硬上限可能导致本项目OOM，不能替代业务高峰测量。

**不要直接在当前ECS执行Next生产构建。** 推荐同CPU/Ubuntu兼容Linux构建机或CI构建并打包Linux原生依赖；Windows node_modules/.next不能直接用于Ubuntu。构建环境也用同一Node24包装入口，锁文件npm ci，所有私密配置外置。下面构建命令只在资源足够的Linux构建机执行：

```bash
bash deploy/ecs/run-runtime.sh npm ci
bash deploy/ecs/run-runtime.sh npm run build
```

构建的SITE_URL应为该私有预发布origin；后续正式域名的产物需另行验证静态robots/元数据。构建产物应包含运行所需源码、scripts、deploy、prisma、public、package.json/lock、Linux node_modules（含3个生成客户端）和.next；排除.git、所有私密.env、.local-postgres、备份、测试结果与.next/cache。不要在运行release中npm install或执行未审查的npx下载。

## 五、更新GitHub后，用户在ECS执行的步骤

以下是**待用户执行**的命令；本文没有执行它们。先检查Git工作区干净并推送本次部署文件，再在ECS快进更新；不强制覆盖本地修改。

### 1. 更新源码、只读核对、安装独立运行时

```bash
cd /opt/hushangyin/source
git status --short
# 有未提交修改时先停止，备份并核对，不使用reset/clean。
git pull --ff-only
bash deploy/ecs/check-syntax.sh
sudo bash deploy/ecs/audit-readonly.sh

# 仅安装独立/opt/node24；不触碰/usr/bin/node。
sudo env APPROVE_HSY_NODE24_INSTALL=true bash deploy/ecs/install-node24.sh
bash deploy/ecs/run-runtime.sh node --version
bash deploy/ecs/run-runtime.sh npm --version
/usr/bin/node --version
```

期望分别显示v24.22.2、配套npm版本、旧v22.23.2。若已有非本工具安装的/opt/node24，脚本会拒绝；先人工核验该目录，不删除或覆盖。安装版本不同时使用审核后的独立新目录及对应runtime.env。

### 2. 严格首次目录接管（不启动服务）

先确认顶层只有source且root所有、无group/other写权限。若不符合，停止排查，不运行无条件chown或touch标记。

```bash
sudo ls -la /opt/hushangyin
sudo env APPROVE_HSY_PRIVATE_SETUP=true APPROVE_HSY_SOURCE_ONLY_ADOPTION=true \
  bash deploy/ecs/prepare-private-paths.sh
```

已有且不同的本项目unit会拒绝，需先单独备份比较，再由用户手动更新**确认为沪上银**的3个service和timer，不能用通配命令覆盖其他服务。重新准备目录仍须保留全部检查。

### 3. 私密配置、数据库与Linux产物

准备脚本仅生成runtime.env及新的备份密钥，不生成虚假凭据、不初始化默认管理员。复制env模板时防止覆盖：

```bash
sudo test ! -e /etc/hushangyin/app.env && sudo install -m 0640 -o root -g hushangyin deploy/ecs/preview.env.example /etc/hushangyin/app.env
sudo test ! -e /etc/hushangyin/backup.env && sudo install -m 0640 -o root -g hushangyin deploy/ecs/backup.env.example /etc/hushangyin/backup.env
sudoedit /etc/hushangyin/app.env /etc/hushangyin/backup.env
```

必须私下填写不同的随机SESSION_SECRET/RATE_LIMIT_SECRET，各至少32字符；app和backup指向同一个`file:/var/lib/hushangyin/preview.sqlite`（backup模板原为production.sqlite，必须改）；SQLITE_DATABASE_URL与DATABASE_URL相同；SITE_URL=`http://127.0.0.1:3120`、PORT3120、LOCAL_TEST_MODEtrue；生产咨询批准/生产分析批准false，AI外发/Worker关闭、密钥空。本地虚构测试的咨询开关不代表生产授权。

把按原手册完成迁移、验证的独立SQLite副本或其加密备份私密传入。恢复必须新文件，不能覆盖已有库。最终仅对**明确这一文件**设置`hushangyin:hushangyin`、0600，父目录0700；不要递归chown数据库目录或拷贝运行中SQLite的单个主文件。原PostgreSQL和备份保留。现有系统若还在写入，先完成正式停写和最新迁移，不用过期副本充当最新数据。

Linux CI产物传至一个**全新**`/opt/hushangyin/releases/<唯一版本>/`，不要在source目录直接启动。release由root管理、hushangyin组可读/目录可遍历，服务用户不得写代码。不能打包私密env/SQLite；.next/cache应不包含构建缓存，发布脚本将它链接到独立缓存目录。尚未准备好产物或数据库时停止在此步骤，不能先启动空current。

### 4. 单独验证运行环境、权限与配置

将下面`<唯一版本>`替换为真实已上传的目录；不把尖括号原样执行：

```bash
cd /opt/hushangyin/releases/<唯一版本>
sudo -u hushangyin /bin/bash deploy/ecs/run-runtime.sh node --version
sudo -u hushangyin /bin/bash deploy/ecs/run-runtime.sh node --env-file=/etc/hushangyin/app.env scripts/db-tool.mjs validate sqlite
sudo systemd-analyze verify /etc/systemd/system/hushangyin-web.service /etc/systemd/system/hushangyin-worker.service /etc/systemd/system/hushangyin-backup.service /etc/systemd/system/hushangyin-backup.timer
sudo ss -lntp '( sport = :3120 )'
```

首次3120若被其他业务占用，停止，不杀未知进程。只允许现有沪上银服务的预期重启。准备脚本不对不存在的current启动unit；systemd静态检查不等于业务启动测试。

### 5. 私有预发布（只启动沪上银web）

确认Worker未运行。部署脚本检查运行环境、配置、文件权限、SQLite副本、生产开关关闭，先备份，再执行SQLite增量迁移（不reset），切换current并只重启本项目web：

```bash
sudo env APPROVE_HSY_PREVIEW_DEPLOY=true bash deploy/ecs/deploy-preview.sh /opt/hushangyin/releases/<唯一版本>
curl --fail http://127.0.0.1:3120/api/health/
sudo systemctl status hushangyin-web.service --no-pager
sudo journalctl -u hushangyin-web.service -n 40 --no-pager
```

如果service用户无法读路径/写库，修正该具体权限后重试，不改成root运行。数据库迁移错误不得用reset解决。健康失败首次部署会停止新服务；有旧release时只回退代码链接，不恢复旧数据库。数据恢复始终需停写、保留新数据并人工核对。

通过电脑SSH隧道访问：`ssh -N -L 3120:127.0.0.1:3120 <现有SSH用户>@8.136.24.59`，浏览器打开`http://127.0.0.1:3120/`。不添加公网3120安全组规则，不启用公网Nginx或修改DNS。重新验收页面、咨询、权限、审核、备份及现有业务。私有验收通过后才讨论备份timer/Worker与后续公网批准。

## 六、本轮修改文件

新增：

- `deploy/ecs/runtime-common.sh`、`run-runtime.sh`、`runtime.env.example`：统一Node24及npm/npx。
- `deploy/ecs/install-node24.sh`、`node24-checksums.txt`：官方SHA固定校验、独立安装、不覆盖。
- `deploy/tests/runtime-config.sh`：本地Linux运行/配置/接管判定/服务模板测试。
- 本文档。

修改：

- `deploy/ecs/prepare-private-paths.sh`：源目录首次接管、冲突预检、runtime配置、权限。
- `deploy/ecs/deploy-preview.sh`：统一运行时、release环境文件检查、服务用户访问预检及首次失败停止。
- `deploy/ecs/rollback.sh`：运行时预检、运行中的Worker阻止代码回滚。
- `deploy/ecs/audit-readonly.sh`：同时显示旧Node与独立运行时状态。
- `deploy/ecs/check-syntax.sh`：纳入测试脚本语法。
- `deploy/systemd/hushangyin-{web,worker,backup}.service`：运行入口与候选内存限制。
- `docs/V1.6_ECS_SQLITE_MYSQL_RUNBOOK.md`：转向本文的最新运行时说明。

Nginx、业务代码、Schema、已有数据库和实际私密env均未修改。

## 七、实际测试与边界

- 官方x64发布包SHA256实算匹配；内存中篡改一字节后SHA不匹配，原包未改；本地Linux真实Node24.22.2运行通过。
- 包装入口Node、配套npm/npx、npm生命周期和`process.execPath`子进程通过。
- Node22/缺失运行时拒绝；无系统npm回退；配置不执行注入表达式、重复键拒绝。
- source-only候选判定通过；隐藏兄弟项、额外目录、错误源码路径、符号链接和可被他人写入的目录拒绝。**这是隔离临时目录测试，未接管ECS实际目录。**
- systemd模板复制到本地Linux临时目录，0644权限下 `systemd-analyze verify`通过；未启动unit。
- 全部部署及测试shell语法检查通过；所有变更入口在未授权标志下拒绝。
- 本次没有改应用，不以重复全站构建/数据库迁移替代部署验证；实际ECS安装、unit启动、3120业务、负载及旧站回归由用户按步骤执行后验收。

**状态：本地部署配置与独立运行时测试完成；ECS私有预发布尚未执行，不能宣称上线验收完成。**
