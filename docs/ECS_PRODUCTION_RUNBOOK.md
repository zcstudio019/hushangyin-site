# 沪上银生产发布与 HTTPS 开放

## 审计结论

现有私有预发布具备 Linux x64 构建、Node 24、OpenSSL 3 Prisma 引擎、只读发布包、SQLite 在线加密备份和 loopback 服务。现有预发布包绑定 HTTP 回环地址，现有回滚脚本只切换应用链接，不能单独用于跨环境回退。生产新增正式域名构建、空库初始化、生产配置检查，以及同时恢复应用和配置的切换流程。

本站现有 Nginx 文件、证书和预发布数据库继续使用原位置。正式开放前需在 ECS 核对实际 systemd 单元、证书链、监听归属、DNS、备案及业务开放条件。按现场配置判断是否已存在额外 Nginx location 级访问控制。模板证书路径与现场不同，保留现场文件。

## 构建与上传

在 GitHub Actions 的 **Linux release build** 手动选择 `production`。下载可信运行对应的生产包和 SHA256，一并上传到 ECS 上的私有暂存目录。构建在 Ubuntu 22.04 容器中完成，使用 Node 24.22.2 和 OpenSSL 3。默认模式仍是 `preview`。禁止将当前 `preview-df66df45-41786821880` 用作生产包。

以下命令在 ECS 的 root Bash 中执行。先进入上传目录，并把文件名和版本号替换成此次构建的值。

```bash
archive='hushangyin-production-<commit>-<run>.tar.gz'
release='/opt/hushangyin/releases/production-<commit>-<run>'
sha256sum --strict --check "$archive.sha256"
test ! -e "$release" && test ! -L "$release"
install -d -o root -g hushangyin -m 0750 "$release"
(umask 022; tar -xzf "$archive" -C "$release" --strip-components=1 --no-same-owner --no-same-permissions)
chmod 0750 "$release"
```

上面的尖括号为占位符，输入命令前需替换。每条命令成功后继续。归档和校验文件来自同一可信 GitHub 运行，校验和用于检测传输损坏。不要将未验证的归档以 root 解压。

## 生产配置和空库初始化

1. 保持 Nginx 回环访问限制。确认 `hushangyin-worker.service` 已停止且为 disabled 或 masked。确保只有 `hushangyin-web.service` 使用 127.0.0.1:3120，保留现有预发布正常运行。
2. 将 `deploy/ecs/app.env.example` 复制为 `/etc/hushangyin/production.app.env`。将 `deploy/ecs/backup.env.example` 复制为 `/etc/hushangyin/production.backup.env`，设置 `SQLITE_BACKUP_DIR=/var/backups/hushangyin/production`。两份配置均使用 LF、`root:hushangyin`、`0640`，每行一个不带引号的键值。若文件已存在，先审阅并保留。暂存文件与当前生效的 `app.env`、`backup.env` 分开。
3. 私下填写不同的 `SESSION_SECRET` 和 `RATE_LIMIT_SECRET`，各使用独立的 32 字节以上安全随机值，建议 64 位十六进制文本。保留既有 32 字节备份密钥及其独立安全副本。AI、MySQL 凭据留空，咨询、分析、AI 外发和 Worker 开关全部为 `false`。不在聊天、历史或日志中粘贴密钥。
4. 创建专用备份目录。生产备份与预发布备份各自保留。

```bash
install -d -o hushangyin -g hushangyin -m 0700 /var/backups/hushangyin/production
APPROVE_HSY_PRODUCTION_DEPLOY=true APPROVE_HSY_EMPTY_PRODUCTION_DB=true \
  bash "$release/deploy/ecs/deploy-production.sh" init-db "$release"
```

初始化只接受全新路径，通过独占创建防止覆盖，再运行现有 SQLite Prisma 迁移并核对 WAL、外键与完整性。预发布数据库留在原处。若初始化中途失败，保留失败文件和日志进行诊断。脚本会拒绝覆盖或自动重试；需要重试时，人工将残留数据库与侧文件整体移入私有隔离目录，再经确认重跑。此步骤不导入预发布账户、会话、测试客户或内容。经审批的公开内容可另走审核导入流程。

