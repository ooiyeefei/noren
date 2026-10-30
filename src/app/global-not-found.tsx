import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

// Rendered outside the [lang] layout, so it cannot know the language: it says it in both.
export default function GlobalNotFound() {
  return (
    <html lang="ja">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-semibold">ページが見つかりません</h1>
        <p lang="en">Page not found</p>
        <Link className="underline" href="/">
          Noren
        </Link>
      </body>
    </html>
  );
}
