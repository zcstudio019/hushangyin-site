export const releaseOrigins = {
  preview: "http://127.0.0.1:3120",
  production: "https://hushangyin.linhongtech.com",
};

export function releaseMode() {
  const mode = process.env.HSY_RELEASE_MODE || "preview";
  if (!Object.hasOwn(releaseOrigins, mode))
    throw Error("Invalid release mode");
  return mode;
}
