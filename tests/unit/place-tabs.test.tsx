import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { AddStory } from "@/components/place/add-story";
import { PlaceTabs } from "@/components/place/place-tabs";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { PlaceView } from "@/components/public/place-view";
import { landmark, region } from "../fixtures/public-ui";

const tabs = (props: Partial<Parameters<typeof PlaceTabs>[0]> = {}, locale: "en" | "ja" = "en") =>
  render(
    <PlaceTabs
      locale={locale}
      initialTab="stories"
      initialWrite={false}
      signedIn={true}
      canWrite
      visitDot={false}
      stories={<p>STORIES</p>}
      visit={<p>VISIT</p>}
      visitLazy={<p>MAP</p>}
      about={<p>ABOUT</p>}
      {...props}
    />,
  );

for (const locale of ["en", "ja"] as const) {
  const ui = placePageMessages[locale];
  it(`labels three tabs and shows only the one the address asked for (${locale})`, () => {
    const html = tabs({}, locale);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain(ui.tabStories);
    expect(html).toContain(ui.tabVisit);
    expect(html).toContain(ui.tabAbout);
    // Roving tabindex: only the open tab is in the tab order.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/ hidden=""/g)).toHaveLength(2);
    const visit = tabs({ initialTab: "visit" }, locale);
    expect(visit).toMatch(/id="[^"]*-tab-visit" aria-selected="true"/);
    expect(visit).toMatch(/id="[^"]*-panel-stories"[^>]* hidden=""/);
  });
  it(`builds the map only once Visit is open (${locale})`, () => {
    expect(tabs({}, locale)).not.toContain("MAP");
    expect(tabs({ initialTab: "visit" }, locale)).toContain("MAP");
    // The other panels are always there, so a half-written story survives a tab change.
    expect(tabs({}, locale)).toContain("ABOUT");
  });
  it(`marks Visit only when there is something to collect (${locale})`, () => {
    expect(tabs({ visitDot: true }, locale)).toContain("data-visit-dot");
    expect(tabs({ visitDot: true }, locale)).toContain(ui.visitDot);
    expect(tabs({ visitDot: false }, locale)).not.toContain("data-visit-dot");
  });
  it(`offers "Add your story" to a member, a sign-in link to a visitor, and neither while sign-in loads or at the demo place (${locale})`, () => {
    expect(tabs({}, locale)).toMatch(
      new RegExp(`<button[^>]*data-add-story[^>]*>${ui.addYourStory}`),
    );
    const out = tabs({ signedIn: false }, locale);
    expect(out).toContain(`href="/${locale}/sign-in"`);
    expect(out).toContain(ui.addYourStory);
    expect(tabs({ signedIn: undefined }, locale)).not.toContain("data-add-story");
    expect(tabs({ canWrite: false }, locale)).not.toContain("data-add-story");
  });
  it(`opens the written form when asked, and not otherwise (${locale})`, () => {
    const m = addStoryMessages[locale];
    const actions = {
      signedIn: true,
      add: async () => null,
      write: async () => null,
    };
    const closed = render(<AddStory locale={locale} region={region} actions={actions} />);
    expect(closed).not.toContain("<form");
    const open = render(
      <AddStory locale={locale} region={region} actions={actions} openWritten={1} />,
    );
    expect(open).toContain(`aria-label="${m.write}"`);
  });
  it(`shows the tab and form the address asked for on the first paint (${locale})`, () => {
    const view = (props: Partial<Parameters<typeof PlaceView>[0]>) =>
      render(
        <PlaceView
          locale={locale}
          region={region}
          place={landmark}
          page={null}
          sources={[]}
          stories={[]}
          story={{
            signedIn: true,
            add: async () => null,
            write: async () => null,
            remove: async () => null,
          }}
          {...props}
        />,
      );
    expect(view({ initialTab: "about" })).toMatch(
      /aria-selected="true"[^>]*tabindex="0"[^>]*>[^<]*<\/button>/,
    );
    expect(view({ initialWrite: true })).toContain(
      `aria-label="${addStoryMessages[locale].write}"`,
    );
    expect(view({})).not.toContain(`aria-label="${addStoryMessages[locale].write}"`);
  });
}
