from pathlib import Path
import json
p = Path("src/app/page.tsx")
t = p.read_text()
feat_old = (
    "            ) : (\n"
    "              <>\n"
    "                <span>Zobrazuje doručené zprávy z připojené schránky přes IMAP.</span>\n"
    "                <span>LinkedIn alerty ze Seznamu lze následně vytěžit v sekci Zdroje.</span>\n"
    "                <span>Odesílání a mazání přes Seznam zatím není zapnuté \u2014 Gmail zůstává odesílací účet.</span>\n"
    "              </>\n"
    "            )}"
)
feat_new = (
    "            ) : (\n"
    "              <>\n"
    "                <span>Načítá Doručené, Odeslané, Koncepty, Spam a Koš přes IMAP.</span>\n"
    "                <span>Odesílání přes Seznam SMTP, mazání do koše a stažení příloh.</span>\n"
    "                <span>Ke kontrole a Follow-upy fungují stejně jako u Gmailu (lokální fronta).</span>\n"
    "                <span>LinkedIn alerty ze Seznamu lze vytěžit v sekci Zdroje.</span>\n"
    "              </>\n"
    "            )}"
)
if feat_old not in t: raise SystemExit("MISSING feat")
t = t.replace(feat_old, feat_new, 1)
old_att = """selectedEmail.attachments?.map((file) => selectedEmail.sourceAccount === "seznam" ? (
                        <span key={file.id} className="email-attachment-static">
                          {file.filename} <small>{Math.ceil((file.size || 0) / 1024)} KB</small>
                        </span>
                      ) : (
                        <a
                          key={file.id}
                          href={`/api/email/gmail/messages/${encodeURIComponent(selectedEmail.id)}/attachments/${encodeURIComponent(file.id)}?filename=${encodeURIComponent(file.filename)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.filename} <span>{Math.ceil((file.size || 0) / 1024)} KB</span>
                        </a>
                      ))"""
new_att = """selectedEmail.attachments?.map((file) => (
                        <a
                          key={file.id}
                          className="email-attachment-link"
                          href={
                            selectedEmail.sourceAccount === "seznam"
                              ? `/api/email/seznam/messages/${encodeURIComponent(selectedEmail.id)}/attachments/${encodeURIComponent(file.id)}?filename=${encodeURIComponent(file.filename)}`
                              : `/api/email/gmail/messages/${encodeURIComponent(selectedEmail.id)}/attachments/${encodeURIComponent(file.id)}?filename=${encodeURIComponent(file.filename)}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.filename} <span>{Math.ceil((file.size || 0) / 1024)} KB</span>
                        </a>
                      ))"""
if old_att not in t: raise SystemExit("MISSING att")
t = t.replace(old_att, new_att, 1)
old_sq = '{(mailAccount === "gmail" && (!status?.connected || ["review", "followups"].includes(folder))) && sampleQueue.map((item) => {'
new_sq = '{((mailAccount === "gmail" && (!status?.connected || ["review", "followups"].includes(folder))) || (mailAccount === "seznam" && ["review", "followups"].includes(folder))) && sampleQueue.map((item) => {'
if old_sq in t:
    t = t.replace(old_sq, new_sq, 1)
p.write_text(t)
pkg = Path("package.json")
d = json.loads(pkg.read_text())
d["version"] = "1.1.70"
pkg.write_text(json.dumps(d, indent=2) + "\n")
print("feat_att_sq ok", d["version"])
