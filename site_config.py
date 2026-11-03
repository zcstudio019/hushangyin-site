"""公共品牌、导航及页脚配置；菜单名称和链接只在此维护。"""
BRAND = {'name': '沪上银', 'mark': '沪', 'english': 'HUSHANGYIN', 'home': '/'}
CTA = {'label': '立即咨询', 'href': '/contact/'}
NAV = [
    ('首页', '/'), ('关于沪上银', '/about/'),
    ('企业融资', '/enterprise/'), ('个人融资', '/personal/'),
    ('产品方案', '/products/'), ('资料预审', '/precheck/'),
    ('成功案例', '/cases/'), ('融资知识', '/insights/'),
    ('风险提示', '/risks/'), ('联系我们', '/contact/'),
]
# 用路径引用 NAV，避免在页脚重复维护菜单名称。
FOOTER_GROUPS = [
    ('了解服务', ['/enterprise/', '/personal/', '/products/', '/precheck/']),
    ('探索更多', ['/about/', '/cases/', '/insights/', '/contact/']),
    ('风险与隐私', ['/risks/', '/privacy/']),
]
EXTRA_LINKS = {'/privacy/': '隐私政策'}
