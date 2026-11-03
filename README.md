# 沪上银智能融资服务平台 V1.5.3

审核职责补充：现已支持“独立内容审核员”角色，仅拥有内容查看/审核权限，不含发布、客户或员工管理。超级管理员通过 [新增独立审核员](http://127.0.0.1:3000/admin/settings/users/new/?role=CONTENT_REVIEWER) 正式授权（需当前密码重新认证），新账号完成首次改密后，在 [内容审核中心](http://127.0.0.1:3000/admin/geo/reviews/) 进入具体版本并分配审核人。无需把审核员设成超级管理员。原作者、导入人和历史日志保持；本人参与版本不能自审，已分配版本不能由其他人直接批准。原60组FAQ没有自动发布，也没有自动提权现有员工。见 [审核权限专项报告](docs/GEO_REVIEW_PERMISSION_FIX_REPORT.md)。

补充修复：新增 [内容审核中心](http://127.0.0.1:3000/admin/geo/reviews/) 与 [公开融资问答](http://127.0.0.1:3000/faqs/)。问题库可直接创建关联文章并查看状态历史，发布/下线自动回算“已解答”。原超级管理员导入的FAQ属于本人内容，不能自审；需由另一位具有审核权限的人员核验，且补充真实来源后才能发布。未自动发布原60组FAQ，也未修改任何员工权限。操作与真实验收见 [审核发布修复报告](docs/V1.5.3_GEO_REVIEW_PUBLISH_FIX_REPORT.md)。

内容创作工作台：`/admin/geo/generation/`；任务记录：`/admin/geo/generation/tasks/`；超级管理员维护模板和参考资料：`/admin/geo/generation/templates/`。生成结果复用原文章草稿、独立人工审核与发布流程，不会自动发布。

**按用户决定，本机暂不配置模型密钥，不启用真实 AI 调用。真实 AI 生成与发布端到端验收未完成。** 知识库现有100道问题及60组FAQ保留；当前FAQ均待审核，不能直接作为事实依据。工程验收、限制和证据见 [V1.5.3报告](docs/V1.5.3_AI_GEO_GENERATION_REPORT.md)。

新环境在既有数据库执行 `npm run db:deploy`、`npm run generation:seed`（幂等、不覆盖已编辑模板）；运行网站用 `npm start`，独立终端用 `npm run worker:geo` 运行数据库任务执行器。此刻无需设置任何密钥；未经另行批准不得开启第三方知识外发。配置边界见 `.env.example` 与 [运行说明](docs/OPERATIONS.md)。`npm run test:generation` 使用独立 `_test` PostgreSQL 和明确标记的固定输出适配器，不代表真实模型调用；`npm run test:generation:browser` 验证实际本地页面。

问题库与常见问答现在都支持Markdown文件或文本粘贴导入：进入 `/admin/geo/questions/` 或 `/admin/geo/faqs/`，展开“Markdown导入” → 选择文件或粘贴 → 解析预览 → 勾选确认 → 导入。单次100条、1MB；默认跳过重复项，不覆盖现有内容；问答不会自动发布。问题库原CSV入口保留并共用校验和写入服务。

两份原始资料在V1.5.2阶段完成格式干运行；随后已由用户导入，当前数据库为100题、60组FAQ。模板在页面直接下载，也可访问 `/templates/geo-questions.md`、`/templates/geo-faqs.md`、`/templates/geo-questions.csv`。专项验收见 [V1.5.2报告](docs/V1.5.2_GEO_MARKDOWN_IMPORT_CN_REPORT.md)。

GEO内容运营中心：[本地后台](http://127.0.0.1:3000/admin/geo/)。包含融资问题库、CSV导入、文章/FAQ草稿、独立人工审核、发布下线和文章版本恢复。内容运营负责编辑，合格的超级管理员或独立内容审核员负责审核，超级管理员负责发布；不能审核自己参与创作或提交的版本。

知识入口仍为 `/insights/`，`/knowledge/` 兼容跳转，原4篇文章地址及正文保留。新文章发布后按请求从PostgreSQL生成页面与Sitemap，无需重建网站。图片上传未开通；AI草稿的工程接口已建立，但当前未配置密钥，自动发布始终不开放。使用说明及证据见 [V1.5.1报告](docs/V1.5.1_GEO_CONTENT_CENTER_REPORT.md)。

当前平台统一使用 `npm start`（生产构建本地运行）或 `npm run dev`。在本地测试模式下，旧8080入口自动跳转至3000；不要再用Python静态服务器运行当前平台。咨询专项修复与实际3000浏览器验收见[修复报告](docs/V1.0.2_CONSULTATION_FIX_REPORT.md)。

本轮保留一条标记为“V102合成”的虚构验收线索供后台核对。查看后可运行 `npm run test:consultation -- --cleanup`，脚本核对记录ID和合成标记后只删除对应测试数据。

本机已完成PostgreSQL联调，咨询可在 `http://127.0.0.1:3000/contact/` 真实提交至本地开发库，**仅限虚构数据测试**。见[数据库联调与验收报告](docs/V1.0.1_DATABASE_INTEGRATION_REPORT.md)。没有开放生产收集。

本项目便携数据库监听127.0.0.1:55432，不注册系统服务。正常Windows终端可运行 `node scripts/local-postgres.mjs start` / `status` / `stop`；数据库就绪后 `npm start` 或 `npm run dev`。开发/测试库独立，凭据不提交Git。首次管理员已初始化，登录邮箱见本机.env，随机登录密码仅在本机忽略文件 `.local-postgres/private.json` 的adminPassword字段，请勿分享。

`npm run test:integration` 对专用 `_test` 库执行实际API/权限/浏览器闭环，finally只清理本轮确切ID；`LOCAL_TEST_MODE=true` 禁止非本机域名开启测试咨询。旧V1.0报告的数据库待办属于历史状态，以下通用配置说明仍供新环境参考。

本目录已原地迁移为 Next.js App Router 模块化单体，保留原官网15个网址、品牌和深蓝金色设计。原 HTML/Python 文件保留作审计和回滚；当前开发入口为 Next.js。

## 新环境初始化（当前本机无需重复）

要求 Node.js 22.12+、PostgreSQL 16+。使用 npm 与 `package-lock.json`。

```bash
npm ci
# 将 .env.example 复制为 .env，按文件说明填入本地配置。
npm run db:generate
npm run db:validate
npm run db:deploy
npm run admin:create
npm run dev
```

官网 `http://127.0.0.1:3000/`，后台 `http://127.0.0.1:3000/admin/`。没有 PostgreSQL 时官网仍可浏览，咨询关闭，后台数据不可访问；不可认定已完成入库验收。首次管理员使用私有环境变量初始化，无默认账户密码；重复初始化不会覆盖原账户。

咨询入口默认 `CONSULTATIONS_ENABLED=false`；先完善真实隐私公示、数据库及安全配置，再显式开通。API 返回201才显示收到咨询，未配置或故障返回503。预审文件上传始终禁用。

## 工程与验证

- `src/app`：官网、后台、API、sitemap/robots；公开页沿用 `/insights/`，没有迁到 `/knowledge/`。
- `src/config/site.ts`：当前平台品牌、菜单、CTA、Footer 唯一配置。
- `src/components`：公共布局、交互、咨询和后台表单。
- `src/features/content/legacy-pages.json`：受控本地正文，来自原站；只有此本地资产通过 HTML 渲染，客户输入一律按文本处理。
- `src/features/leads`：事务咨询与授权、受权线索读取/处理；`src/lib`：DB、会话、校验、请求保护。
- `prisma/schema.prisma`、`prisma/migrations`：全部数据库结构与迁移。
- `src/app/brand.css`：当前平台品牌样式；`public/assets` 保留旧资源网址及 favicon。Tailwind 加 `tw:` 前缀用于新后台，不启用重置或覆盖原站同名类。

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
# 对运行中的本地服务额外设置 TEST_URL 再运行 npm test 和 npm run test:browser
```

数据库集成测试需要显式提供本机独立 `*_test` 数据库的 TEST_DATABASE_URL，未提供时会标为跳过。`PLAYWRIGHT_PATH`、`BROWSER_PATH` 可引用已有浏览器测试工具，无需引入生产依赖。

完整环境变量、迁移、管理员创建、生产环境、备份恢复、数据留存和回滚说明见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。审计见 [docs/PHASE-1-AUDIT.md](docs/PHASE-1-AUDIT.md)，原文件备份为 `backups/pre-v1-20261028.zip`。

旧V1.0实现及当时的数据库待办见[《沪上银 V1.0 开发与验收报告》](docs/V1.0_DEVELOPMENT_ACCEPTANCE_REPORT.md)。当前数据库联调与完整验收以本页顶部V1.0.1报告为准。

## 以下为旧静态站历史说明

下面 Python 运行/组件同步仅适用于保留的旧静态站，不会修改 Next.js 当前页面。不要用旧生成脚本更新新平台。

### 沪上银品牌官网 MVP（历史）

根据提供的 PRD 构建的 **静态多页面可运行网站**。中文响应式，深蓝/科技蓝/金色品牌视觉；无需编译依赖。

## 旧静态运行方式已停用

原来的Python静态预览会加载归档页面，不能接入当前咨询业务。当前项目只使用上方Next.js启动命令。旧HTML和Python源仅保留作历史审计/恢复，不作为平台入口。

## 公共导航和页脚维护

- `site_config.py` 统一维护品牌、CTA、菜单名称/链接和页脚分组；新增栏目只需在此添加菜单，并为它提供实际页面。
- `components.py` 在构建期输出导航与 Footer，所有链接直接存在于 HTML 中，搜索引擎无需执行 JavaScript。
- 修改配置或组件后运行 `python update_components.py`，只同步现有 15 页的公共区域，不重新生成网站正文、head、sitemap 或 robots。
- `assets/navigation.css` 管理导航样式；`assets/navigation.js` 管理折叠、Esc、焦点及宽度适配。1240px 以下折叠，以上还会按实际菜单宽度检测是否足够。
- 原有 `build.py` 也复用同一配置与组件，后续生成内容不会恢复旧导航。本次修复没有运行全站生成。
- 静态回归：`python tests/check_components.py`。浏览器回归：安装了 Playwright 的环境运行 `node tests/navigation.cjs`；可通过 `PLAYWRIGHT_PATH`、`BROWSER_PATH`、`TEST_URL` 指定现有工具与服务，无需修改项目依赖。

## 已实现

- 15 个独立 HTML 页面：首页、品牌介绍、企业/个人融资、产品方案、资料预审、模拟案例、风险提示、联系、隐私、知识库及 4 篇知识文章。
- 产品类别筛选、移动导航、FAQ 折叠、咨询表单输入校验与知情同意、多文件格式和 10MB 大小本地检查。
- 每页独立 `title`、`description`、canonical、OG、语义化 HTML、JSON-LD（Organization、WebPage、BreadcrumbList、Article），自动生成 sitemap.xml、robots.txt。
- 产品评估用语审慎，不承诺授信结果；PRD 虚拟案例明确标示“模拟案例”，避免虚构业绩。

## 重要：此版本尚非可接收实际客户资料的生产版

- **咨询表单不会向服务器提交信息。** 校验通过后明确提示未发送；需要接入服务端受控 API、数据库及后台权限体系。
- **文件预审仅本地检查格式与大小，不上传文件。** 敏感征信、流水、身份证资料需在上线前完成安全设计、授权及隐私政策。
- 真实电话、微信二维码、办公地址、公司法定全称、备案号、服务数据、银行合作关系未获提供，不虚构；正式上线前补齐并核实。
- 网站当前不存在真正的 AI 贷款评估或银行产品 API。
- 任何“1工作日联系/1-2工作日评估”须在建立实际运营履约机制后才能启用。

## 正式发布前必改

1. 在 `build.py` 中将 `SITE = 'https://www.example.com'` 改成真实域名，再运行 `python3 build.py`，确保 canonical、OG、sitemap 和结构化数据全部准确。
2. 配置 HTTPS、真实联系方式、主体名称、合法备案公示、实际隐私政策、客户同意文本和安全咨询 API。
3. 如需上传征信及流水，建议：病毒检测/文件魔数校验/类型大小限制/鉴权/加密对象存储/短期留存/审计日志/访问权限/删除机制，并进行安全与合规审核。
4. 用经过授权且可以核实的真实案例替换模拟情景，并取得适当客户授权；不可自行生成银行合作 Logo 或成功率。
5. 用实际可维护的融资产品目录填充条件，不要展示未经核实的利率/额度承诺。

## 后续 GEO / SEO 内容扩展

- 新建知识文章：在 `/admin/geo/articles/` 保存草稿、预览、提交审核，由另一名具有审核权限的人员核验后，授权发布人发布。不要使用旧 `build.py` 代替当前内容后台。
- 每篇文章优先直接回答一个具体问题，在适当位置解释适用范围、证据来源和不确定性；增加真实机构信息、真实作者或审核人、发布日期/更新时间（只有真实可信时才标注）。
- 核对信息准确性、公开来源可核验性与内容更新机制。JSON-LD 可帮助搜索引擎理解内容，但**不能保证被生成式搜索引用或推荐**。
- 网站上线后提交 sitemap 至相关搜索引擎站长平台，观察抓取、收录和咨询转化数据。

## 技术说明

当前运行架构为 Next.js + TypeScript + PostgreSQL/Prisma，使用 npm 构建。Python静态生成器和原HTML只作历史审计保留，不作为当前运行或内容发布入口。
## V1.0.3 账号与权限入口

运行中的本地平台：`http://127.0.0.1:3000/`。员工管理 `/admin/settings/users/`、个人资料及改密 `/admin/settings/profile/`、部门 `/admin/settings/departments/`、权限矩阵 `/admin/settings/roles/`。

复用现有超级管理员登录，先创建部门，再新增员工并指定适用的内置角色。新增/重置凭据只支持本地测试，15分钟有效、首次登录强制改密。原管理员密码未修改。详细运行、备份与安全边界见 `docs/OPERATIONS.md`，验收结果见 `docs/V1.0.3_ACCOUNT_RBAC_REPORT.md`。


## 独立内容审核员授权与任务分配

- 超级管理员进入 `/admin/settings/users/`，选定员工，点击“配置审核权限”→“授予内容审核权限”，确认岗位切换并验证当前管理员密码。复用既有 CONTENT_REVIEWER，只有内容查看和审核权限，不含发布和客户数据。已初始化员工保留原密码，重新登录即可；此操作会替换原岗位权限。
- 新账号由本人在 `/admin/login/` 使用安全交付的短期初始凭据登录，按引导在 `/admin/settings/profile/` 首次改密。已激活账号无需再次初始化。系统不会自动改变已有员工的角色或密码。
- 在 FAQ/文章待审核版本详情中查看“审核人分配”，刷新资格，核对姓名、角色、部门后保存。排除原因逐人列出；停用、未激活、没有审核权限、参与该版本的账号均不能分配。必须补来源时，作者先撤回，再编辑、保存、重新提交，并重新分配新版本。
- 审核员从 `/admin/geo/reviews/?view=pending&mine=true` 查看“分配给我的待办”，核验全文和来源后批准或驳回。超级管理员从 `/admin/geo/reviews/?view=ready` 进入已审核版本，单独点击“发布到官网”。审核不等于发布。
- 完整本地验收及原始数据保护结果见 `docs/V1.5.3_INDEPENDENT_REVIEWER_FIX_REPORT.md`。复测命令 `npm run test:independent-reviewer` 只使用本地虚构人员和内容，精确清理本轮测试记录；不要并发执行会写同一开发库的测试，也不要为测试清空登录限速。

## FAQ风险分级简化审核

当前FAQ以基础知识、融资实操、高风险具体内容分级。普通定义不再强制HTTPS来源，独立审核人员保存专业判断和综合确认即可；具体银行、政策、利率和数量主张须逐项核验公开或受控内部证据，高风险保留详细记录。审核通过后仍单独授权发布。

`/admin/geo/reviews/` 提供批量分配、逐条记录的低风险审核及超级管理员受控资料登记；没有批量自动发布。文章保持原详细审核。详见 `docs/GEO_REVIEW_SIMPLIFICATION_REPORT.md`；当前真实浏览器专项 `npm run test:review-risk`，原100题及60组FAQ保持。


## 自定义 GPT-6 Sol 网关配置（2026-10-31）

本地配置位于 `D:\Codex\hushangyin-site\.env.local`，请在 `AI_API_KEY=` 后填写本人密钥。本次保持空白；模型 `gpt-6-sol`、基础地址 `https://maimai.it.com/v1`、推理强度 `medium`。密钥只在服务端读取，不使用 NEXT_PUBLIC_。

填写后重启 Next.js 和 Worker。`npm start`（或 `npm run dev`）与 `npm run worker:geo` 都加载 .env 及 .env.local；系统环境变量优先。工作台 `/admin/geo/generation/` 显示连接状态，具有生成管理权限者确认可能费用后点击“测试模型连接”。每次测试单独确认，不自动重试；成功仅代表短连接检测，不代表文章生成验收。

等待用户填写 API Key 后进行真实模型调用验证。参数兼容与网关计费幂等性未验证，不自动切换模型；费用不确定的失败须先核对再人工重试。生产示例开关默认关闭。详见 [配置与验收报告](docs/V1.5.3_GPT6_SOL_API_CONFIGURATION_REPORT.md)。

## V1.5.4 第一方分析与咨询归因

后台入口：`/admin/geo/analytics/`、`/admin/geo/analytics/search/`、`/admin/geo/visibility/`。

先执行 `npm run db:deploy`。本地采集须开启 `ANALYTICS_ENABLED` 且由访客主动同意；生产批准开关默认关闭。`npm run test:analytics` 执行隔离数据库测试，`npm run test:analytics:browser` 验证真实本地浏览器链路。`npm run analytics:maintenance` 执行分析数据保留策略。

详细指标、权限、隐私、平台适配边界、定时维护和回滚见 [分析运维说明](docs/V1.5.4_ANALYTICS_OPERATIONS.md)。搜索平台未授权，不提供自动曝光或AI引用量。
