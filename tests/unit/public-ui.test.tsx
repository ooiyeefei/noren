import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { NoticeView } from "@/components/public/notice-view";
import { noticePlatforms } from "@/components/public/mapping";
import { publicMessages } from "@/lib/i18n/messages/public";
import { format } from "@/lib/i18n";
import { config } from "../fixtures/public-ui";

for (const locale of ["ja", "en"] as const) {
  const notice = (contact: string | null = null) =>
    render(
      <NoticeView
        locale={locale}
        platforms={noticePlatforms(config, locale)}
        contact={contact}
        operatorName={null}
      />,
    );
  it(`the notice links to the form (${locale})`, () => {
    const html = notice();
    for (const name of noticePlatforms(config, locale)) expect(html).toContain(name);
    expect(html).toContain(publicMessages[locale].operatorPending);
    expect(html).toContain(takedownMessages[locale].useForm);
    expect(html).toContain(`href="/${locale}/takedown"`);
    expect(html).toContain(publicMessages[locale].clickToLoad);
    expect(html).toContain(publicMessages[locale].privacy);
    expect(html).toContain(publicMessages[locale].originals);
    expect(html).toContain('data-badge="unreviewed"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
  it(`the form address as contact does not repeat the sentence (${locale})`, () => {
    for (const contact of [
      "https://noren.yooi.me/takedown",
      `/${locale}/takedown`,
      `https://noren.yooi.me/${locale}/takedown?from=notice#form`,
    ]) {
      expect(notice(contact)).toBe(notice());
    }
  });
  it(`a role address contact is still shown next to the form link (${locale})`, () => {
    const contact = "removal@example.com";
    const html = notice(contact);
    expect(html).toContain(format(publicMessages[locale].removal, { contact }));
    expect(html).toContain(`href="/${locale}/takedown"`);
  });
  it(`no contact still shows only the form link (${locale})`, () => {
    expect(notice()).toContain(takedownMessages[locale].useForm);
    expect(notice()).not.toContain(format(publicMessages[locale].removal, { contact: "" }));
    expect(notice()).toContain(publicMessages[locale].operatorPending);
  });
  it(`contains no rating, score, star or sentiment words (${locale})`, () => {
    expect(notice()).not.toMatch(
      /\b(?:rating|score|star|sentiment)s?\b|評価|点数|星評価|感情分析/i,
    );
  });
}

it("the notice shows 'not yet published' for a missing operator or contact and the real values when present", () => {
  for (const locale of ["ja", "en"] as const) {
    const html = (operatorName: string | null, contact: string | null) =>
      render(
        <NoticeView locale={locale} platforms={[]} operatorName={operatorName} contact={contact} />,
      );
    expect(html(null, null)).toContain(publicMessages[locale].operatorPending);
    expect(html(null, null)).toContain(takedownMessages[locale].useForm);
    expect(html("Mock operator", null)).toContain("Mock operator");
    expect(html("Mock operator", null)).toContain(takedownMessages[locale].useForm);
    expect(html(null, "https://example.com/removal")).toContain(
      publicMessages[locale].operatorPending,
    );
    expect(html(null, "https://example.com/removal")).toContain("https://example.com/removal");
    expect(html("Mock operator", "https://example.com/removal")).not.toContain("not yet published");
  }
});
