import Link from "next/link";
import { brand } from "@/config/site";
export function Logo({ footer = false }: { footer?: boolean }) {
  return (
    <Link
      href={brand.home}
      className={footer ? "logo footer-logo" : "logo"}
      aria-label={`${brand.name}首页`}
    >
      <span className="logo-mark">{brand.mark}</span>
      <span className="logo-copy">
        <b>{brand.name}</b>
        <small>{brand.english}</small>
      </span>
    </Link>
  );
}
