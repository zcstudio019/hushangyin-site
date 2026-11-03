# 文章提交审核版本冲突专项修复报告

日期：2026-11-02。项目：D:\Codex\hushangyin-site；验收地址：http://127.0.0.1:3000 。仅修改本地项目，未部署生产。

## 1. 实际故障原因与复现

实际浏览器打开原AI草稿 `cmvylxebi0005t1psq3wu3qo3`，点击“提交审核”。POST工作流请求 revision=1，数据库操作前后都是 revision=1、DRAFT。后端HTTP409的真实代码是 **COMPLIANCE_REQUIRED**，不是 STALE_VERSION。

`src/features/geo/workflow-feedback.ts / workflowFailureMessage` 把除少数特殊情况外的所有409统一解释为版本修改或撤回，掩盖了后端正确返回的合规原因；`WorkflowForm` 也未展示 details 中的具体阻塞项。这是本次“版本冲突”的直接原因。没有证据表明本次原稿故障来自Next.js缓存或其他人并发保存。

同时存在两个核验问题：

1. `article-check.ts / checkGeneratedArticle` 仍通过 currentFaqSources 强制FAQ有外部网址，与已上线的专业人工判断审核不一致。文章关联的5条不同FAQ因此输出5条相同文案，既误报又无法定位对象；不是每次点击都往数据库无限追加。
2. `compliance.ts / compliance` 用关键词判断承诺，不识别第21行“不应将咨询服务描述为保证获批或保证放款”的否定作用。扩充获批检测时还发现第45行“咨询服务等于保证贷款获批吗？”是问答标题，应交人工核对答案，不能直接当肯定承诺。

另发现保存/审核有潜在同步窗口：原编辑器保存后只 router.refresh，独立的工作流组件继续依赖旧props；二者也没有共享忙碌状态。本次一并修复，未删除任何版本比较。

证据：`test-results/article-version/reproduction.json`、before.png；最终原稿复测位于 result.json 的 originalRetest 和 after-original.png。证据不含密钥、Cookie或客户资料。

## 2. 修改文件与函数

| 文件 | 修改 |
| --- | --- |
| src/features/geo/workflow-feedback.ts | 按COMPLIANCE_REQUIRED、STALE_VERSION、STATE_INVALID、权限、证据、服务异常分别显示中文错误 |
| src/components/forms/ContentEditingSession.tsx（新增） | 同一文章编辑/工作流共享已保存版本、未保存标记和同步操作锁 |
| src/components/forms/GeoForms.tsx | ContentEditor立即采用保存返回版本；WorkflowForm使用该版本并阻止保存中/未保存提交；展示合规详情与过期差异入口 |
| src/app/admin/(protected)/geo/[kind]/[id]/page.tsx | 用同一内容快照核验及渲染，避免另查文章造成核验与编辑器版本不一致；接入共享状态 |
| src/features/geo/service.ts | conflict返回明确的预期/实际版本；同版本重复提交幂等；版本快照去除请求的基准revision |
| src/features/generation/article-check.ts | 复用FAQ有效审核规则，承认同版本发布；逐对象提示、去重并保留真实风险 |
| src/features/generation/knowledge.ts | 导出已有usableFaq供文章核验复用，没有创建第二套资格规则 |
| src/features/generation/compliance.ts | 否定语境、问句及肯定承诺分开处理，给出正文行号和实际片段 |
| src/features/generation/config.ts | 核验项支持对象、位置与原文片段 |
| src/components/forms/GenerationWorkspace.tsx | 显示实际命中片段；历史生成提示与当前核验分开标注；新增已保存版本重新核验按钮 |
| tests/v1/article-version.test.ts（新增） | 承诺语义及错误分类测试 |
| tests/article-version/browser.cjs（新增） | 实际浏览器保存/并发/审核发布及原故障复测 |
| tests/v153/generation.test.ts | 补充人工保存后迟到/重复AI结果不能覆盖正文和版本的隔离数据库测试 |
| package.json、eslint.config.mjs | test:article-version命令及测试目录检查 |
| 本报告 | 真实结果及剩余内容要求 |

无新增依赖、Schema或迁移；现有7个迁移保持。未修改管理员凭据、角色或AI密钥。

## 3. 保存与并发规则

