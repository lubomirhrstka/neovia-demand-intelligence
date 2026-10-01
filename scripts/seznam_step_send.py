from pathlib import Path
p = Path("src/app/page.tsx")
t = p.read_text()
if "seznam/send" in t and "sendEndpoint" in t:
    print("send already applied")
    raise SystemExit(0)
old = """      const response = await fetch("/api/email/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...compose, attachments: composeAttachments, trackOpen }),
      });"""
new = """      const sendEndpoint = mailAccount === "seznam" ? "/api/email/seznam/send" : "/api/email/gmail/send";
      const response = await fetch(sendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...compose,
          attachments: composeAttachments,
          trackOpen: mailAccount === "gmail" ? trackOpen : false,
        }),
      });"""
if old not in t: raise SystemExit("MISSING send")
p.write_text(t.replace(old, new, 1))
print("send ok")
