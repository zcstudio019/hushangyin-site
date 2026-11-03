import pages from "./legacy-pages.json";
export const publicPages: Record<
  string,
  { title: string; description: string; html: string }
> = pages;
export const publicPaths = Object.keys(publicPages);
