import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat History",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#17212b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  );
}