- 服务端保留原Prisma事务、全体内容写入共用的数据库锁及revision比较。真实过期请求仍返回409 STALE_VERSION；保存失败不会覆盖数据库。
- 一次成功内容保存创建新revision及对应article_versions快照，撤销旧版本审核/分配，保持线上已发布快照不变。请求revision只是乐观锁基准，不再混入新快照正文数据。
- 前端直接使用成功响应中的新revision，不等待刷新完成才更新工作流。router.refresh继续同步服务端历史和权限。
- 修改输入后标记未保存；保存中、审核处理中共用同步锁。保存中和未保存时审核按钮禁用，提交事件也再次校验；Markdown工具插入同样标记未保存。
- 发生真实冲突时保留本地输入。保存冲突提供“查看服务器最新版本差异”，展示最新版本及正文；审核冲突提供另开服务器预览入口。不会自动合并、刷新覆盖或提升旧请求版本后重试。
- AI Worker原本只在任务合法租约内原子创建唯一关联草稿，不会按旧结果覆盖既存文章。隔离库新增验证：人工保存版本2后再次送达旧任务结果，正文和版本2均保持。

## 4. 审核提交状态与错误

草稿保存 → 当前版本提交 → IN_REVIEW → 独立人工审核 → APPROVED → 授权发布。AI来源和人工文章沿用相同流程；修改后重新审核，审核通过不会自动发布。

| 情况 | 行为 |
| --- | --- |
| STALE_VERSION | 指出请求版本、服务器版本与状态，查看差异后处理 |
| COMPLIANCE_REQUIRED | 明确提示必须修复，并在按钮附近逐条列出具体原因，不叫版本冲突 |
| STATE_INVALID / REVIEW_LOCKED / APPROVAL_REQUIRED | 显示当前状态限制，不混作内容被别人编辑 |
| 无提交/审核权限 | 服务端按原RBAC拒绝，页面显示中文原因 |
| 同版本已待审核 | 返回alreadySubmitted:true，不重复更改提交人、时间或写提交审计 |
| 503 / 网络超时 | 显示尚未确认结果，输入保留，先核对再决定重试 |

幂等判断在版本比较之后执行，因此旧版本不会被当成当前待审核版本成功接受。相同版本提交仍必须通过服务端身份与content.update验证。

## 5. 核验规则与去重

FAQ检查复用现有风险审核判断：只有正确版本的独立审核记录及有效依据才能使用；低风险/无具体主张的一般知识可沿用完整专业判断记录，不强制虚构外部网址。引用版本已正式发布时按同版本公开快照核对；该FAQ另起新草稿，不会把未审核新答案替换进文章，也不会错误否定仍有效的旧公开版本。

真正失效时提示具体FAQ题目、ID及引用版本。规则结果按规则+对象+位置去重：不同FAQ仍各自显示，不能为减少数量而隐藏真实问题。页面核验从数据库现算，不追加历史数组；重新核验不会增加相同项，不改文章版本，也不会悄悄把关联更新为未经作者确认的新版本。

肯定“保证放款”等承诺仍为MUST_FIX，提供正文行和片段。否定提醒不当作承诺；问答标题保留VERIFY及相邻答案核对提示。加入“不需要资料就保证放款”“不审核也保证放款”“我们保证放款，是否满意？”等反例，不能仅靠否定词或问号降级。

模型生成时的知识提示、待核实事项明确标注历史快照，与当前规则结果分开。来源失效、版本失效、未授权个人信息和真实承诺仍会阻止提交；利率、额度、具体产品、政策、合作与案例保留人工核验提示。文章保持原详细审核，不把AI自评或通用FAQ专业判断当成文章已核验结论。

普通知识文章可使用支持实际正文的公开知识来源，无需强行提供具体银行产品资料。生成文章仍须按现有来源规则登记真实依据及正文对应关系；本次没有取消来源要求或自动填日期。

## 6. 实际API、数据库和浏览器结果

专项使用虚构软件/融资科普流程文章，技术引用仅支持软件元数据说明，不支持银行利率等金融事实。为覆盖AI来源检查，仅给本轮合成文章附加明确标注“本地确定性夹具（非真实AI）”的元数据和FAQ关系；所有保存、提交、审批、发布状态均走原受保护API，没有直接改数据库审核状态，未调用AI。

最终真实Edge浏览器专项7组全部通过：

