# GitHub Actions Linux 私有预发布构建

**2026-11-04 OpenSSL3修正：工作流现要求CLI及三个客户端目标引擎完整，并在上传前以普通用户完成只读、断网的一次性SQLite验收。参见[最新修复报告](PRISMA_OPENSSL3_READONLY_RELEASE_FIX_REPORT.md)。下面2026-11-03测试记录为历史基线，不能代替新门禁。**

日期：2026-11-03。仓库：`zcstudio019/hushangyin-site`。

本次只新增构建、打包、校验和文档文件。没有更改package.json、锁文件、Next.js配置、业务代码、数据库Schema、ECS部署脚本、Nginx或systemd；没有推送GitHub、触发远程Actions、连接ECS、执行数据库迁移或修改现有SQLite。

## 1. 构建依赖审计

- 现有Node脚本：`npm run build` → `npm run db:generate:all` → `next build --webpack`。
- Prisma6.19.3生成原PG客户端及`@hsy/sqlite-client`、`@hsy/mysql-client`。生成需要Schema和本机引擎，不需要连接或迁移业务数据库；原生成工具为非PG生成子进程提供的校验URL仅作Schema配置，不连接MySQL/SQLite。
- `next.config.ts`将Argon2及两个自定义Prisma客户端列为外部运行依赖，所以不能只打包.next或遗漏Linux node_modules。
- Worker使用`--import tsx`，部署工具使用Prisma CLI，Next配置为TypeScript；因此保留锁文件安装的完整node_modules，不执行`npm prune --omit=dev`。
- 官网通配页、FAQ列表/详情、后台布局、Sitemap采用`force-dynamic`；`generateStaticParams`只枚举已有公开路径，不读业务库。静态robots.txt依赖SITE_URL，须固定为`http://127.0.0.1:3120`。
- DB实例延迟到请求时创建。隔离Linux构建已在DATABASE_URL、SQLITE_DATABASE_URL、MYSQL_DATABASE_URL和密钥均为空时成功。因此本期**不需要CI数据库、占位密码、SQLite副本或迁移步骤**。

未来若页面改为构建期读取业务内容，应先重新审计，让工作流失败并查明原因；不能为通过构建接入生产库或把客户资料导出到CI。

## 2. 新增文件

| 文件 | 作用 |
|---|---|
| `.github/workflows/linux-preview-build.yml` | 手动触发Ubuntu22.04 x64 / Node24.22.2构建，打包后上传Artifact |
| `deploy/ci/preflight.mjs` | 检查精确运行时、空数据库/密钥、关闭外部服务、干净checkout及源目录私密文件 |
| `deploy/ci/package-release.mjs` | 白名单拷贝、排除私密数据/缓存、检查相对链接和Linux引擎、生成清单、压缩包和SHA256 |
| `deploy/ci/package.test.mjs` | 隔离夹具测试过滤、必需文件和符号链接边界，不接触业务数据 |
| `deploy/ci/smoke-release.mjs` | 解压真正的发布包，验证Linux原生依赖、三客户端、Worker配置入口、无DB启动与robots |
| 本文档 | 运行、验收事实与ECS安全安装说明 |

## 3. 工作流行为与安全边界

在GitHub **Actions → Linux private preview release → Run workflow** 手动运行。工作流文件需先提交到默认分支才能显示手动入口。没有push/PR自动部署触发器，不使用pull_request_target；仅目标仓库可运行构建job。

