import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SiteInteractions } from "@/components/layout/SiteInteractions";
export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <SiteInteractions />
    </>
  );
}
