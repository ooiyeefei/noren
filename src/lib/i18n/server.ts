import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { getActiveRegion } from "@/lib/region";
import {
  isSupportedLocale,
  messagesFor,
  type Locale,
  type Messages,
  type MessageTable,
} from "./index";

export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!isSupportedLocale(locale) || !getActiveRegion().locales.includes(locale)) notFound();
  return locale;
}

export async function getMessages<K extends string>(
  messages: Messages<K>,
): Promise<MessageTable<K>> {
  return messagesFor(messages, await getLocale());
}
