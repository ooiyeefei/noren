import { expect, test } from "@playwright/test";

for (const path of ["/ja", "/en", "/ja/notice", "/en/takedown", "/en/sign-in"]) {
  test(`${path} has no CSP violations or console errors`, async ({ page }) => {
    test.setTimeout(60_000);
    const offending: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        /violates the following Content Security Policy/i.test(message.text())
      ) {
        offending.push(`[${message.type()}] ${message.text()}`);
      }
    });
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3_000);
    expect(offending, `Offending console messages on ${path}:\n${offending.join("\n")}`).toEqual(
      [],
    );
  });
}
