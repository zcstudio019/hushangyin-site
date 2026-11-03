### 1. 问题原因

原 `build.py` 的 `header()` 将链接拼成三段：`f'<a href="{url}" '`、当前页属性，以及普通字符串 `'>{name}</a>'`。Python 的 f-string 插值只作用于有 `f` 前缀的那一段，最后一段没有插值，所以全部 15 个 HTML 页面显示字面量 `{name}`。问题源于构建期 Python 模板，而非浏览器 JavaScript。

原导航在 1190px 下缩小到 11px，1000px 才折叠；缺少 Esc 关闭和完整状态复位。Footer 虽已在生成脚本中共用函数，但其链接/名称另行硬编码，尚未与导航配置统一。

### 2. 修改文件清单

新增：

- `site_config.py`：品牌、菜单、CTA、Footer 分组唯一配置；Footer 引用菜单路径复用名称。
- `components.py`：公共 Logo、Header、Footer 构建期模板；HTML 转义及栏目高亮。
- `update_components.py`：只替换已有页面公共区域并接入导航脚本，不生成业务正文。
- `assets/navigation.css`：集中导航布局、品牌样式、响应式、sticky、焦点及展开样式。
- `assets/navigation.js`：集中菜单状态、Esc、点击跳转/外部点击/焦点离开关闭、宽度测量及页面返回复位。
- `tests/check_components.py`、`tests/protected-content.json`：全站组件、链接及修改前 head/main 哈希回归。
- `tests/navigation.cjs`、`tests/browser-results.json`：浏览器回归和执行结果；同目录 PNG 为四种视口与移动菜单截图。
- `DEVELOPMENT_REPORT.md`：本报告。

修改：

- `build.py`：引用公共配置与组件，移除旧重复模板，后续内容构建同样使用新组件。本次未执行全站生成。
- `assets/style.css`：移除原导航相关规则并导入公共导航样式，保留业务页面及 Footer 样式。
- `assets/site.js`：移出旧菜单交互，保留产品筛选、文件检查、咨询表单逻辑。
- `README.md`：增加单配置维护、局部同步与测试说明。
- 已有 15 页仅同步 Header/Footer 与公共导航脚本：`index.html`、`about/index.html`、`enterprise/index.html`、`personal/index.html`、`products/index.html`、`precheck/index.html`、`cases/index.html`、`insights/index.html`、`risks/index.html`、`contact/index.html`、`privacy/index.html`，以及 `insights/enterprise-loan-guide/index.html`、`insights/cash-flow-vs-profit/index.html`、`insights/credit-report-check/index.html`、`insights/mortgage-business-loan/index.html`。

### 3. 完成的功能

- 正确显示全部十个菜单名称、首页 Logo 及咨询 CTA；统一 Footer。
- 精确当前页使用 `aria-current="page"`；知识文章所属栏目使用 `aria-current="location"`。隐私页无对应主导航项，不错误高亮首页。
- 桌面 80px、折叠模式 72px，菜单保持 14px；深蓝金色、Hover 强调、sticky 及轻阴影，正文整体视觉不变。
- 1240px 以下折叠，以上还会测量实际品牌、菜单、CTA 占用宽度，避免未来扩展栏目后挤出容器。
- 移动/平板菜单提供全部链接、可重复开关、Esc 关闭并恢复按钮焦点、链接点击后关闭；状态和无障碍名称同步，过高菜单可内部滚动。
- 所有重要链接直接输出为静态 HTML，新增菜单只在 `site_config.py` 配置，然后运行 `python update_components.py`。

### 4. 测试结果

通过：

- `python tests/check_components.py`：15 页统一 Header/Footer、名称无模板残留、链接目标存在、脚本引用无重复；全部页面 head/main 的 SHA-256 与修改前一致。
- `python update_components.py` 再次执行：更新 0 页，验证幂等。
- Python 源文件语法检查、两份 JavaScript 的 Node 语法检查通过。
- 本机 Edge 无头真实浏览器：15 页 × 375/768/1024/1440px，共 60 组；页面返回 200，无横向溢出，1440px 完整导航，其他指定宽度折叠菜单，名称/高亮/CTA/Footer 一致。
- 每个折叠视口、每个页面执行开关、展开后十项可见、Esc/焦点恢复及点击咨询跳转关闭。
- 桌面实际点击十个菜单、Logo 返回首页、CTA 跳转咨询页。
- 产品筛选、PDF 文件本地检查、咨询表单填写及演示反馈回归通过；未发送或保存客户信息。
- 运行期间 JavaScript 异常、控制台 error、HTTP 4xx/5xx 均为 0。
- 补测 1239/1240/1241/1280/1366px 无横向溢出；移动菜单展开后切回桌面正确复位；在浏览器测试中临时增加六个栏目，实际宽度不足时自动折叠。这些操作仅改变测试浏览器 DOM，未新增业务页面或栏目。

执行记录：初次浏览器测试在额外桌面链接点击的完整加载等待阶段超时；明确等待目标路由的 DOM 加载后复测通过。补测发现展开菜单的内边距会影响宽度测量，以及容器达到最大宽度后窗口 resize 不触发容器观察；已统一测量样式并补充窗口 resize 监听，最终全套与新增回归均通过。当前无失败项。

未执行：Safari、Firefox、真实手机硬件、生产部署和搜索引擎抓取收录测试。内置浏览器连接不可用，因此使用现有 Playwright 与本机 Edge，无新增项目依赖。

### 5. 兼容性与风险

保留 Python 标准库生成 + HTML/CSS/JavaScript 技术栈，未引入框架或大型依赖。没有重建整站、删除页面、修改客户资料或数据库，也未部署生产。

所有现有页面路由、Title、Description、Canonical、JSON-LD 和正文保持原样；sitemap.xml、robots.txt 未修改。导航直接包含可抓取链接，兼容 SEO/GEO 内容扩展。实际抓取/收录仍取决于上线环境，不以本地测试推断。

导航按需求命名“成功案例”，落地页仍明确是模拟案例场景，原有真实性与风险说明完整保留。菜单展开依赖 JavaScript，搜索引擎发现静态链接无需 JavaScript。

### 6. 后续建议

维护导航时只改 `site_config.py` 并执行局部同步；新增栏目同时提供落地页面，再执行链接与浏览器回归。正式发布前沿用 README 中真实域名、联系方式、备案及服务端接收接口的既有待办，本次未扩大到这些工作。
