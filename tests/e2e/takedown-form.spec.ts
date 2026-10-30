import { expect, test } from "@playwright/test";

const address = "Address of the page";
const details = "What should we know?";
const privacy =
  "This involves personal information or a minor: hide the page right away while we review it";
const contact = "How can we reach you? (optional)";

test("removal form has every labelled field, counter and privacy/contact explanations", async ({
  page,
}) => {
  await page.goto("/en/takedown");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Request removal");
  for (const name of [address, details, contact]) {
    await expect(page.getByRole("textbox", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("checkbox", { name: privacy, exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Send request", exact: true })).toBeVisible();
  await expect(page.locator("#details-count")).toHaveText("0 / 2000 · Use 10 to 2000 characters.");
  await page.getByRole("textbox", { name: details, exact: true }).fill("hello");
  await expect(page.locator("#details-count")).toHaveText("5 / 2000 · Use 10 to 2000 characters.");
  await expect(
    page.getByText("Anyone can ask for removal. No account or email address is needed."),
  ).toBeVisible();
  await expect(page.locator("#privacy-help")).toHaveText(
    "The matched page is hidden at once, and a person reviews your request.",
  );
  await expect(page.locator("#contact-help")).toHaveText(
    "Optional. Shown only to the review team and deleted when the case is closed. You can instead keep the code shown after sending.",
  );
});

test("honeypot is aria-hidden, outside the Tab order and visually hidden", async ({ page }) => {
  await page.goto("/en/takedown");
  const honeypot = page.locator('input[name="website"]');
  await expect(honeypot).toHaveAttribute("aria-hidden", "true");
  await expect(honeypot).toHaveAttribute("tabindex", "-1");
  expect(
    await honeypot.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        (rect.width <= 1 && rect.height <= 1) ||
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= innerWidth ||
        rect.top >= innerHeight
      );
    }),
  ).toBe(true);
  await page.getByRole("textbox", { name: contact, exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send request", exact: true })).toBeFocused();
});

test("page query prefills the address", async ({ page }) => {
  const value = "/en/places/e2e-no-such-place-00000000";
  await page.goto(`/en/takedown?page=${encodeURIComponent(value)}`);
  await expect(page.getByRole("textbox", { name: address, exact: true })).toHaveValue(value);
});

test("unknown request code has a neutral status and no error", async ({ page }) => {
  await page.goto("/en/takedown/status?code=000000000000");
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "No request found for this code.",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("too-short details are refused before any Convex mutation", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/mutation(?:\?|$)/.test(request.url())) mutations.push(request.url());
  });
  // Convex React normally sends mutations over WebSocket, not the HTTP endpoint.
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (/"type"\s*:\s*"Mutation"/.test(String(payload))) mutations.push(String(payload));
    });
  });
  await page.goto("/en/takedown");
  await page
    .getByRole("textbox", { name: address, exact: true })
    .fill("/en/places/e2e-no-such-place-00000000");
  await page.getByRole("textbox", { name: details, exact: true }).fill("short");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Use 10 to 2000 characters.");
  await page.waitForTimeout(500);
  expect(mutations, "Client validation must not send an HTTP or WebSocket mutation").toEqual([]);
});

test.describe("explicitly enabled live write", () => {
  // Retrying or running in both projects would create more than one live request.
  test.describe.configure({ retries: 0 });
  test("submit ONE unmatched non-privacy request and check its code", async ({
    page,
  }, testInfo) => {
    test.skip(process.env.E2E_ALLOW_WRITES !== "1", "writes disabled");
    test.skip(
      testInfo.project.name !== "desktop",
      "one live request only: desktop project owns submission",
    );
    const path = `/en/places/e2e-no-such-place-${crypto.randomUUID()}`;
    await page.goto("/en/takedown");
    await page.getByRole("textbox", { name: address, exact: true }).fill(path);
    await page
      .getByRole("textbox", { name: details, exact: true })
      .fill("E2E TEST: please ignore. Automated opt-in check for a nonexistent place.");
    await expect(page.getByRole("checkbox", { name: privacy, exact: true })).not.toBeChecked();
    await page.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your request code", exact: true }),
    ).toBeVisible();
    const link = page.getByRole("link", { name: "Check the result or appeal", exact: true });
    const href = await link.getAttribute("href");
    const code = new URL(href!, page.url()).searchParams.get("code")!;
    expect(code).toMatch(/^[A-Za-z0-9]{12}$/);
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByText("The page was not hidden at once.", { exact: true })).toBeVisible();
    await link.click();
    await expect(page.getByRole("textbox", { name: "Request code", exact: true })).toHaveValue(
      code,
    );
    await expect(page.getByRole("heading", { name: "Received", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
});
