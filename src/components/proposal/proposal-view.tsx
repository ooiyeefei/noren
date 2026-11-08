import { SiteFooter } from "@/components/layout/site-footer";
import { messagesFor, type Locale } from "@/lib/i18n";
import { proposalMessages } from "@/lib/i18n/messages/proposal";
import { cn } from "@/lib/utils";
import { GiftButton, RewardChoice } from "./mock-controls";

/** The Consumer Affairs Agency's page on prize rules, the source of the figures in the last note. */
export const PRIZE_RULES_URL =
  "https://www.caa.go.jp/policies/policy/representation/fair_labeling/premium_regulation/";

/** The label every proposal screen carries (FR-121): the same two words in both languages. */
export const MOCK_LABEL = { mark: "見本", word: "Mock" } as const;

const DISPLAY = "var(--font-shippori), 'Hiragino Mincho ProN', 'Yu Mincho', serif";

function MockSeal({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 -rotate-3 items-center gap-2 rounded-md border-2 border-beni bg-gofun px-2.5 py-1 text-sm leading-tight font-bold text-beni",
        className,
      )}
    >
      <b lang="ja" className="font-display text-[17px] font-extrabold">
        {MOCK_LABEL.mark}
      </b>
      <span lang="en">{MOCK_LABEL.word}</span>
    </span>
  );
}

/**
 * A picture drawn for this page only: a moon, lanterns, a gate with a red door marked 見本, and a
 * kite. It names no place. Six strips of it make the sample noren.
 */
function ArtDefs(): React.JSX.Element {
  const rings = [
    [20, 0],
    [0, 20],
    [40, 20],
    [20, 40],
  ] as const;
  const lanterns = [
    [44, 100],
    [104, 110],
    [160, 92],
    [36, 222],
    [88, 218],
    [58, 310],
    [490, 224],
    [552, 214],
    [520, 316],
    [120, 306],
    [456, 118],
  ] as const;
  const serif = { fontFamily: DISPLAY };
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="proposal-wave" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#23305c" />
          <g fill="#23305c" stroke="#e8eff3" strokeWidth="1.5">
            {rings.map(([x, y]) =>
              [19, 12.5, 6].map((r) => <circle key={`${x}-${y}-${r}`} cx={x} cy={y} r={r} />),
            )}
          </g>
        </pattern>
        <g id="proposal-lantern">
          <line x1="0" y1="-25" x2="0" y2="-15" stroke="#fff" strokeWidth="1.6" />
          <rect x="-8" y="-18" width="16" height="5" fill="#f2c14e" />
          <ellipse rx="19" ry="16" fill="#b7282e" />
          <path
            d="M-9-14Q-15 0-9 14M9-14Q15 0 9 14M0-16V16"
            stroke="#7c181d"
            strokeWidth="1.5"
            fill="none"
          />
          <rect x="-8" y="12" width="16" height="5" fill="#f2c14e" />
          <line x1="0" y1="17" x2="0" y2="35" stroke="#f2c14e" strokeWidth="2.4" />
        </g>
        <g id="proposal-art">
          <rect width="600" height="420" fill="#23305c" />
          <circle cx="300" cy="166" r="124" fill="#f2c14e" />
          <g fill="none" stroke="#fff" strokeWidth="1.6">
            <path d="M-6 26Q76 112 186 52" />
            <path d="M-6 158Q48 214 112 178" />
            <path d="M606 138Q540 214 462 170" />
            <path d="M474 22Q506 66 540 54" />
          </g>
          {lanterns.map(([x, y]) => (
            <use key={`${x}-${y}`} href="#proposal-lantern" x={x} y={y} />
          ))}
          <g fill="#fff">
            <path d="M196 116C232 110 268 102 300 102C332 102 368 110 404 116L420 100C416 122 394 132 378 132H222C206 132 184 122 180 100Z" />
            <rect x="244" y="132" width="112" height="22" />
            <path d="M144 176C192 168 250 156 300 156C350 156 408 168 456 176L476 158C470 184 442 196 420 196H180C158 196 130 184 124 158Z" />
            <rect x="170" y="196" width="260" height="14" />
            <rect x="196" y="210" width="20" height="150" />
            <rect x="384" y="210" width="20" height="150" />
            <rect x="150" y="232" width="14" height="128" />
            <rect x="436" y="232" width="14" height="128" />
            <rect x="150" y="232" width="66" height="10" />
            <rect x="384" y="232" width="66" height="10" />
          </g>
          <rect x="262" y="212" width="76" height="118" fill="#b7282e" />
          <text
            x="300"
            y="262"
            textAnchor="middle"
            style={serif}
            fontWeight="800"
            fontSize="42"
            fill="#fff"
          >
            見
          </text>
          <text
            x="300"
            y="312"
            textAnchor="middle"
            style={serif}
            fontWeight="800"
            fontSize="42"
            fill="#fff"
          >
            本
          </text>
          <g transform="rotate(12 548 62)">
            <path d="M548 18L586 62L548 106L510 62Z" fill="#fff" />
            <path d="M548 34L572 62L548 90L524 62Z" fill="#b7282e" />
            <path d="M548 48L560 62L548 76L536 62Z" fill="#fff" />
          </g>
          <rect y="360" width="600" height="60" fill="url(#proposal-wave)" />
        </g>
      </defs>
    </svg>
  );
}

