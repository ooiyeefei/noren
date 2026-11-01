import { expect, test } from "@playwright/test";
import { browserLikeHeaders, visibleText } from "./helpers";

for (const [language, expected] of [
  ["ja", "ja"],
  ["en", "en"],
  ["fr", "ja"],
  ["", "ja"],
] as const) {
  test(`/ sends a signed-out visitor with Accept-Language ${language || "absent"} to /${expected}/about`, async ({
    request,
  }) => {
    const response = await request.get("/", {
      headers: { ...browserLikeHeaders, ...(language ? { "Accept-Language": language } : {}) },
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(response.status());
    expect(new URL(response.headers().location!, response.url()).pathname).toBe(
      `/${expected}/about`,
    );
  });
}

for (const locale of ["ja", "en"] as const) {
  test(`/${locale} has its language and shell; language switching preserves the page`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "en" ? "Nagasaki's local places" : "長崎の地元のお店",
    );
    await expect(
      page.getByRole("link", {
        name: locale === "en" ? "Skip to content" : "本文へ移動",
        exact: true,
      }),
    ).toHaveAttribute("href", "#main");
    await expect(
      page.getByRole("link", { name: locale === "en" ? "Sign in" : "ログイン", exact: true }),
    ).toBeVisible();
    const switcher = page.getByRole("navigation", { name: "日本語 / English" });
    await expect(switcher.getByRole("link", { name: "日本語", exact: true })).toBeVisible();
    await expect(switcher.getByRole("link", { name: "English", exact: true })).toBeVisible();
    await page.goto(`/${locale}/notice`);
    const other = locale === "en" ? "ja" : "en";
    await page
      .getByRole("navigation", { name: "日本語 / English" })
      .getByRole("link", { name: other === "en" ? "English" : "日本語", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${other}/notice$`));
    await expect(page.locator("html")).toHaveAttribute("lang", other);
  });
}

for (const path of ["/ja", "/en", "/ja/notice", "/en/takedown", "/en/e2e-does-not-exist"]) {
  test(`${path} sends noindex, nofollow`, async ({ request }) => {
    const response = await request.get(path, { headers: browserLikeHeaders });
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });
}

test("robots.txt disallows everything", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/User-agent:\s*\*\s+Disallow:\s*\/\s*(?:$|\n)/i);
});

for (const role of ["creator", "owner", "steward"]) {
  test(`${role} redirects signed-out visitors with the return address`, async ({ request }) => {
    const path = `/en/${role}`;
    const response = await request.get(path, { headers: browserLikeHeaders, maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers().location!;
    expect(location).toContain("/sign-in?redirect_url=");
    const target = new URL(location, response.url());
    expect(new URL(target.searchParams.get("redirect_url")!, response.url()).pathname).toBe(path);
  });
}

test("geo search refuses signed-out callers with a JSON message", async ({ request }) => {
  const response = await request.get("/api/geo/search?q=cafe");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
  const body = await response.json();
  expect(body.error.code).toBe("unauthenticated");
  expect(body.error.message).toEqual(expect.any(String));
  expect(body.error.message.trim()).not.toBe("");
});

test("notice credits open data, links removal and exposes no email address", async ({ page }) => {
  await page.goto("/en/notice");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "About place information and stories",
  );
  // The site footer carries its own OpenStreetMap credit; this checks the notice's.
  await expect(page.getByRole("main").getByRole("link", { name: /OpenStreetMap/ })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );
  await expect(page.getByText(/Open Database License/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "To ask for removal, use the form." }),
  ).toHaveAttribute("href", "/en/takedown");
  expect(await visibleText(page)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
});

test("unknown place has a friendly not-found message without a stack", async ({ page }) => {
  await page.goto("/en/places/e2e-no-such-place-00000000");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await expect(
    page.getByText("The page may have moved or been removed, or the URL may be incorrect."),
  ).toBeVisible();
  expect(await visibleText(page)).not.toMatch(
    /(?:Error:|\bat\s+\S+\s*\([^\n]+:\d+:\d+\)|Application error|Unhandled Runtime Error)/,
  );
});

test("unknown route renders a not-found page with HTTP 404", async ({ page }) => {
  const response = await page.goto("/en/e2e-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Page not found|ページが見つかりません/,
  );
});
