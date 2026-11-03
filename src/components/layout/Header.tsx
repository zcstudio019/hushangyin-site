"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { navigation, consultationCta } from "@/config/site";
import { Logo } from "./Logo";
export function Header() {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current!;
    const nav = header.querySelector<HTMLElement>("nav")!;
    const menu = header.querySelector<HTMLButtonElement>("button")!;
    const setOpen = (open: boolean, focus = false) => {
      nav.classList.toggle("open", open);
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-label", open ? "收起导航菜单" : "打开导航菜单");
      if (focus) menu.focus();
    };
    let collapsed: boolean | undefined;
    const fit = () => {
      const shell = header.querySelector<HTMLElement>(".nav-shell")!;
      nav.classList.add("nav-measure");
      const needed =
        header.querySelector<HTMLElement>(".logo")!.offsetWidth +
        nav.scrollWidth +
        header.querySelector<HTMLElement>(".nav-cta")!.offsetWidth +
        72;
      nav.classList.remove("nav-measure");
      const next = innerWidth <= 1240 || needed > shell.clientWidth;
      header.classList.toggle("nav-collapsed", next);
      if (next !== collapsed)
        setOpen(false, next && nav.contains(document.activeElement));
      collapsed = next;
    };
    const toggle = () => setOpen(menu.getAttribute("aria-expanded") !== "true");
    const click = (event: MouseEvent) => {
      if (
        !header.contains(event.target as Node) ||
        (event.target as Element).closest("nav a")
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && nav.classList.contains("open"))
        setOpen(false, true);
    };
    const focus = (event: FocusEvent) => {
      if (!header.contains(event.relatedTarget as Node)) setOpen(false);
    };
    const reset = () => {
      setOpen(false);
      fit();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(header.querySelector(".nav-shell")!);
    menu.addEventListener("click", toggle);
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    header.addEventListener("focusout", focus);
    window.addEventListener("resize", fit);
    window.addEventListener("pageshow", reset);
    void document.fonts.ready.then(fit);
    fit();
    return () => {
      observer.disconnect();
      menu.removeEventListener("click", toggle);
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
      header.removeEventListener("focusout", focus);
      window.removeEventListener("resize", fit);
      window.removeEventListener("pageshow", reset);
    };
  }, [path]);
  return (
    <header className="site-header" ref={ref}>
      <div className="shell nav-shell">
        <Logo />
        <nav id="main-nav" className="main-nav" aria-label="主导航">
          {navigation.map((item) => {
            const current =
              path === item.href ||
              (item.href !== "/" && path.startsWith(item.href)) ||
              (item.href === "/insights/" && path.startsWith("/faqs/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={current ? "current" : undefined}
                aria-current={
                  current
                    ? path === item.href
                      ? "page"
                      : "location"
                    : undefined
                }
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        <Link className="nav-cta" href={consultationCta.href}>
          {consultationCta.name} <span aria-hidden="true">↗</span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded="false"
          aria-controls="main-nav"
          aria-label="打开导航菜单"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
