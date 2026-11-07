import Link from "next/link";
import { NorenTab } from "@/components/explore/noren-tab";
import { FilmPlayer } from "@/components/film/film-player";
import { SiteFooter } from "@/components/layout/site-footer";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";

/** The page a signed-out visitor meets first: what Noren is, the film, and the way to the map. */
export function WelcomeView({ locale, accountsOpen }: { locale: Locale; accountsOpen: boolean }) {
  const m = messagesFor(welcomeMessages, locale);
  const map = localePath(locale, "/map");
  const primary =
    "inline-flex min-h-12 items-center justify-center rounded-[10px] bg-kon px-6 text-[17px] font-bold text-white";
  const steps = [
    { title: m.findTitle, body: m.findBody, mark: <NorenTab story /> },
    { title: m.readTitle, body: m.readBody },
    { title: m.addTitle, body: m.addBody },
  ];
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        lang={locale}
        // Keeps Japanese phrases whole when a line wraps, where the browser supports it.
        className={`flex-1 font-sans text-kon ${locale === "ja" ? "[word-break:auto-phrase]" : ""}`}
      >
        <section className="mx-auto max-w-[960px] space-y-6 px-4 pt-8 pb-14 sm:px-6 lg:pt-16 lg:pb-20">
          <h1 className="text-[40px] leading-[1.15] font-bold text-balance sm:text-[56px]">
            {m.heroTitle}
          </h1>
          <p className="max-w-[34em] text-[18px] leading-[1.8] sm:text-[20px]">{m.heroLead}</p>
          <div>
            <Link href={map} className={primary}>
              {m.openMap}
            </Link>
          </div>
          <figure className="space-y-3">
            <FilmPlayer locale={locale} />
          </figure>
        </section>

        <section aria-labelledby="how-title" className="bg-kamenozoki">
          <div className="mx-auto max-w-[960px] space-y-8 px-4 py-14 sm:px-6 lg:py-20">
            <h2 id="how-title" className="text-[30px] leading-tight font-bold sm:text-[40px]">
              {m.howTitle}
            </h2>
            <ul className="grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.title} className="min-w-0 space-y-2 border-t-4 border-kon pt-4">
                  <h3 className="flex items-center gap-2 text-[20px] leading-snug font-bold text-balance">
                    {step.mark}
                    {step.title}
                  </h3>
                  <p className="leading-[1.8]">{step.body}</p>
                </li>
              ))}
            </ul>
            {accountsOpen ? (
              <p className="leading-[1.8] text-muted-foreground">
                {m.membersNoteOpen}{" "}
                <Link
                  className="underline underline-offset-4"
                  href={localePath(locale, "/sign-up")}
                >
                  {m.makeAccount}
                </Link>
              </p>
            ) : (
              <p className="leading-[1.8] text-muted-foreground">{m.membersNote}</p>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-[960px] space-y-6 px-4 py-14 sm:px-6 lg:py-20">
          <p className="text-[26px] leading-snug font-bold text-balance sm:text-[32px]">
            {m.ctaTitle}
          </p>
          <Link href={map} className={primary}>
            {m.openMap}
          </Link>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
