import { ImageResponse } from "next/og";
import type { CardFont } from "../share/render";

// The picture a link preview shows for a postcard (1200 x 630). It carries only what the card's own
// headline carries: who it is for and from, the town and day, and the place names. No message, no
// story words, no photo: a chat app or a crawler keeps a preview picture for as long as it likes, and
// this one must not outlive the card with anything the sender could later take back.

const INK = "#23305c";
const GROUND = "#f7f4ec";
const SOFT = "#5a6585";
const STRIPE = "#f2c14e";
const SEAL = "#b7282e";

export const POSTCARD_IMAGE = { width: 1200, height: 630 } as const;
/** More than this many names would not fit a preview; the rest are not named. */
const NAMES_SHOWN = 6;

export type PostcardImageContent = {
  title: string;
  from: string;
  /** The town and the day, as the card writes them. */
  where: string;
  /** Each place as English and Japanese beside it, already in the order the card shows. */
  places: readonly { primary: string; secondary: string | null }[];
  site: string;
};

export function renderPostcardImage(
  content: PostcardImageContent,
  fonts: readonly CardFont[],
): ImageResponse {
  const names = content.places.slice(0, NAMES_SHOWN);
  const more = content.places.length - names.length;
  return new ImageResponse(
    <div
      style={{
        width: POSTCARD_IMAGE.width,
        height: POSTCARD_IMAGE.height,
        display: "flex",
        flexDirection: "column",
        background: GROUND,
        color: INK,
        fontFamily: "BIZ UDPGothic",
        padding: "56px 72px 48px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: POSTCARD_IMAGE.width,
          height: 18,
          background: STRIPE,
        }}
      />
      <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: SOFT }}>Noren 暖簾</div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.2,
          maxHeight: 160,
          overflow: "hidden",
        }}
      >
        {content.title}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 32, color: SOFT }}>
        {content.where}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          marginTop: 30,
          maxHeight: 190,
          overflow: "hidden",
        }}
      >
        {names.map((place, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "baseline",
              marginRight: 24,
              marginBottom: 14,
              paddingBottom: 4,
              borderBottom: `4px solid ${SEAL}`,
              maxWidth: 520,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {place.primary}
            </span>
            {place.secondary && (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 26,
                  fontWeight: 400,
                  color: SOFT,
                  whiteSpace: "nowrap",
                }}
              >
                {place.secondary}
              </span>
            )}
          </div>
        ))}
        {more > 0 && (
          <div style={{ display: "flex", fontSize: 30, color: SOFT, marginBottom: 14 }}>
            +{more}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
          borderTop: `2px solid ${SOFT}`,
          paddingTop: 16,
          fontSize: 32,
        }}
      >
        <div style={{ display: "flex" }}>{content.from}</div>
        <div style={{ display: "flex", color: SOFT }}>{content.site}</div>
      </div>
    </div>,
    {
      ...POSTCARD_IMAGE,
      fonts: fonts.map((font) => ({ ...font, style: "normal" as const })),
    },
  );
}
