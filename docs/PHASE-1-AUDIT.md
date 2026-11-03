# Phase 1：现状审计与迁移方案

2026-10-28。完整原文件备份：`backups/pre-v1-20261028.zip`（37 文件）。逐页路由、Title、Description、表单及 SHA-256 见 `legacy-audit.json`。

原技术栈为 Python 标准库模板生成、静态 HTML、多页面原生 JavaScript 和 CSS；没有 package.json、框架、数据库或部署脚本。15 页路由：`/`、`/about/`、`/enterprise/`、`/personal/`、`/products/`、`/precheck/`、`/cases/`、`/insights/`、`/risks/`、`/contact/`、`/privacy/`，以及 `/insights/` 下 enterprise-loan-guide、cash-flow-vs-profit、credit-report-check、mortgage-business-loan 四篇文章。

Header/Footer 来自 components.py，site_config.py 为统一菜单配置；此前的 `{name}` Python 插值错误已修复。复用现有品牌、CSS Logo、Hero 图形、响应式、产品/案例/知识文章和语义化正文。页面具备 Title、Description、canonical、OG、JSON-LD、sitemap、robots，但域名仍为 example.com，发布前必须替换。文章有现有一般知识说明，没有可核实的作者、发布时间和引文来源，迁移不新增虚构作者/数据。

咨询表单只有本地验证，不发送；文件选择仅本地检查。迁移时替换为真实 API 表单，关闭文件选择；同步咨询页和隐私页的演示说明以免误导。所有原静态文件保留供比对/回滚，不将 HTML 文件复制到 Next public 以免绕过服务端布局。

实施顺序：同目录手工建立 Next App Router + TypeScript + Tailwind；提取受控本地正文，Header/Footer 迁为共享 React 组件；数据库 Prisma/PostgreSQL；事务咨询 API；iron-session 加密 Cookie + 可撤销数据库会话 + Argon2id 密码；受控后台；环境化 SEO；回归和操作文档。维持旧路径及 trailing slash，不用 /knowledge/ 替换已有 /insights/。

风险与边界：数据库未连接时拒绝保存；敏感读写服务端鉴权，公开内容不包含数据库客户资料；无文件接收端点；保留旧站直到实际验收；生产 SITE_URL/HTTPS/密钥、备份加密及真实隐私公示需由运营部署环境提供。本机审计未发现 PostgreSQL 服务或 DATABASE_URL，不假定数据库验收已通过。
