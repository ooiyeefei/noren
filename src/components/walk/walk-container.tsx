"use client";

import { useConvex } from "convex/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PublicRegionProps } from "@/components/public/mapping";
import { messagesFor, type Locale } from "@/lib/i18n";
import { walkMessages } from "@/lib/i18n/messages/walk";
import { WalkController } from "@/lib/walk/controller";
import { convexWalkData } from "@/lib/walk/convex-data";
import { browserSpeech, browserWakeLock, onPageVisible } from "./browser-ports";
import { OmikujiPanel } from "./omikuji-panel";
import { WalkView, type WalkRegionProps } from "./walk-view";

/**
 * Walk mode, wired to the phone. The two requests it makes to Noren are in convexWalkData and carry
 * only the region; the position goes from the phone's watch into the controller and the screen and
 * nowhere else.
 */
export function WalkContainer({
  locale,
  region,
  walk,
}: {
  locale: Locale;
  region: PublicRegionProps;
  walk: WalkRegionProps;
}) {
  const convex = useConvex();
  const data = useMemo(() => convexWalkData(convex, region.regionId), [convex, region.regionId]);
  const [controller] = useState(
    () =>
      new WalkController(
        {
          data,
          geolocation: typeof navigator === "undefined" ? undefined : navigator.geolocation,
          wakeLock: browserWakeLock(),
          speech: browserSpeech(),
          now: () => Date.now(),
          random: () => Math.random(),
          onVisible: onPageVisible,
        },
        {
          locale,
          accuracyAllowanceMetres: walk.accuracyAllowanceMetres,
          messages: messagesFor(walkMessages, locale),
        },
      ),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  // Leaving the page, or hiding it for good, lets go of the position watch, the screen and the speaker.
  useEffect(() => {
    const letGo = () => controller.stop();
    window.addEventListener("pagehide", letGo);
    return () => {
      window.removeEventListener("pagehide", letGo);
      controller.dispose();
    };
  }, [controller]);
  return (
    <WalkView
      locale={locale}
      region={region}
      walk={walk}
      snapshot={snapshot}
      actions={{
        start: () => void controller.start(),
        stop: () => controller.stop(),
        setSound: (on) => controller.setSound(on),
        dismiss: () => controller.dismiss(),
        readAloud: (id) => controller.readAloud(id),
        stopTalking: () => controller.stopTalking(),
      }}
      omikuji={
        <OmikujiPanel
          locale={locale}
          region={region}
          regionName={walk.regionName}
          neighbourhoods={walk.neighbourhoods}
          planner={walk.planner}
          data={data}
          position={snapshot.fix}
        />
      }
    />
  );
}
