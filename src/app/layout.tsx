import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme-gamrot.css";

export const metadata: Metadata = {
  title: "LeadHunter",
  description: "Interní nástroj pro obchodní příležitosti a kapacity.",
};

// Bez tohoto Safari na iPhonu vykresluje stránku jako desktop (980px) a zmenší ji —
// veškerá responzivní CSS by byla bez efektu. viewport-fit=cover kvůli notch/Dynamic Island.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Nastaví uložené téma ještě před vykreslením, aby stránka neproblikla původními barvami.
const themeInit = `try{var t=localStorage.getItem("leadhunter-theme");if(t&&t!=="default")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
