import { expect, test, type Page } from "@playwright/test";

// The set must be live on the site under test, so these skip until a steward sets it live.
const NEIGHBOURHOOD = process.env.E2E_COLLECTION_NEIGHBOURHOOD ?? "shinchi";
// The signed-in checks need a one-time Clerk sign-in token and an invited account's session.
const TICKET = process.env.E2E_CLERK_TICKET;

async function requireLiveSet(page: Page) {
  await page.goto(`/en/collection/${NEIGHBOURHOOD}`);
  const live = page.locator("[data-set]");
  const missing = page.getByText("No noren here", { exact: true });
  await expect(live.or(missing)).toBeVisible();
  test.skip(await missing.isVisible(), `${NEIGHBOURHOOD} has no live set on this site`);
}

async function firstPlacePath(page: Page) {
  const href = await page.locator('[data-set-panel="0"] a').first().getAttribute("href");
  if (!href) throw new Error("the first panel has no place");
  return href;
}

/** A place's pin, read from its Directions link. */
async function placePin(page: Page) {
  const href = await page.getByRole("link", { name: "Directions" }).getAttribute("href");
  const destination = new URL(href ?? "").searchParams.get("destination") ?? "";
  const [lat, lng] = destination.split(",").map(Number);
  if (!lat || !lng) throw new Error(`no pin in ${href}`);
  return { lat, lng };
}

/** Counts every location read the page asks for. */
async function countLocationReads(page: Page) {
  await page.addInitScript(() => {
    const scope = window as unknown as { locationReads: number };
    scope.locationReads = 0;
    const read = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => {
      scope.locationReads += 1;
      read(...args);
    };
  });
  return () => page.evaluate(() => (window as unknown as { locationReads: number }).locationReads);
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

test.describe("signed out", () => {
  test("the book and the set show no art and no progress", async ({ page }) => {
    const art: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/storage/")) art.push(request.url());
    });
    await requireLiveSet(page);
    await expect(page.getByText("0 of 6", { exact: true })).toBeVisible();
    await expect(page.locator("[data-noren] img")).toHaveCount(0);
    await expect(page.locator("[data-next-panel]")).toBeVisible();
    await page.goto("/en/collection");
    await expect(page.locator(`[data-book-set="${NEIGHBOURHOOD}"]`)).toBeVisible();
    await expect(page.locator("[data-next-panel]")).toBeVisible();
    await expect(page.locator("[data-noren] img")).toHaveCount(0);
    expect(art).toEqual([]);
  });

  test("a place in the set says which panel it gives and reads no location", async ({ page }) => {
    await requireLiveSet(page);
    const path = await firstPlacePath(page);
    const reads = await countLocationReads(page);
    await page.goto(path);
    await expect(page.getByText(/Gives panel 1 of/)).toBeVisible();
    await expect(page.locator("[data-im-here]")).toHaveCount(0);
    expect(await reads()).toBe(0);
  });

  test("signing in comes back to the same place", async ({ page }) => {
    test.skip(!process.env.E2E_BASE_URL, "production Clerk keys don't load on localhost");
    await requireLiveSet(page);
    const path = await firstPlacePath(page);
    await page.goto(path);
    const link = page.getByRole("link", { name: "Sign in", exact: true }).last();
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`redirect_url=${encodeURIComponent(path)}`),
    );
  });

  test("a neighbourhood with no noren says so", async ({ page }) => {
    await page.goto("/en/collection/no-such-neighbourhood");
    await expect(page.getByText("No noren here", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the collection" })).toBeVisible();
  });
});

test.describe("signed in", () => {
  test.skip(!TICKET, "needs E2E_CLERK_TICKET, a one-time sign-in token");
  test.describe.configure({ mode: "serial" });

  async function openPlace(page: Page) {
    await page.goto(`/en/sign-in?__clerk_ticket=${TICKET}`);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"));
    await requireLiveSet(page);
    await page.goto(await firstPlacePath(page));
    await expect(page.locator("[data-check-in]")).toBeVisible();
    return await placePin(page);
  }

  test("each failed reading records nothing, and a near one dyes the panel", async ({
    page,
    context,
  }) => {
    const sent = recordSent(page);
    const pin = await openPlace(page);
    const here = page.locator("[data-im-here]");
    const message = page.locator("[data-check-in-message]");
    test.skip((await here.count()) === 0, "this account has already been here");

    // Denied: no permission has been granted yet.
    await here.click();
    await expect(message).toContainText("Turn location on");

    // Too far: about 300 m north of the pin.
    const far = { latitude: pin.lat + 0.0027, longitude: pin.lng, accuracy: 10 };
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(far);
    await here.click();
    await expect(message).toContainText(/You are \d+ m from this place\. Come within 50 m/);
    await expect(page.locator('[data-check-in="done"]')).toHaveCount(0);

    test.skip(process.env.E2E_ALLOW_WRITES !== "1", "writes disabled");
    const near = { latitude: pin.lat + 0.0001, longitude: pin.lng, accuracy: 10 };
    await context.setGeolocation(near);
    await here.click();
    await expect(page.locator('[data-check-in="done"]')).toBeVisible();
    await expect(page.locator("[data-noren] img").first()).toBeVisible();

    // The reading itself never leaves the phone.
    for (const { latitude } of [far, near]) {
      expect(sent.filter((line) => line.includes(latitude.toFixed(4)))).toEqual([]);
    }
  });
});
