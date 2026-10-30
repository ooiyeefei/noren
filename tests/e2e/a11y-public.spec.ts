import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { publicPages } from "./helpers";

for (const path of publicPages) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "日本語 / English" })).toBeVisible();
      if (path === "/ja" || path === "/en") {
        await expect(
          page.getByText(path === "/ja" ? "場所を読み込んでいます…" : "Loading places…", {
            exact: true,
          }),
        ).toHaveCount(0);
      }
      if (path.endsWith("/takedown"))
        await expect(page.locator('textarea[name="details"]')).toBeVisible();
      if (path.endsWith("/status"))
        await expect(
          page.getByRole("textbox", { name: "Request code", exact: true }),
        ).toBeVisible();
      if (path.endsWith("/sign-in")) await expect(page.locator(".cl-rootBox")).toBeVisible();
    });

    test("axe WCAG A/AA has no serious or critical violations", async ({ page }, testInfo) => {
      let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
      // Clerk owns its sign-in widget; audit the surrounding app shell here.
      if (path.endsWith("/sign-in")) builder = builder.exclude(".cl-rootBox");
      const { violations } = await builder.analyze();
      for (const violation of violations.filter(
        (item) => item.impact === "minor" || item.impact === "moderate",
      )) {
        testInfo.annotations.push({ type: "a11y-warning", description: JSON.stringify(violation) });
      }
      expect(
        violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
        "Serious/critical axe violations (including affected nodes)",
      ).toEqual([]);
    });

    test("no horizontal scrolling on phone", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "phone", "phone viewport check only");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => innerWidth),
      );
    });

    test("every visible form control has an accessible name", async ({ page }) => {
      const controls = page.locator(
        'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, select, button, [role="textbox"], [role="combobox"], [role="checkbox"], [role="switch"]',
      );
      for (const control of await controls.all()) {
        // Clerk owns its widget, including its hidden password control.
        if (await control.evaluate((element) => !!element.closest(".cl-rootBox"))) continue;
        if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
      }
    });

    test("exactly one h1", async ({ page }) => {
      await expect(page.locator("h1")).toHaveCount(1);
    });

    test("Tab focus has a visible outline or changed box shadow", async ({ page }) => {
      const before = await page
        .locator("*")
        .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).boxShadow));
      await page.keyboard.press("Tab");
      const focus = await page.locator("*").evaluateAll((elements) => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        return {
          index: elements.findIndex((candidate) => candidate === element),
          outline:
            parseFloat(style.outlineWidth) > 0 &&
            !["none", "hidden"].includes(style.outlineStyle) &&
            !["transparent", "rgba(0, 0, 0, 0)"].includes(style.outlineColor),
          shadow: style.boxShadow,
        };
      });
      expect(focus, "Tab must focus an element").not.toBeNull();
      expect(
        focus!.outline || (focus!.shadow !== "none" && focus!.shadow !== before[focus!.index]),
        "Focused element needs a visible outline or a box-shadow change",
      ).toBe(true);
    });
  });
}
