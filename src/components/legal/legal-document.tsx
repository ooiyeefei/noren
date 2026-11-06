import { PageContainer } from "@/components/layout/page-container";
import { format, type Locale } from "@/lib/i18n";
import { legalDocuments, legalMessages } from "@/lib/i18n/messages/legal-documents";
import type { DocumentValues } from "./documents";

/** A web address becomes a link. A role address stays as text. */
function Contact({ contact }: { contact: string }) {
  return /^https?:\/\//.test(contact) ? (
    <a className="underline" href={contact}>
      {contact}
    </a>
  ) : (
    <>{contact}</>
  );
}

function Filled({ text, values }: { text: string; values: DocumentValues }) {
  const { contact, ...rest } = values;
  const [before, after] = format(text, rest).split("{contact}");
  if (after === undefined) return <>{before}</>;
  return (
    <>
      {before}
      <Contact contact={contact} />
      {after}
    </>
  );
}

/** The terms or the privacy notice, with the region's facts filled in and its version date on top. */
export function LegalDocumentView({
  locale,
  kind,
  values,
}: {
  locale: Locale;
  kind: "terms" | "privacy";
  values: DocumentValues;
}) {
  const legal = legalDocuments[locale][kind];
  const shown = legal.sections.filter(({ id }) => id !== "photos" || values.photos === "on");
  return (
    <PageContainer locale={locale} title={legal.title}>
      <div lang={locale} className="max-w-prose space-y-8 leading-[1.8]">
        <div className="space-y-2">
          <p className="text-[15px] text-muted-foreground">
            {format(legalMessages[locale].version, { version: values.version })}
          </p>
          <p>{legal.lead}</p>
        </div>
        {shown.map((section) => (
          <section key={section.id} aria-labelledby={section.id} className="space-y-3">
            <h2 id={section.id} className="text-[20px] leading-snug font-bold">
              <Filled text={section.heading} values={values} />
            </h2>
            {section.paragraphs?.map((text, index) => (
              <p key={index}>
                <Filled text={text} values={values} />
              </p>
            ))}
            {section.items && (
              <ul className="list-disc space-y-2 pl-6">
                {section.items.map((text, index) => (
                  <li key={index}>
                    <Filled text={text} values={values} />
                  </li>
                ))}
              </ul>
            )}
            {section.services && (
              <dl className="space-y-4">
                {section.services.map((service) => (
                  <div key={service.name}>
                    <dt className="font-bold">
                      {service.name} ({service.country})
                    </dt>
                    <dd>{service.does}</dd>
                  </div>
                ))}
              </dl>
            )}
            {section.closing?.map((text, index) => (
              <p key={index}>
                <Filled text={text} values={values} />
              </p>
            ))}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
