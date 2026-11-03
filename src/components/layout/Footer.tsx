import Link from "next/link";
import { brand, navigation, footerGroups } from "@/config/site";
import { Logo } from "./Logo";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-main">
          <div>
            <Logo footer />
            <p>
              懂金融，更懂上海。
              <br />
              让融资更有规划，让服务更透明。
            </p>
          </div>
          {footerGroups.map((group) => (
            <div key={group.name}>
              <h4>{group.name}</h4>
              {group.hrefs.map((href) => (
                <Link href={href} key={href}>
                  {navigation.find((item) => item.href === href)?.name ??
                    "隐私政策"}
                </Link>
              ))}
              {group.hrefs.includes("/privacy/") && <p>服务区域：上海及周边</p>}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {brand.name} · 融资咨询服务
          </span>
          <span>非贷款发放机构 · 不承诺审批结果 · 备案信息待配置</span>
        </div>
      </div>
    </footer>
  );
}
