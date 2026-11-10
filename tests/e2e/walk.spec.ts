import { expect, test, type Page } from "@playwright/test";

// Walk mode ships dark (regions/nagasaki.json features.walk = false). While it is off these checks
// confirm it is a 404 with no link; once it is on they walk a short fake route and confirm that
// nothing about the position reaches Noren. The route uses no seeded data, so it runs anywhere.

const NAGASAKI_CENTRE = { latitude: 32.7503, longitude: 129.8777, accuracy: 10 };

async function openWalk(page: Page, path = "/en/walk") {
  const response = await page.goto(path);
  return response?.status() ?? 0;
}

/** Everything the page sends: request URLs and bodies, and frames on the Convex socket. */
function recordSent(page: Page) {
  const sent: string[] = [];
  page.on("request", (request) => sent.push(`${request.url()} ${request.postData() ?? ""}`));
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => sent.push(String(payload))),
  );
  return sent;
}

test("while switched off, /walk is a 404 and nothing links to it", async ({ page }) => {
  const status = await openWalk(page);
  test.skip(status !== 404, "walk mode is switched on for this site");
  await page.goto("/en/about");
  await expect(page.locator('a[href$="/walk"]')).toHaveCount(0);
});

test.describe("switched on", () => {
  test("a phone starts a walk and stops it, and no position is ever sent", async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!isMobile, "walk mode is for phones");
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(NAGASAKI_CENTRE);
    const sent = recordSent(page);
    const status = await openWalk(page);
    test.skip(status === 404, "walk mode is switched off for this site");

    await expect(page.locator("[data-walk-start]")).toBeVisible();
    await expect(page.locator("[data-walk-desktop]")).toBeHidden();
    await expect(page.getByText("Noren does not receive your location")).toBeVisible();
    await expect(page.getByText(/keep the screen on/i).first()).toBeVisible();

    await page.locator("[data-walk-start]").click();
    await expect(page.locator("[data-walk-stop]")).toBeVisible();
    await expect(page.getByText(/places are on your phone now/)).toBeVisible();
    // A short walk: ten readings, a few streets apart.
    for (let step = 0; step < 10; step++) {
      await context.setGeolocation({
        ...NAGASAKI_CENTRE,
        latitude: NAGASAKI_CENTRE.latitude - step * 0.0009,
        longitude: NAGASAKI_CENTRE.longitude + step * 0.0007,
      });
      await page.waitForTimeout(250);
    }
    await page.locator("[data-walk-stop]").click();
    await expect(page.locator("[data-walk-start]")).toBeVisible();

    // The only call that mentions walk mode carries the region and nothing else.
    const calls = sent.filter((frame) => frame.includes("walk:forRegion"));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain('"args":[{"regionId":"nagasaki"}]');
    const everything = sent.join("\n");
    // Neither the readings nor the neighbourhood they fall in were sent.
    for (const secret of ["32.74", "32.75", "129.87", "129.88", "latitude", "longitude"]) {
      expect(everything).not.toContain(secret);
    }
  });

  test("a desktop explains walk mode is for phones and still draws the omikuji", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the phone project runs the walk");
    const status = await openWalk(page);
    test.skip(status === 404, "walk mode is switched off for this site");
    await expect(page.locator("[data-walk-desktop]")).toBeVisible();
    await expect(page.locator("[data-walk-start]")).toBeHidden();
    await page.locator("[data-omikuji] select").selectOption({ index: 1 });
    await page.locator("[data-draw-slip]").click();
    // Either a slip or the honest "no place to draw here" for a neighbourhood with nothing yet.
    await expect(page.locator("[data-omikuji-slip]")).toBeVisible();
  });
});
