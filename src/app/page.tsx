"use client";

import { useEffect } from "react";

/** Temporary shell — full page.tsx restore pending. */
export default function Home() {
  useEffect(() => {
    // Soft redirect hint for operators
    console.info("NEOVIA: full page restore in progress");
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 48, maxWidth: 520 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>NEOVIA Demand Intelligence</h1>
      <p style={{ color: "#445", lineHeight: 1.5 }}>
        Aplikace se právě obnovuje po údržbě. Za chvíli bude znovu plně dostupná.
      </p>
      <p style={{ marginTop: 16, fontSize: 13, color: "#889" }}>
        Public booking zůstává na <a href="/book">/book</a>.
      </p>
    </main>
  );
}
