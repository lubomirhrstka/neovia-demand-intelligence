import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEOVIA Intelligence",
  description: "Interní nástroj pro obchodní příležitosti a kapacity.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
