import { NoticeView } from "@/components/public/notice-view";
import { noticePlatforms } from "@/components/public/mapping";
import { getLocale } from "@/lib/i18n/server";
import { activeRegionConfig } from "@/lib/region/registry";

export default async function Page() {
  const locale = await getLocale();
  const region = activeRegionConfig();
  return (
    <NoticeView
      locale={locale}
      platforms={noticePlatforms(region, locale)}
      contact={region.takedown.contact}
      operatorName={region.legal.operatorName}
    />
  );
}