- `ubuntu-22.04`标准x64 runner，与Ubuntu22.04/glibc目标对齐；不使用ubuntu-latest或ARM runner。
- 固定Node24.22.2。第三方Actions均来自官方actions仓库并固定完整提交SHA；应用Node版本不依赖Actions自身的内部运行时。
- `npm ci --include=dev --no-audit --no-fund`，然后原样`npm run build`。不修改锁文件以绕过版本问题。
- GitHub Token仅contents:read，checkout不持久化Git凭据；不引用仓库生产Secrets、SSH私钥、RDS地址、AI Key或生产数据库。
- 数据库连接、会话密钥、模型密钥显式空值；咨询、分析、AI外发、Worker与生产批准开关关闭。检查失败就停止，不注入默认管理员或硬编码凭据。
- 无业务数据库服务、业务迁移、seed、备份恢复、SSH、scp、DNS、Nginx或systemd执行步骤；2026-11-04起新增离线临时SQLite迁移验收，仅使用新建合成测试库。
- 仅成功构建、引擎完整性、打包、解压冒烟及普通用户只读离线验收全部通过后上传.tar.gz及.sha256；保留7天，不自动创建GitHub Release或部署ECS。私有仓库Artifact仍是私有源码产物，应限制仓库访问权限。[GitHub Artifact保留期说明](https://docs.github.com/en/actions/tutorials/store-and-share-data)。

不使用本地已有node_modules/.next或缓存；预检拒绝checkout中的这些本地状态。环境模板的密码/SECRET/API_KEY必须为空。过滤和干净构建降低误带入风险，但不能替代对提交源码的敏感信息审查；不要把客户资料或硬编码密钥提交到任何源码文件。

## 4. 下载产物结构

Actions成功后在该次run的Artifacts下载：

```text
hushangyin-preview-linux-x64-<完整commit>-<attempt>.zip
  hushangyin-preview-<commit前12位>-<run-id>.tar.gz
  hushangyin-preview-<commit前12位>-<run-id>.tar.gz.sha256
```

tar.gz内部仅有`release/`顶层目录：

```text
release/
  .next/BUILD_ID、server/、static/及生产运行清单
  node_modules/（Linux依赖、.prisma/client、@hsy/sqlite-client、@hsy/mysql-client）
  src/、scripts/、prisma/、public/、deploy/
  package.json、package-lock.json、next.config.ts
  next-env.d.ts、tsconfig.json、postcss.config.mjs
  RELEASE_MANIFEST.json
```

清单含提交号、Actions run-id、Node版本、Linux x64、私有SITE_URL、锁文件SHA和构建时间，不包含密钥或DB连接串。包括Prisma迁移SQL是保留运行所需代码，**不是在CI执行迁移**。

排除：.git、根目录旧静态站/归档/文档报告、tests/test-results、私密.env/app.env、数据库/WAL/SHM/备份、key/pem、日志、tsbuildinfo、.next/cache/dev/types/diagnostics/trace及依赖缓存；deploy内已有的Shell校验辅助源码保留，避免破坏check-syntax.sh，新增CI单元测试源码不入包。保留安全的deploy/*.env.example及公开Markdown/CSV模板。白名单复制不会把整个工作区直接压缩；绝对或越界符号链接拒绝，内部node_modules/.bin相对链接保留。

不需要在ECS再npm ci、生成客户端或Next构建。不能使用Windows构建产物替代本工作流的Linux包。它是私有预发布产物，不能直接用于正式域名；静态robots会指向3120，公网发布需单独构建与批准。

## 5. 已执行的构建检查

在本地WSL Linux x64的**新临时目录**复现工作流核心步骤，使用已核对官方SHA的Node24.22.2；仅复制指定源码/配置，没有复制本地.env、.env.local、node_modules、SQLite或PG数据。不是ECS构建，也不是GitHub托管runner实跑。

| 检查 | 结果 |
|---|---|
| 干净源码预检、空连接/密钥、关闭外部调用 | 通过；额外放入合成private.env时拒绝 |
| npm ci | 成功，安装405个锁定依赖；未修改锁文件 |
| 原npm run build | 成功；三客户端生成、Next16.4.3 webpack、TypeScript和38项静态生成完成 |
| build不配置数据库 | 成功，无数据库初始化/迁移/业务查询需求 |
| 过滤/拷贝/相对链接边界测试 | 3/3通过；测试夹具不代表真实数据库验收 |
| 新增MJS ESLint / 格式检查 | 通过 |
| Workflow YAML解析及手动触发/runner检查 | 通过 |
| Linux发布包制作与完整解压 | 通过，约26747文件，压缩包约220MiB；实际Actions文件大小可能随提交变化 |
| 三个生成客户端与ELF引擎 | 通过 |
| Linux Argon2真实hash/verify | 通过，使用随机临时值，不是管理员密码 |
| 发布包Worker/tsx配置检查 | 仅检查配置并退出，不领任务、不连接DB、不调用模型 |
| 发布包实际Next启动 | 首页200、robots200且SITE_URL为3120；空DB的health503，安全失败 |
| 发布包SHA256复核 | 通过 |
| 真正GitHub Actions执行/Artifact上传 | **未执行**：未推送或操作私有仓库，需用户提交后运行 |
| ECS安装、权限/负载和SQLite业务验证 | **未执行**，本轮只构建打包 |

本地测试使用全零前缀的合成commit和local-validation/local-final run-id，**不能把该测试包当正式GitHub构建来源**。最终部署请下载自己的目标commit成功run的Artifact。CI日志有依赖生命周期脚本提示和旧ESLint版本警告；本轮未扩大范围升级依赖，实际生成、原生依赖和启动测试结果如上。

## 6. ECS安全安装步骤（用户手动执行）

### 6.1 获取可信产物

先提交新增文件并推送GitHub；在对应commit运行工作流，确认全部步骤成功。下载Artifact ZIP，解出.tar.gz和.sha256，核对Actions页面的完整commit和run-id。不要把仅有“构建成功”但冒烟失败的包用于部署。

通过已有SSH账号将两份文件传入其**私有目录**，例如`~/incoming/`（目录0700，文件0600）。不把包或任何配置放进public、Nginx根目录或SQLite目录。不要把本地.env随包上传。

### 6.2 服务器校验与准备

下面用真实下载文件替换中文说明，值必须加引号：

```bash
set -euo pipefail
cd ~/incoming
ARCHIVE='hushangyin-preview-实际12位提交号-实际run-id.tar.gz'
sha256sum --check "$ARCHIVE.sha256"
tar -tzf "$ARCHIVE" | sed -n '1,30p'
/opt/node24/bin/node --version
sudo test -f /opt/hushangyin/.hsy-managed
sudo test -d /opt/hushangyin/releases
```

SHA不一致或来源不明立即停止。Node应为24.22.2。没有合法管理标记时按[独立Node24指南](ECS_NODE24_PRIVATE_PREVIEW_GUIDE.md)完成严格接管，不手工touch标记，不覆盖source。现有SQLite继续留在`/var/lib/hushangyin/preview.sqlite`，不移动、不重新初始化。

### 6.3 只安装到新版本目录

以下命令不切换current、不启动服务，也不执行迁移。在同一个Bash会话填写Actions页面上的**完整40位commit**和数字run-id：

```bash
set -euo pipefail
EXPECTED_COMMIT='填写40位小写十六进制commit'
RUN_ID='填写数字run-id'
[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ && "$RUN_ID" =~ ^[0-9]+$ ]] || { echo '提交号或run-id格式不正确'; exit 1; }
# 格式检查失败就停止；不要继续执行下面命令。
TARGET="/opt/hushangyin/releases/ci-${EXPECTED_COMMIT:0:12}-${RUN_ID}"
sudo test ! -e "$TARGET"
sudo test ! -L "$TARGET"
# 若目标存在，停止；不要覆盖或清空旧release。
STAGE=$(sudo mktemp -d /opt/hushangyin/releases/.ci-unpack.XXXXXXXX)
sudo tar -xzf "$ARCHIVE" -C "$STAGE" --no-same-owner --no-same-permissions
sudo test -s "$STAGE/release/.next/BUILD_ID"
sudo /opt/node24/bin/node -e '
const fs=require("fs"),assert=require("assert/strict");
const m=JSON.parse(fs.readFileSync(process.argv[1]));
assert.equal(m.commit,process.argv[2]);assert.equal(m.workflowRun,process.argv[3]);
assert.equal(m.purpose,"private-preview-only");assert.equal(m.platform,"linux");
assert.equal(m.arch,"x64");assert.equal(m.node,"24.22.2");
assert.equal(m.siteUrl,"http://127.0.0.1:3120");
assert.equal(m.prismaBinaryTarget,"debian-openssl-3.0.x");
console.log("发布清单与目标构建匹配");' "$STAGE/release/RELEASE_MANIFEST.json" "$EXPECTED_COMMIT" "$RUN_ID"
# 上述任何校验失败均停止，保留临时目录供排查，不激活产物。
sudo mv -Tn "$STAGE/release" "$TARGET"
sudo test ! -e "$STAGE/release"
# mv未成功时停止，不对已存在的其他TARGET递归操作。
sudo chown -R root:hushangyin "$TARGET"
sudo chmod -R u=rwX,g=rX,o= "$TARGET"
sudo rmdir "$STAGE"
sudo -u hushangyin /bin/bash "$TARGET/deploy/ecs/run-runtime.sh" node --version
```

仅对本次新创建的release调整归属；不递归修改`/opt/hushangyin`、source、SQLite、备份或其他项目。推荐将该段保存成私有脚本，在顶部使用`set -euo pipefail`执行，确保校验失败不会继续；不要忽略命令非零退出。

至此新release已有`.next/BUILD_ID`，满足现有部署脚本的产物要求；在ECS没有执行构建或安装依赖。

### 6.4 激活边界

**本轮到安全安装为止，不自动激活。** 现有`deploy/ecs/deploy-preview.sh`内部包含备份与`migrate deploy`，不能把它误认为“只启动服务”的命令。未确认数据库迁移历史、兼容性和批准该流程前，不运行它；本轮CI没有执行它。

后续如用户另行批准私有预发布激活，按既有部署手册检查同一SQLite路径、runtime/app/backup配置、服务用户权限、独立3120及生产开关后，才手动调用已有流程。继续仅通过SSH隧道访问，不修改Nginx、systemd配置、DNS或公网安全组。不要为了使用本构建包重置数据库。

**当前状态：Linux无数据库构建与发布包运行验证完成；等待提交后首次GitHub Actions实跑，未部署ECS。**