/** A finished noren of the sample picture: six panels hung from a rod, slit between them. */
function SampleNoren({ label }: { label: string }): React.JSX.Element {
  return (
    <div role="img" aria-label={label} className="relative pt-1.5">
      <span
        aria-hidden="true"
        className="absolute -inset-x-[3px] top-0 h-[3px] rounded-[3px] bg-kon"
      />
      <div className="relative aspect-[600/420]">
        <div className="absolute inset-0 grid grid-cols-6">
          {Array.from({ length: 6 }, (_, panel) => (
            <div key={panel} className="relative overflow-hidden bg-kamenozoki">
              <svg
                viewBox={`${panel * 100} 0 100 420`}
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute inset-0 block size-full"
              >
                <use href="#proposal-art" />
              </svg>
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }, (_, slit) => (
          <span
            key={slit}
            aria-hidden="true"
            style={{ left: `${((slit + 1) * 100) / 6}%` }}
            className="absolute bottom-0 z-[1] h-2/3 w-0.5 -translate-x-1/2 bg-gofun"
          />
        ))}
      </div>
    </div>
  );
}

/** A pattern shaped like a QR code. It holds no data and cannot scan. */
function SampleQr({ label }: { label: string }): React.JSX.Element {
  const cells: { x: number; y: number }[] = [];
  let seed = 11;
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
      seed = (seed * 31 + x * 7 + y * 13) % 997;
      if (seed % 5 < 2) cells.push({ x, y });
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg
      viewBox="0 0 21 21"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="size-[124px] self-center"
    >
      <g fill="#23305c">
        {cells.map(({ x, y }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
        ))}
        {finder(0, 0)}
        {finder(14, 0)}
        {finder(0, 14)}
      </g>
    </svg>
  );
}

function Screen({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <article
      aria-labelledby={id}
      data-mock-screen=""
      className="relative flex min-w-0 flex-col gap-3 rounded-2xl bg-gofun p-4"
    >
      <MockSeal />
      <h3 id={id} className="font-display text-[17px] leading-snug font-extrabold">
        {title}
      </h3>
      {children}
    </article>
  );
}

const CAPTION = "text-sm leading-[1.65] text-muted-foreground @4xl:mt-auto @4xl:pt-1.5";
const FIELD_LABEL = "text-sm font-bold";
const CONTROL_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

/**
 * The page a local team can be sent to. It is static: it reads nothing from Convex, so a real
 * place can't reach it, and nothing links to it. Every screen carries the 見本 Mock label, uses
 * sample names and example numbers, and says that no shop or local body has agreed.
 */
