#!/usr/bin/env python3
"""Apply Seznam full UI wiring to src/app/page.tsx"""
from pathlib import Path
import json
import sys

page = Path("src/app/page.tsx")
text = page.read_text()
if "seznam/send" in text and 'countFor("inbox")' in text:
    print("already applied")
    sys.exit(0)

replacements = []

def rep(old, new, name):
    global text
    if old not in text:
        print(f"MISSING: {name}")
        print(repr(old[:80]))
        sys.exit(1)
    text = text.replace(old, new, 1)
    replacements.append(name)

rep(
  """  const folders = mailAccount === \"gmail\"
    ? [
        { id: \"inbox\", label: \"Doručené\", count: countFor(\"INBOX\") },
        { id: \"sent\", label: \"Odeslané\", count: countFor(\"SENT\") },
        { id: \"drafts\", label: \"Koncepty\", count: countFor(\"DRAFT\") },
        { id: \"review\", label: \"Ke kontrole\", count: reviewItems.length },
        { id: \"followups\", label: \"Follow-upy\", count: followupItems.length },
        { id: \"archive\", label: \"Archiv\", count: countFor(\"CATEGORY_PERSONAL\") },
        { id: \"trash\", label: \"Koš\", count: countFor(\"TRASH\") },
      ]
    : [
        { id: \"inbox\", label: \"Doručené\", count: countFor(\"INBOX\") },
      ];""",
  """  const folders = mailAccount === \"gmail\"
    ? [
        { id: \"inbox\", label: \"Doručené\", count: countFor(\"INBOX\") },
        { id: \"sent\", label: \"Odeslané\", count: countFor(\"SENT\") },
        { id: \"drafts\", label: \"Koncepty\", count: countFor(\"DRAFT\") },
        { id: \"review\", label: \"Ke kontrole\", count: reviewItems.length },
        { id: \"followups\", label: \"Follow-upy\", count: followupItems.length },
        { id: \"archive\", label: \"Archiv\", count: countFor(\"CATEGORY_PERSONAL\") },
        { id: \"trash\", label: \"Koš\", count: countFor(\"TRASH\") },
      ]
    : [
        { id: \"inbox\", label: \"Doručené\", count: countFor(\"inbox\") || countFor(\"INBOX\") },
        { id: \"sent\", label: \"Odeslané\", count: countFor(\"sent\") },
        { id: \"drafts\", label: \"Koncepty\", count: countFor(\"drafts\") },
        { id: \"review\", label: \"Ke kontrole\", count: reviewItems.length },
        { id: \"followups\", label: \"Follow-upy\", count: followupItems.length },
        { id: \"spam\", label: \"Spam\", count: countFor(\"spam\") },
        { id: \"trash\", label: \"Koš\", count: countFor(\"trash\") },
      ];""",
  "folders",
)
