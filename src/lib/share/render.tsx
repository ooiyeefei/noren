import { ImageResponse } from "next/og";
import { CARD_SIZES, SITE, cardLayout, fitBody, fitPlace, type CardSize } from "./card";

/** Palette from globals.css: kon ink on a pale washi ground, a kasutera stripe. */
const INK = "#23305c";
const GROUND = "#f7f4ec";
const SOFT = "#5a6585";
const STRIPE = "#f2c14e";

export type CardContent = {
  body: string;
  authorName: string;
  placeEnglish: string;
  placeJapanese: string | null;
  /** Said under cut words: the whole story is on Noren. */
  cutNote: string;
};

export type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 700 };

/** The picture of one story, in the size given: words, place, name and site, never a photo. Pure: the route gathers what it draws. */
export function renderCard(
  content: CardContent,
  size: CardSize,
  fonts: readonly CardFont[],
): ImageResponse {
  const layout = cardLayout(size);
  const fit = fitBody(content.body, size);
  const place = fitPlace(content.placeEnglish, content.placeJapanese, layout.textWidth);
  const { width, height } = CARD_SIZES[size];
  const line = {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: layout.textWidth,
  } as const;
  return new ImageResponse(
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        background: GROUND,
        color: INK,
        fontFamily: "BIZ UDPGothic",
        padding: layout.padding,
        position: "relative",
      }}
    >
      <div
        style={{ position: "absolute", top: 0, left: 0, width, height: 16, background: STRIPE }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: layout.header,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: SOFT }}>
          Noren 暖簾
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: place.beside ? "row" : "column",
            alignItems: place.beside ? "baseline" : "flex-start",
            marginTop: 28,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              ...line,
              fontSize: place.englishSize,
              lineHeight: 1.25,
              marginRight: place.beside ? 28 : 0,
              flexShrink: place.beside ? 0 : 1,
            }}
          >
            {content.placeEnglish}
          </span>
          {content.placeJapanese && (
            <span
              style={{
                ...line,
                fontSize: place.japaneseSize,
                lineHeight: 1.25,
                color: SOFT,
                flexShrink: place.beside ? 0 : 1,
              }}
            >
              {content.placeJapanese}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: layout.textWidth,
          height: layout.textHeight,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: fit.fontSize,
            lineHeight: fit.lineHeight,
            flexShrink: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {fit.text}
        </div>
        {fit.cut && (
          <div style={{ display: "flex", marginTop: 12, fontSize: 30, color: SOFT }}>
            {content.cutNote}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: layout.footer,
          flexShrink: 0,
          marginTop: "auto",
          borderTop: `2px solid ${SOFT}`,
          paddingTop: 0,
          fontSize: 36,
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: "flex", paddingBottom: 14 }}>{content.authorName}</div>
        <div style={{ display: "flex", paddingBottom: 14, color: SOFT }}>{SITE}</div>
      </div>
    </div>,
    {
      width,
      height,
      fonts: fonts.map((font) => ({ ...font, style: "normal" as const })),
    },
  );
}
