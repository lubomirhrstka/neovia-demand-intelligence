from pathlib import Path
p = Path("src/app/page.tsx")
t = p.read_text()
old = 'note(data.trackingId ? `E-mail byl odeslaný. Tracking ID: ${data.trackingId}` : "E-mail byl odeslaný přes připojený Gmail účet.");'
new = 'note(data.trackingId ? `E-mail byl odeslaný. Tracking ID: ${data.trackingId}` : mailAccount === "seznam" ? "E-mail byl odeslaný přes Seznam.cz SMTP." : "E-mail byl odeslaný přes připojený Gmail účet.");'
if old not in t: raise SystemExit("MISSING note")
t = t.replace(old, new, 1)
old2 = """      if (status?.connected && !["review", "followups"].includes(folder)) {
        fetch(`/api/email/gmail/folders?folder=${encodeURIComponent(folder)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => data && setMailData(data))
          .catch(() => undefined);
      }"""
new2 = """      if (!["review", "followups"].includes(folder)) {
        const foldersEndpoint = mailAccount === "seznam" ? "/api/email/seznam/folders" : "/api/email/gmail/folders";
        if ((mailAccount === "gmail" && status?.connected) || (mailAccount === "seznam" && seznamStatus?.connected)) {
          fetch(`${foldersEndpoint}?folder=${encodeURIComponent(folder)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => data && setMailData(data))
            .catch(() => undefined);
        }
      }"""
if old2 not in t: raise SystemExit("MISSING refresh")
p.write_text(t.replace(old2, new2, 1))
print("note_refresh ok")
