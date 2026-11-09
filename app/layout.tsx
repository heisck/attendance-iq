import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { Splash } from "@/components/Splash";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Attendance IQ",
  description: "Face-verified class attendance with rotating QR codes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below sets data-splash attributes on <html> before React hydrates.
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        {/* Runs before first paint: a device that has seen the splash skips it. The key matches SPLASH_SEEN in
            Splash.tsx (a client module, so a server file can't import the value). */}
        <Script id="splash-seen" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("aiq-splash-seen")){var d=document.documentElement.dataset;d.splashSeen="";d.splash="done"}}catch(e){}`}
        </Script>
        <Splash />
        {children}
      </body>
    </html>
  );
}
