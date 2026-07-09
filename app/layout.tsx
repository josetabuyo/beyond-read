import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { TransitionVeilProvider } from "@/components/TransitionVeil";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "BeyondRead",
  description: "Una posta de lecturas — leé un poema, y quedá para el próximo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cormorant.variable}>
      <body>
        <TransitionVeilProvider>{children}</TransitionVeilProvider>
      </body>
    </html>
  );
}
