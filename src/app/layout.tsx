import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeScript from "@/components/ThemeScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRS Naga",
  description: "Workstation assignments and leave requests for Field Operations",
};

// viewport-fit=cover lets the app paint under the iPhone notch / home
// indicator, with safe-area insets handled in globals.css. theme-color
// tints the mobile browser chrome to match whichever palette is active
// (ThemeScript/ThemeToggle keep it in sync with a forced light/dark choice).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6f2dd" },
    { media: "(prefers-color-scheme: dark)", color: "#12201b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // suppressHydrationWarning: ThemeScript may set data-theme before React
      // hydrates, and that attribute difference is expected, not a bug.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
