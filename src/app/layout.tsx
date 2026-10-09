import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuideFlow — Create Step-by-Step Guides Automatically",
  description: "Record browser processes, capture screenshots, edit and share step-by-step guides. Built for support and implementation teams.",
  keywords: ["guide", "tutorial", "screenshot", "documentation", "SOP", "process recording"],
  openGraph: {
    title: "GuideFlow — Create Step-by-Step Guides Automatically",
    description: "Record browser processes and create beautiful step-by-step guides with screenshots.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
