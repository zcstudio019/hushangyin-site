"""构建期公共组件。输出真实 HTML 链接，无需 JavaScript 渲染。"""
from html import escape
from site_config import BRAND, CTA, NAV, FOOTER_GROUPS, EXTRA_LINKS


def esc(value):
    return escape(str(value), quote=True)


def logo(footer=False):
    cls = 'logo footer-logo' if footer else 'logo'
    return (f'<a href="{esc(BRAND["home"])}" class="{cls}" aria-label="{esc(BRAND["name"])}首页">'
            f'<span class="logo-mark">{esc(BRAND["mark"])}</span><span class="logo-copy">'
            f'<b>{esc(BRAND["name"])}</b><small>{esc(BRAND["english"])}</small></span></a>')


def header(path):
    links = []
    for name, url in NAV:
        exact = path == url
        section = url != '/' and path.startswith(url)
        state = (' class="current" aria-current="page"' if exact else
                 ' class="current" aria-current="location"' if section else '')
        links.append(f'<a href="{esc(url)}"{state}>{esc(name)}</a>')
    return ('<header class="site-header"><div class="shell nav-shell">' + logo() +
            '<nav id="main-nav" class="main-nav" aria-label="主导航">' + ''.join(links) + '</nav>'
            f'<a class="nav-cta" href="{esc(CTA["href"])}">{esc(CTA["label"])} <span aria-hidden="true">↗</span></a>'
            '<button class="menu-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="打开导航菜单">'
            '<span></span><span></span><span></span></button></div></header>')


def footer():
    names = {url: name for name, url in NAV} | EXTRA_LINKS
    groups = []
    for title, urls in FOOTER_GROUPS:
        links = ''.join(f'<a href="{esc(url)}">{esc(names[url])}</a>' for url in urls)
        region = '<p>服务区域：上海及周边</p>' if '/privacy/' in urls else ''
        groups.append(f'<div><h4>{esc(title)}</h4>{links}{region}</div>')
    return ('<footer class="site-footer"><div class="shell"><div class="footer-main"><div>' + logo(True) +
            '<p>懂金融，更懂上海。<br>让融资更有规划，让服务更透明。</p></div>' + ''.join(groups) +
            f'</div><div class="footer-bottom"><span>© 2026 {esc(BRAND["name"])} · 品牌官网演示版</span>'
            '<span>非贷款发放机构 · 不承诺审批结果 · 备案信息待配置</span></div></div></footer>')
