import {createDatabaseClient} from "../src/lib/db/provider";

import pages from "../src/features/content/legacy-pages.json";
const prisma = createDatabaseClient();
async function main() {
  for (const [path, page] of Object.entries(pages)) {
    if (!path.startsWith("/insights/") || path === "/insights/") continue;
    const slug = path.split("/")[2];
    await prisma.article.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: page.title,
        summary: page.description,
        content: page.html,
        category: "融资知识",
        status: "DRAFT",
      },
    });
  }
  console.log(
    "Existing articles preserved; missing article drafts initialized. No customer data seeded.",
  );
}
main()
  .catch(() => {
    console.error(
      "Content initialization failed. Check database configuration.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
