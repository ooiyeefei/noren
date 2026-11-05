"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import { PageContainer } from "@/components/layout/page-container";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { pickPlaceName } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStewardAction } from "./steward-home-container";
import { StewardFeedback, StewardNav } from "./steward-home-view";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-kon px-4 py-2 font-bold text-kon disabled:opacity-50";
const FIELD = "min-h-11 w-full min-w-0 rounded-[10px] border border-input bg-gofun p-2 text-[16px]";

/** Swap a set's places, pick the lines people see after checking in, and set a set live. */
export function CollectionAdmin({ locale, region }: { locale: Locale; region: RegionConfig }) {
  const sets = useQuery(api.collection.listForSteward, { regionId: region.id });
  const setStatus = useMutation(api.collection.setStatus);
  const swapPlace = useMutation(api.collection.swapPlace);
  const pickLine = useMutation(api.collection.pickLine);
  const { state, run } = useStewardAction(locale);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const m = messagesFor(collectionMessages, locale);
  const nameOf = (names: Parameters<typeof pickPlaceName>[0], slug: string) =>
    pickPlaceName(names, locale, region).primary?.value ?? slug;
  if (!sets) return <p role="status">{messagesFor(stewardMessages, locale).loading}</p>;
  return (
    <PageContainer locale={locale} title={m.stewardTitle}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} current="collection" />
        <p className="max-w-prose rounded-[10px] bg-kamenozoki p-4">{m.stewardHint}</p>
        <StewardFeedback locale={locale} {...state} />
        {sets.length === 0 && <p>{m.stewardEmpty}</p>}
        {sets.map((set) => {
          const placeNames = new Map(
            set.panels.flatMap((panel) =>
              panel.places.map(
                (place) => [place.placeId, nameOf(place.names, place.slug)] as const,
              ),
            ),
          );
          return (
            <section key={set.id} data-steward-set={set.neighbourhoodId} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[22px] font-bold">{neighbourhoodName(set.names, locale)}</h2>
                <span className="rounded-full border border-line px-3 py-1 text-[13px]">
                  {set.status === "live" ? m.statusLive : m.statusDraft}
                </span>
                <button
                  type="button"
                  disabled={state.pending !== undefined}
                  className={BUTTON}
                  onClick={() =>
                    void run(`status:${set.id}`, async () => {
                      await setStatus({
                        setId: set.id,
                        status: set.status === "live" ? "draft" : "live",
                      });
                    })
                  }
                >
                  {set.status === "live" ? m.backToDraft : m.goLive}
                </button>
                <a
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={localePath(locale, `/collection/${set.neighbourhoodId}`)}
                >
                  {format(m.seeNoren, { name: neighbourhoodName(set.names, locale) })}
                </a>
              </div>
              {!set.hasWholeArt && <p role="alert">{m.wholeArtMissing}</p>}
              {set.tooClose.map(({ a, b, metres }) => (
                <p key={`${a}:${b}`} role="note" className="rounded-[10px] bg-kasutera/30 p-3">
                  {format(m.tooClose, {
                    a: placeNames.get(a) ?? a,
                    b: placeNames.get(b) ?? b,
                    metres: String(metres),
                  })}
                </p>
              ))}
              <ol className="space-y-4">
                {set.panels.map((panel) => {
                  const key = `${set.id}:${panel.index}`;
                  return (
                    <li
                      key={panel.index}
                      className="space-y-3 rounded-[10px] border border-line p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-bold">
                          {format(m.panelNumber, { panel: String(panel.index + 1) })}
                        </h3>
                        <span className="text-[13px] text-muted-foreground">
                          {panel.hasArt ? m.artReady : m.artMissing}
                        </span>
                      </div>
                      {panel.places.map((place) => (
                        <div key={place.placeId} className="space-y-2 border-t border-line pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <a
                              className="text-ai underline"
                              href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
                            >
                              {nameOf(place.names, place.slug)}
                            </a>
                            <button
                              type="button"
                              disabled={state.pending !== undefined}
                              className={BUTTON}
                              onClick={() =>
                                void run(`remove:${place.placeId}`, async () => {
                                  await swapPlace({
                                    setId: set.id,
                                    panelIndex: panel.index,
                                    removePlaceId: place.placeId,
                                  });
                                })
                              }
                            >
                              {m.removePlace}
                            </button>
                          </div>
                          {!place.usable && <p role="alert">{m.placeNotUsable}</p>}
                          {place.pickedLineEn !== null && !place.pickedLineLive && (
                            <p role="alert">{m.pickedGone}</p>
                          )}
                          {place.sentences.length === 0 ? (
                            <p className="text-[13px] text-muted-foreground">{m.noSentences}</p>
                          ) : (
                            <label className="block space-y-1">
                              <span className="block text-[13px] font-bold">{m.pickedLine}</span>
                              <select
                                className={FIELD}
                                disabled={state.pending !== undefined}
                                value={place.pickedLineLive ? (place.pickedLineEn ?? "") : ""}
                                onChange={(event) =>
                                  void run(`pick:${place.placeId}`, async () => {
                                    await pickLine({
                                      placeId: place.placeId,
                                      en: event.target.value || null,
                                    });
                                  })
                                }
                              >
                                <option value="">{m.noLine}</option>
                                {place.sentences.map((sentence) => (
                                  <option key={sentence.en} value={sentence.en}>
                                    {locale === "ja" ? sentence.ja : sentence.en}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        <select
                          aria-label={m.choosePlace}
                          className={`${FIELD} sm:w-auto sm:flex-1`}
                          value={adding[key] ?? ""}
                          onChange={(event) =>
                            setAdding((current) => ({ ...current, [key]: event.target.value }))
                          }
                        >
                          <option value="">{m.choosePlace}</option>
                          {set.candidates.map((candidate) => (
                            <option key={candidate.placeId} value={candidate.placeId}>
                              {nameOf(candidate.names, candidate.slug)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={state.pending !== undefined || !adding[key]}
                          className={BUTTON}
                          onClick={() =>
                            void run(`add:${key}`, async () => {
                              await swapPlace({
                                setId: set.id,
                                panelIndex: panel.index,
                                addPlaceId: adding[key] as Id<"place">,
                              });
                              setAdding((current) => ({ ...current, [key]: "" }));
                            })
                          }
                        >
                          {m.addPlace}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}
