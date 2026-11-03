import Link from "next/link";
export default function NotFound() {
  return (
    <main className="shell section">
      <h1>页面未找到</h1>
      <p>请检查网址或返回首页。</p>
      <Link className="button gold" href="/">
        返回首页
      </Link>
    </main>
  );
}
