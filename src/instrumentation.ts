// Runs once when the server starts and must finish before requests are served, so an invalid
// region file stops the app with a readable message instead of failing on the first page.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getActiveRegion } = await import("./lib/region");
    getActiveRegion();
  }
}