在生产库建立专属管理员。以下示例在 root Bash 中使用临时权限文件，凭据由终端读入，不作为命令参数。密码至少 16 字符，使用随机长密码；示例限制为无空格、不含引号和反斜杠的可打印文本，避免配置解析歧义。关闭 shell 跟踪。

```bash
(
  set -e
  set +x
  umask 077
  bootstrap=$(mktemp /etc/hushangyin/.admin-bootstrap.XXXXXXXX)
  trap 'rm -f -- "$bootstrap"' EXIT
  read -rp '生产管理员邮箱: ' email
  read -rsp '生产管理员密码: ' password
  printf '\n'
  [[ "$email" =~ ^[A-Za-z0-9_.+@-]+$ && "$password" =~ ^[A-Za-z0-9_!@%+.,:-]{16,}$ ]]
  printf 'ADMIN_EMAIL=%s\nADMIN_NAME=ProductionAdmin\nADMIN_PASSWORD=%s\n' "$email" "$password" > "$bootstrap"
  unset password
  chgrp hushangyin "$bootstrap"
  chmod 0640 "$bootstrap"
  cd "$release"
  runuser -u hushangyin -- bash deploy/ecs/run-runtime.sh node \
    --env-file=/etc/hushangyin/production.app.env --env-file="$bootstrap" \
    --conditions=react-server --import tsx scripts/create-admin.ts
)
```

## 生产发布

```bash
APPROVE_HSY_PRODUCTION_DEPLOY=true \
  bash "$release/deploy/ecs/deploy-production.sh" deploy "$release"
curl --fail --silent --show-error --resolve hushangyin.linhongtech.com:443:127.0.0.1 \
  https://hushangyin.linhongtech.com/api/health/
```

脚本先检查 Linux 包、专属服务、数据库与配置。已有库必须通过 Prisma validate、结构差异检查、迁移历史与 SQL 校验和、WAL、完整性和管理员检查。存在待迁移、失败、历史不一致或不明确的兼容性时，停止在切换前。后续迁移须在独立恢复副本上演练，确认向后兼容和恢复计划，经批准后在维护窗口单独执行。含破坏性或不可逆操作的迁移须先单独审查，禁止在发布脚本中自动执行。

脚本生成生产 SQLite 在线加密备份，记录现有应用和环境快照，停止专属 web 服务，替换两份配置并原子切换 `current`，随后重启并检查应用健康与 robots 域名。同一端口切换会短暂中断本站，请安排维护窗口。应用切换不会还原数据库。保留脚本输出的 `rollback-production.*` 路径；其中含旧配置，仅 root 可读。若主机断电、进程被强制杀死或自动回退失败，保持入口关闭，按下节人工恢复。

## 应用回滚

跨环境回退前恢复本站 Nginx 的私有访问限制并验证生效。先核对快照所指版本、两份配置的数据库目标及其兼容性。现有 `rollback.sh` 仅适用于同环境且已确认数据库向后兼容的版本。

```bash
# 设置为发布脚本输出的实际快照目录
snapshot='/etc/hushangyin/rollback-production.<id>'
target=$(cat "$snapshot/release")
test -f "$target/.next/BUILD_ID"
systemctl stop hushangyin-web.service
for file in app.env backup.env; do
  temp=$(mktemp /etc/hushangyin/.restore-env.XXXXXXXX)
  install -o root -g hushangyin -m 0640 "$snapshot/$file" "$temp"
  mv -Tf "$temp" "/etc/hushangyin/$file"
done
switch=$(mktemp -d /opt/hushangyin/.restore-link.XXXXXXXX)
ln -s "$target" "$switch/current"
mv -Tf "$switch/current" /opt/hushangyin/current
rmdir "$switch"
systemctl restart hushangyin-web.service
curl -fsS http://127.0.0.1:3120/api/health/
```

