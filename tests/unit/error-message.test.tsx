import { ConvexError } from "convex/values";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorMessage } from "@/components/layout/error-message";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";

describe("ErrorMessage", () => {
  it.each(SUPPORTED_LOCALES)(
    "%s shows plain recovery copy and collapsed, copyable diagnostics",
    (locale) => {
      const html = render(
        <ErrorMessage error={new TypeError("Minified React error #301")} locale={locale} />,
      );
      expect(html).toContain(`<p role="alert">${shellMessages[locale].unexpectedError}</p>`);
      expect(html).toContain(`<div lang="${locale}"`);
      expect(html).toContain("<details>");
      expect(html).not.toMatch(/<details[^>]*open/);
      expect(html).toMatch(
        new RegExp(`<summary[^>]*>${shellMessages[locale].technicalDetails}</summary>`),
      );
      expect(html).toMatch(
        /<p class="[^"]*text-sm[^"]*text-muted-foreground[^"]*">TypeError: Minified React error #301<\/p>/,
      );
      expect(html).not.toContain("font-mono");
      expect(html).not.toContain("<code");
      expect(html).not.toContain("<pre");
    },
  );

  it.each(SUPPORTED_LOCALES)("%s omits disclosure when there is no detail", (locale) => {
    const html = render(
      <ErrorMessage error={new ConvexError({ code: "forbidden", message: "" })} locale={locale} />,
    );
    expect(html).toContain(`<p role="alert">${shellMessages[locale].forbidden}</p>`);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });

  it("escapes diagnostic markup and preserves the whole message", () => {
    const html = render(
      <ErrorMessage error={new Error("<script>bad</script>\nsecond line")} locale="en" />,
    );
    expect(html).toContain("Error: &lt;script&gt;bad&lt;/script&gt;\nsecond line");
    expect(html).not.toContain("<script>");
  });
});
