export type ProblemStatus = "open" | "done";
export type ProblemReport = {
  _id: string;
  details: string;
  pagePath: string;
  device: string;
  contact?: string;
  locale: "ja" | "en";
  status: ProblemStatus;
  receivedAt: number;
  closedAt?: number;
};
/** A stored page path is same-site; the link goes to it in the report's own language as written. */
export const pageHref = (pagePath: string) => (pagePath.startsWith("/") ? pagePath : "");
export const newestFirst = (rows: readonly ProblemReport[]) =>
  [...rows].sort((a, b) => b.receivedAt - a.receivedAt || b._id.localeCompare(a._id));
