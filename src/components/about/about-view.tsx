import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { NorenTab } from "@/components/explore/noren-tab";
import { SiteFooter } from "@/components/layout/site-footer";
import { localePath, messagesFor, type Locale, type MessageTable } from "@/lib/i18n";
import { aboutMessages } from "@/lib/i18n/messages/about";

export const REPO_URL = "https://github.com/ooiyeefei/noren";

type AboutMessages = MessageTable<keyof (typeof aboutMessages)["en"]>;

/**
 * What Noren is and how it differs from maps, review apps and travel apps. The sketches are
 * drawn from shapes, not from a real or invented shop, so nothing on this page is mock data.
 */
export function AboutView({ locale }: { locale: Locale }) {
  const m = messagesFor(aboutMessages, locale);
  const map = localePath(locale);
  const others = [
    { key: "maps", name: m.mapsName, question: m.mapsQuestion, gives: m.mapsGives },
    {
      key: "reviews",
      name: m.reviewsName,
      hint: m.reviewsHint,
      question: m.reviewsQuestion,
      gives: m.reviewsGives,
    },
    { key: "travel", name: m.travelName, question: m.travelQuestion, gives: m.travelGives },
  ];
  const promises = [
    [m.p1Title, m.p1Body],
    [m.p2Title, m.p2Body],
    [m.p3Title, m.p3Body],
    [m.p4Title, m.p4Body],
    [m.p5Title, m.p5Body],
    [m.p6Title, m.p6Body],
  ];
  const primary =
    "inline-flex min-h-12 items-center justify-center rounded-[10px] bg-kon px-6 text-[17px] font-bold text-white";
  const secondary =
    "inline-flex min-h-12 items-center justify-center rounded-[10px] border border-kon bg-white px-6 text-[17px] font-bold text-kon";
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        lang={locale}
        // Keeps Japanese phrases whole when a line wraps, where the browser supports it.
        className={`flex-1 font-sans text-kon ${locale === "ja" ? "[word-break:auto-phrase]" : ""}`}
      >
        <style>{`
          @keyframes about-cloth-drop {
            from { transform: translateY(-100%); }
            to { transform: translateY(0) rotate(1deg); }
          }
          @keyframes about-cloth-settle {
            from { transform: rotate(1deg); }
            to { transform: rotate(0); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .about-cloth { animation: about-cloth-drop 520ms ease-out both, about-cloth-settle 220ms ease-out 520ms forwards; }
          }
        `}</style>

        <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pt-8 pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-16 lg:pt-16 lg:pb-24">
          <div className="min-w-0 space-y-6">
            <h1 className="text-[40px] leading-[1.15] font-bold text-balance sm:text-[56px]">
              {m.heroTitle}
            </h1>
            <p className="max-w-[34em] text-[18px] leading-[1.8] sm:text-[20px]">{m.heroLead}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={map} className={primary}>
                {m.openMap}
              </Link>
              <a href="#different" className={secondary}>
                {m.howDifferent}
              </a>
            </div>
          </div>
          <HeroCloth />
        </section>

        <section
          aria-labelledby="meaning-title"
          className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:pb-24"
        >
          <div className="max-w-[40em] space-y-3 border-l-4 border-kon pl-5">
            <h2 id="meaning-title" className="text-[22px] font-bold">
              {m.meaningTitle}
            </h2>
            <p className="text-[17px] leading-[1.9]">{m.meaningBody}</p>
          </div>
        </section>

        <section
          id="different"
          aria-labelledby="different-title"
          className="scroll-mt-4 bg-kamenozoki"
        >
          <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-[40em] space-y-4">
              <h2
                id="different-title"
                className="text-[30px] leading-tight font-bold text-balance sm:text-[40px]"
              >
                {m.compareTitle}
              </h2>
              <p className="text-[18px] leading-[1.8]">{m.compareLead}</p>
            </div>
            <table className="block w-full border-separate border-spacing-y-3 text-left md:table md:table-fixed">
              <thead className="sr-only md:not-sr-only md:table-header-group">
                <tr className="text-[14px] text-muted-foreground">
                  <th scope="col" className="w-[24%] px-5 pb-1 font-normal">
                    {m.colApp}
                  </th>
                  <th scope="col" className="w-[34%] px-5 pb-1 font-normal">
                    {m.colQuestion}
                  </th>
                  <th scope="col" className="px-5 pb-1 font-normal">
                    {m.colGives}
                  </th>
                </tr>
              </thead>
              <tbody className="block space-y-3 md:table-row-group md:space-y-0">
                {others.map((row) => (
                  <tr
                    key={row.key}
                    data-compare={row.key}
                    className="block rounded-[14px] bg-white p-5 md:table-row md:p-0"
                  >
                    <th
                      scope="row"
                      className="block align-top font-bold md:table-cell md:rounded-l-[14px] md:p-5"
                    >
                      {row.name}
                      {row.hint && (
                        <span className="block text-[14px] font-normal text-muted-foreground">
                          {row.hint}
                        </span>
                      )}
                    </th>
                    <td className="block pt-2 align-top text-[19px] leading-snug font-bold md:table-cell md:p-5">
                      {row.question}
                    </td>
                    <td className="block pt-2 align-top leading-[1.8] text-muted-foreground md:table-cell md:rounded-r-[14px] md:p-5">
                      {row.gives}
                    </td>
                  </tr>
                ))}
                <tr
                  data-compare="noren"
                  className="block rounded-[14px] bg-kon p-5 text-white md:table-row md:p-0"
                >
                  <th
                    scope="row"
                    className="block align-top font-bold md:table-cell md:rounded-l-[14px] md:p-5"
                  >
                    <span className="flex items-center gap-2">
                      <NorenTab story />
                      {m.norenName}
                    </span>
                  </th>
                  <td className="block pt-2 align-top text-[19px] leading-snug font-bold text-kasutera md:table-cell md:p-5">
                    {m.norenQuestion}
                  </td>
                  <td className="block pt-2 align-top leading-[1.8] md:table-cell md:rounded-r-[14px] md:p-5">
                    {m.norenGives}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[20px] font-bold text-balance">{m.together}</p>
          </div>
        </section>

        <section
          aria-labelledby="feel-title"
          className="mx-auto max-w-[1200px] space-y-8 px-4 py-16 sm:px-6 lg:py-24"
        >
          <h2
            id="feel-title"
            className="text-[30px] leading-tight font-bold text-balance sm:text-[40px]"
          >
            {m.feelTitle}
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <figure className="flex min-w-0 flex-col gap-4">
              <TypicalSketch m={m} />
              <figcaption className="leading-[1.8]">
                <span className="block font-bold">{m.typicalLabel}</span>
                {m.typicalCaption}
              </figcaption>
            </figure>
            <figure className="flex min-w-0 flex-col gap-4">
              <NorenSketch m={m} />
              <figcaption className="leading-[1.8]">
                <span className="block font-bold">{m.norenLabel}</span>
                {m.norenCaption}
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          aria-labelledby="promises-title"
          className="mx-auto max-w-[1200px] space-y-10 border-t border-line px-4 py-16 sm:px-6 lg:py-24"
        >
          <h2
            id="promises-title"
            className="text-[30px] leading-tight font-bold text-balance sm:text-[40px]"
          >
            {m.promisesTitle}
          </h2>
          <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {promises.map(([title, body]) => (
              <li key={title} className="flex min-w-0 gap-3">
                <span className="pt-1">
                  <NorenTab />
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-[18px] font-bold">{title}</h3>
                  <p className="leading-[1.8] text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="why-title" className="bg-kon text-white">
          <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-16 sm:px-6 lg:py-24">
            <h2
              id="why-title"
              className="text-[30px] leading-tight font-bold text-balance sm:text-[40px]"
            >
              {m.whyTitle}
            </h2>
            <p className="max-w-[40em] text-[18px] leading-[1.9]">{m.why1}</p>
            <p className="max-w-[40em] text-[18px] leading-[1.9]">{m.why2}</p>
            <p className="max-w-[24em] pt-4 text-[26px] leading-snug font-bold text-balance text-kasutera sm:text-[32px]">
              {m.why3}
            </p>
          </div>
        </section>

        <section
          aria-labelledby="status-title"
          className="mx-auto max-w-[1200px] space-y-10 px-4 py-16 sm:px-6 lg:py-24"
        >
          <h2
            id="status-title"
            className="text-[30px] leading-tight font-bold text-balance sm:text-[40px]"
          >
            {m.statusTitle}
          </h2>
          <ol className="grid gap-8 md:grid-cols-2">
            {[
              [m.nowLabel, m.nowBody],
              [m.nextLabel, m.nextBody],
            ].map(([label, body], index) => (
              <li key={label} className="min-w-0 space-y-2 border-t-4 border-kon pt-4">
                <p
                  className={
                    index === 0
                      ? "text-[15px] font-bold text-ai"
                      : "text-[15px] font-bold text-muted-foreground"
                  }
                >
                  {label}
                </p>
                <p className="text-[18px] leading-[1.8]">{body}</p>
              </li>
            ))}
          </ol>
          <p className="max-w-[40em] leading-[1.8] text-muted-foreground">{m.madeIn}</p>
          <div className="space-y-6 rounded-[14px] bg-kamenozoki p-6 sm:p-10">
            <p className="text-[26px] leading-snug font-bold text-balance sm:text-[32px]">
              {m.ctaTitle}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={map} className={primary}>
                {m.openMap}
              </Link>
              <a href={REPO_URL} className={secondary}>
                {m.seeCode}
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** A noren in three panels, the same cloth every place page hangs. */
function HeroCloth() {
  return (
    <div aria-hidden="true" className="order-first lg:order-none">
      <div className="about-cloth relative mx-auto h-[200px] w-full max-w-[400px] origin-top bg-kon sm:h-[340px]">
        <span className="absolute inset-x-0 top-0 h-3 bg-black/20" />
        <span className="absolute bottom-0 left-1/3 h-[58%] w-[6px] -translate-x-1/2 bg-background" />
        <span className="absolute bottom-0 left-2/3 h-[58%] w-[6px] -translate-x-1/2 bg-background" />
        <span className="absolute inset-x-0 top-7 flex justify-center sm:top-10">
          <span
            lang="ja"
            className="font-display text-[44px] leading-[1.2] font-extrabold text-white [writing-mode:vertical-rl] sm:text-[68px]"
          >
            暖簾
          </span>
        </span>
      </div>
    </div>
  );
}

/** The usual listing, drawn from shapes: a score, a rank, ads and other people's opinions. */
function TypicalSketch({ m }: { m: AboutMessages }) {
  return (
    <div
      aria-hidden="true"
      className="flex-1 space-y-4 rounded-[14px] border border-line bg-white p-5 select-none"
    >
      <div className="relative h-28 rounded-[10px] bg-[#e4e7ec]">
        <span className="absolute top-3 left-3 rounded-full bg-[#fde68a] px-3 py-1 text-[13px] font-bold text-[#713f12]">
          {m.sponsored}
        </span>
      </div>
      <div className="h-4 w-2/3 rounded bg-[#cfd5dd]" />
      <div className="flex items-center gap-3">
        <span className="text-[22px] leading-none tracking-[2px] text-[#f59e0b]">★★★★☆</span>
        <span className="rounded-full border border-beni px-3 py-0.5 text-[13px] font-bold text-beni">
          {m.topTen}
        </span>
      </div>
      {[0.9, 0.7, 0.8].map((width, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="size-8 shrink-0 rounded-full bg-[#dfe3e8]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 rounded bg-[#e4e7ec]" style={{ width: `${width * 100}%` }} />
            <div className="h-2.5 w-1/2 rounded bg-[#eef0f3]" />
          </div>
        </div>
      ))}
      <div className="h-12 rounded-[10px] bg-[repeating-linear-gradient(45deg,#eef0f3_0_10px,#e4e7ec_10px_20px)]" />
    </div>
  );
}

/** A Noren page, drawn from shapes: the cloth, a confirmation, sentences with their sources. */
function NorenSketch({ m }: { m: AboutMessages }) {
  return (
    <div
      aria-hidden="true"
      className="flex-1 space-y-4 rounded-[14px] border border-line bg-white p-5 select-none"
    >
      <div className="relative h-28 bg-kon">
        <span className="absolute bottom-0 left-1/3 h-10 w-[4px] -translate-x-1/2 bg-white" />
        <span className="absolute bottom-0 left-2/3 h-10 w-[4px] -translate-x-1/2 bg-white" />
        <span className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col gap-1.5">
          <span className="size-3.5 rounded-[3px] bg-white/90" />
          <span className="size-3.5 rounded-[3px] bg-white/90" />
        </span>
      </div>
      <span className="inline-flex items-center gap-2 rounded-[10px] border border-line px-3 py-1.5 text-[14px] font-bold">
        <CircleCheck className="size-4" />
        {m.confirmedChip}
      </span>
      <div className="space-y-3">
        {[
          [0.95, "1"],
          [0.85, "2"],
          [0.9, "1"],
          [0.55, "2"],
        ].map(([width, note], index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div className="h-2.5 rounded bg-kon/25" style={{ width: `${Number(width) * 90}%` }} />
            <span className="text-[12px] leading-none font-bold text-ai">{note}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1 border-t border-line pt-3 text-[13px] text-muted-foreground">
        <p>
          <span className="font-bold text-ai">1</span> {m.sourceInterview}
        </p>
        <p>
          <span className="font-bold text-ai">2</span> {m.sourcePost}
        </p>
      </div>
    </div>
  );
}
