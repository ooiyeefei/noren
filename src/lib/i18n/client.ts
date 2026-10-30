"use client";

import { useParams } from "next/navigation";
import { isSupportedLocale, type Locale } from "./index";

export function useLocale(): Locale {
  const { lang } = useParams();
  if (!isSupportedLocale(lang)) throw new Error(`Unsupported locale: ${String(lang)}`);
  return lang;
}
