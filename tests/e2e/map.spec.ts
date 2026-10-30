import { expect, test } from "@playwright/test";
import { placeUiMessages } from "../../src/lib/i18n/messages/place-ui";

// Chromium needs software GL fallback on machines without a GPU (e.g. --enable-unsafe-swiftshader).
// playwright.config.ts currently supplies no software GL launch argument.
for (const locale of ["ja", "en"] as const) {
  test.describe(`/${locale} map`, () => {
    test.skip(process.env.E2E_SKIP_MAP === "1", "map checks disabled: WebGL unavailable");

    test("the map draws", async ({ page }) => {
      const offending: string[] = [];
      page.on("console", (message) => {
        if (/worker/i.test(message.text())) {
          offending.push(`[${message.type()}] ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        if (/worker/i.test(error.message)) offending.push(`[pageerror] ${error.message}`);
      });
      await page.goto(`/${locale}`);
      const canvas = page.locator("canvas.maplibregl-canvas");
      await expect(canvas).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(
          () =>
            canvas.evaluate((element) => {
              if (!(element instanceof HTMLCanvasElement)) return false;
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && element.width > 0 && element.height > 0;
            }),
          { timeout: 20_000, message: "Map canvas must have non-zero width and height" },
        )
        .toBe(true);
      await expect(
        page.getByText(placeUiMessages[locale].mapFailed, { exact: true }),
      ).not.toBeVisible();
      expect(offending, `Worker messages on /${locale}:\n${offending.join("\n")}`).toEqual([]);
    });

    test("the worker file is served as JavaScript", async ({ request }) => {
      const response = await request.get("/maplibre/maplibre-gl-worker.mjs", {
        maxRedirects: 0,
      });
      expect(
        response.status(),
        `Worker must return 200; a 307 redirect to a language path means the proxy did not exempt /maplibre/. Location: ${response.headers().location ?? "none"}`,
      ).toBe(200);
      expect(response.headers()["content-type"]).toContain("javascript");
      expect((await response.body()).byteLength, "Worker body must exceed 100 KB").toBeGreaterThan(
        100 * 1024,
      );
    });
  });
}