export function ProposalView({ locale }: { locale: Locale }): React.JSX.Element {
  const m = messagesFor(proposalMessages, locale);
  const steps = [
    { when: m.nowWhen, body: m.nowBody, tag: m.nowTag, mock: false },
    { when: m.pilotWhen, body: m.pilotBody, tag: m.pilotTag, mock: true },
    { when: m.laterWhen, body: m.laterBody, tag: m.laterTag, mock: true },
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
        <ArtDefs />
        <section className="mx-auto max-w-[1120px] space-y-4 px-4 pt-8 pb-10 sm:px-6 lg:pt-16">
          <h1 className="font-display text-[34px] leading-[1.2] font-extrabold text-balance sm:text-[42px]">
            {m.heroTitle}
          </h1>
          <p className="max-w-[40em] text-[18px] leading-[1.75]">{m.heroLead}</p>
        </section>

        <section
          aria-labelledby="next-title"
          className="mx-auto max-w-[1120px] px-0 pb-16 sm:px-6 lg:pb-24"
        >
          <div className="@container rounded-none bg-kamenozoki px-4 py-6 sm:rounded-[20px] sm:px-9 sm:py-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-2">
                <h2
                  id="next-title"
                  className="font-display text-[25px] leading-snug font-extrabold text-balance sm:text-[30px]"
                >
                  {m.nextTitle}
                </h2>
                <p className="max-w-[66ch] leading-[1.7]">{m.statement}</p>
              </div>
              <MockSeal />
            </div>

            <ol aria-label={m.stepsLabel} className="mt-7 grid gap-4.5 @2xl:grid-cols-3">
              {steps.map((step) => (
                <li key={step.when} className="min-w-0 rounded-[14px] bg-gofun p-[18px]">
                  <span className="mb-1.5 block font-display text-xl font-extrabold">
                    {step.when}
                  </span>
                  <p className="leading-[1.7]">{step.body}</p>
                  <span
                    className={cn(
                      "mt-2.5 inline-block rounded-md px-2 py-0.5 text-[13px] leading-snug font-bold",
                      step.mock ? "border border-beni text-beni" : "bg-kamenozoki",
                    )}
                  >
                    {step.tag}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-8 grid gap-4.5 @xl:grid-cols-2 @4xl:grid-cols-4">
              <Screen id="mock-gift" title={m.giftTitle}>
                <SampleNoren label={m.giftNorenLabel} />
                <p className="leading-[1.7]">{m.giftBody}</p>
                <GiftButton show={m.giftShow} mark={m.giftMark} given={m.giftGiven} />
                <p className={CAPTION}>{m.giftCaption}</p>
              </Screen>

              <Screen id="mock-qr" title={m.qrTitle}>
                <SampleQr label={m.qrLabel} />
                <p className="text-center leading-[1.6]">
                  <b>{m.qrShop}</b>
                  <br />
                  <span className="text-sm text-muted-foreground">{m.qrBody}</span>
                </p>
                <p className={CAPTION}>{m.qrCaption}</p>
              </Screen>

              <Screen id="mock-team" title={m.teamTitle}>
                <div className="space-y-1">
                  <label htmlFor="mock-set-name" className={cn(FIELD_LABEL, "block")}>
                    {m.teamNameLabel}
                  </label>
                  <textarea
                    id="mock-set-name"
                    readOnly
                    rows={2}
                    defaultValue={m.teamName}
                    className={cn(
                      "w-full resize-none rounded-lg border border-input bg-gofun px-2.5 py-2 text-[15px] leading-snug",
                      CONTROL_FOCUS,
                    )}
                  />
                </div>
                <fieldset className="min-w-0 space-y-0.5 text-[15px]">
                  <legend className={FIELD_LABEL}>{m.teamPlacesLabel}</legend>
                  {[
                    [m.shopA, true],
                    [m.shopB, true],
                    [m.shrine, false],
                  ].map(([name, on]) => (
                    <label key={String(name)} className="flex min-h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        defaultChecked={Boolean(on)}
                        className={cn("size-[18px] shrink-0 accent-kon", CONTROL_FOCUS)}
                      />
                      {String(name)}
                    </label>
                  ))}
                </fieldset>
                <RewardChoice
                  legend={m.teamRewardLabel}
                  choices={[
                    { key: "badge", label: m.rewardBadge },
                    { key: "gift", label: m.rewardGift },
                    { key: "coupon", label: m.rewardCoupon },
                  ]}
                />
                <p className={CAPTION}>{m.teamCaption}</p>
              </Screen>

              <Screen id="mock-shop" title={m.shopTitle}>
                <div>
                  <p className="font-display text-[38px] leading-[1.1] font-extrabold">128</p>
                  <p className="text-sm text-muted-foreground">{m.shopVisits}</p>
                </div>
                <div>
                  <p className="font-display text-[38px] leading-[1.1] font-extrabold">9</p>
                  <p className="text-sm text-muted-foreground">{m.shopStories}</p>
                </div>
                <p className={CAPTION}>{m.shopCaption}</p>
              </Screen>
            </div>

            <div className="mt-8 grid gap-4.5 @xl:grid-cols-2">
              <section aria-labelledby="team-gets" className="rounded-[14px] bg-gofun p-[18px]">
                <h3 id="team-gets" className="font-display text-[19px] font-extrabold">
                  {m.teamGetsTitle}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-[1.7]">
                  <li>{m.teamGets1}</li>
                  <li>{m.teamGets2}</li>
                  <li>{m.teamGets3}</li>
                </ul>
              </section>
              <section aria-labelledby="we-ask" className="rounded-[14px] bg-gofun p-[18px]">
                <h3 id="we-ask" className="font-display text-[19px] font-extrabold">
                  {m.askTitle}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-[1.7]">
                  <li>{m.ask1}</li>
                  <li>{m.ask2}</li>
                  <li>{m.ask3}</li>
                </ul>
              </section>
            </div>

            <p className="mt-5 leading-[1.7]">
              {m.rules}{" "}
              <a
                href={PRIZE_RULES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ai underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {m.rulesLink}
                <span className="sr-only"> {m.opensInNewTab}</span>
              </a>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
