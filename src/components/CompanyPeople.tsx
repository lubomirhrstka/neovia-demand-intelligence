"use client";

import type { ActivityRecord, Contact } from "@/lib/app-types";
import styles from "./CrmCardExtras.module.css";

export function CompanyPeople({
  contacts,
  activities,
  roleLabels,
  onOpen,
  onAdd,
}: {
  contacts: Contact[];
  activities: ActivityRecord[];
  roleLabels: Record<string, string>;
  onOpen: (contact: Contact) => void;
  onAdd: () => void;
}) {
  const lastByContact = (id: string) =>
    activities
      .filter((a) => a.contactId === id)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];

  return (
    <section className={styles.people} aria-label="Kontakty firmy">
      <div className={styles.peopleHead}>
        <h3>Lidé ve firmě</h3>
        <button type="button" onClick={onAdd}>
          Přidat kontakt
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className={styles.empty}>Firma zatím nemá navázaný kontakt.</p>
      ) : (
        <ul>
          {contacts.map((c) => {
            const last = lastByContact(c.id);
            const role = (c.buyingRole && roleLabels[c.buyingRole]) || c.role;
            return (
              <li key={c.id}>
                <button type="button" className={styles.person} onClick={() => onOpen(c)}>
                  <span className={styles.avatar}>
                    {c.name
                      .split(" ")
                      .filter(Boolean)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "K"}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {c.buyingRole && roleLabels[c.buyingRole] ? (
                        <span className={styles.role}>{roleLabels[c.buyingRole]}</span>
                      ) : null}
                      {role && !c.buyingRole ? `${role} · ` : " "}
                      {c.email !== "—" ? c.email : "bez e-mailu"}
                    </small>
                    <small className={styles.last}>
                      {last
                        ? `Poslední kontakt ${new Date(last.occurredAt).toLocaleDateString("cs-CZ")} · ${last.subject}`
                        : "Zatím bez zaznamenaného kontaktu"}
                    </small>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