在失败即停止的 Bash 会话中逐步运行，恢复后验证同一域名的私有 HTTPS 及前一版本数据库。回退到预发布时保持私有访问。任何并发发布或备份作业应避开人工恢复窗口。

## 数据库恢复

1. 从生产备份目录选定归档及 manifest，核对 SHA256、时间、来源和密钥可用性。确定可接受的恢复点以及备份后的写入损失范围。
2. 用可信发布版本的 `scripts/sqlite-backup.mjs restore` 以服务用户恢复到 `/var/lib/hushangyin/` 下全新文件。恢复脚本会认证解密、检查完整性和外键。

```bash
cd "$release"
runuser -u hushangyin -- env \
  BACKUP_FILE='/var/backups/hushangyin/production/<reviewed>.db.aes' \
  RESTORE_DATABASE_FILE='/var/lib/hushangyin/production-restore-<id>.sqlite' \
  bash deploy/ecs/run-runtime.sh node --env-file=/etc/hushangyin/production.backup.env \
  scripts/sqlite-backup.mjs restore
```

3. 对恢复副本确认 WAL、结构、迁移历史、账户和业务数据；必要时先在隔离环境验证。需要启用副本时先恢复私有入口，停止本站 web，确认 Worker 关闭且备份作业结束。将旧库及 WAL、SHM、journal 文件归档到同盘私有目录，确认无活动连接后将验证副本原子放到原路径，核对所有权与 `0600`，再启动并验证。不得将备份覆盖到运行中的数据库。

## 公网开放清单

- 回环健康返回 `{"status":"ready"}`，现场 HTTPS 使用正确 SNI 并校验证书链，首次管理员可通过 HTTPS 登录，Cookie 有 `Secure` 和 `HttpOnly`。核对首页 canonical、Open Graph、站内链接、robots、sitemap 及登录重定向。验证咨询、分析、AI、Worker 仍关闭。
- 核对公网 A 记录指向 `8.136.24.59`，核对 AAAA、证书有效期、域名归属、备案和业务开放审批。用现场已知的其他站点 URL 记录变更前状态。
- 审批后将 `/etc/nginx/conf.d/hushangyin-site.conf` 备份到 `/etc/nginx/conf.d` 之外的 root 私有目录。只解除本站公开内容的回环限制，保留 `/api/health/` 的本机限制。按运营要求决定是否继续限制后台入口，并确保登录 API 同样受到限制。保留现场证书、限流、代理、文件拦截和其他站点配置。
- 执行 `nginx -t`，成功后平滑 `systemctl reload nginx`。从外网验证公开页面、HTTP 到 HTTPS 跳转，以及其他网站状态。异常时恢复本站配置，重新执行 `nginx -t` 和 reload。不要用 `curl -k` 代替证书验收。

## 验证记录

- 本地 Ubuntu 22.04 x64、Node 24.22.2、Prisma OpenSSL 3 构建及离线发布包验收通过。正式域名的 canonical、Open Graph、robots、sitemap、站内链接、登录跳转和 Secure Cookie 均通过 HTTP 冒烟测试。
- 隔离 SQLite 完成迁移、结构比对、WAL、完整性、管理员登录、GEO 写入及加密备份恢复。两进程并发测试提交 40 次写入，未丢失更新。只读发布包的 Prisma 验证、迁移和 CRUD 通过，包文件指纹不变。
- TypeScript、ESLint、Linux Shell 语法、预发布回归和生产切换回归通过。生产切换回归使用临时路径和替身服务。Linux 包测试在 Ubuntu 容器通过，直接在 Windows 运行时有两项受 Unix 执行位和符号链接权限限制而失败。
- GitHub 托管运行、ECS 实际切换、现场私有 HTTPS、公网 DNS、证书及其他站点回归待执行。真实生产数据库、密钥、Nginx 和公网访问限制未改动。