1. 编辑后审核禁用；实际PATCH延迟期间仍禁用；成功后版本2显示、版本行及快照正文一致。
2. 两个页面同开版本1，一处保存后，另一处保存及审核均409 STALE_VERSION，本地输入保留且可查看服务器差异。
3. 当前版本POST提交成功，数据库IN_REVIEW；重复同版本返回alreadySubmitted，只有1条CONTENT_SUBMIT审计。
4. 运营作者不能自审；独立审核员实际页面批准，授权人员发布，公开路径200且Sitemap包含测试文章。
5. FAQ同版本发布、新未审核草稿不误使旧公开版本失效；真实下线失去依据后出现具体FAQ，重复核验始终只有1项。
6. 浏览器注入503时明确错误、保留编辑输入；不把故障注入写成真实数据库断开。
7. 原故障文章再点击提交返回COMPLIANCE_REQUIRED，页面不再提示版本冲突；真正MUST_FIX只剩NO_SOURCE，问句为VERIFY。原稿仍revision1、DRAFT，没有替用户批准或改写。

专项测试文章ID `cmvyn3duv001jt1bowuft1ftz`，审核提交版本2，公开验收200。测试结束已下线并按本轮ID清理，不保留虚构公开内容。测试前后：100问题、60FAQ、6文章、7文章版本、3原员工、2线索保持一致。

证据：test-results/article-version/result.json、before.png、after-original.png、workflow.png；咨询/发布回归 test-results/v151/result.json，账号回归 test-results/v103/result.json，隔离任务 test-results/v153/isolated.json。

内置浏览器连接桥不可用后使用本机Edge/Playwright访问真实服务。未用Mock页面代替；只有503场景明确使用浏览器网络故障注入。初始整库保护快照被自动审批拒绝，因会复制无关客户与密码哈希；已改为最小目标元数据、非敏感数量及虚构记录核对，没有复制这些敏感数据，也未清空数据库。

## 7. 工程与回归结果

| 检查 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| ESLint | 通过 |
| 生产构建 | 最终版本通过，本地服务运行新构建 |
| Prisma validate / migrate status | 通过，现有7个迁移最新，无新迁移 |
| npm test | 30通过、1跳过、0失败；跳过专门无数据库HTTP服务用例，未配置其测试地址 |
| npm run test:generation | 16通过，真实隔离PostgreSQL、确定性适配器；含迟到结果不能覆盖人工保存版本及事务校验 |
| npm run test:article-version | 7组实际浏览器检查通过，原故障也已复测 |
| npm run test:geo | 19项通过，版本历史、已发布快照隔离、独立审核/FAQ发布、Sitemap及咨询POST201/授权事务 |
| npm run test:rbac | 30项通过，员工/部门隔离、改密、停用、近期认证、越权与实际咨询入库 |

构建初次遇到Windows Prisma DLL被运行中的Worker占用；停止本项目Worker后重建成功，未删除运行库。专项补充原稿复测时发现疑问标题的额外误报，修正规则并重跑通过；测试脚本曾有局部变量重名，修正后重跑，没有伪报先前失败为通过。

## 8. 当前原稿如何继续与未执行项

原稿入口：http://127.0.0.1:3000/admin/geo/articles/cmvylxebi0005t1psq3wu3qo3/ 。它仍缺真实依据，**不是所有阻塞都应由代码自动消除**。

请在AI创作的“写作模板与参考资料”登记真实、有效且支持正文的资料；在文章来源区填写对应标题、网址、真实核验日期及正文原段落，保存新版本后点击“重新执行事实核验（已保存版本）”。解决所有MUST_FIX后再提交，VERIFY交给独立审核人核对。不要伪造来源或为通过而删除真实风险，也无需重新付费生成文章。

没有在共享开发库实际停库测试审核API；已验证503前端反馈及隔离库事务/回滚，真实数据库网络中断仍标为未执行。没有演练多个独立部署实例，仅在本地用两个实际页面及原数据库并发规则验收。未针对本次重新调用付费模型，迟到任务采用隔离测试适配器，不等于真实AI调用验收。

真正变更到不同FAQ版本的引用不会自动追新，必须由作者核对原文与新知识后处理；当前核验仅提示并阻止失效引用，不擅自改写文章或审核历史。规则属于辅助，不能替代逐项金融事实和适用日期核验。
