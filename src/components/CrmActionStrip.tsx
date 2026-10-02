"use client";

import styles from "./CrmCardExtras.module.css";

export function CrmActionStrip({
  onActivity,
  onEmail,
  onBook,
  onOpportunity,
  opportunityLabel,
  doNotContact,
}: {
  onActivity: () => void;
  onEmail: () => void;
  onBook: () => void;
  onOpportunity: () => void;
  opportunityLabel: string;
  doNotContact?: boolean;
}) {
  return (
    <nav className={styles.actions} aria-label="Rychlé akce">
      <button type="button" onClick={onActivity}>
        Přidat aktivitu
      </button>
      <button type="button" onClick={onEmail} disabled={doNotContact}>
        Napsat e-mail
      </button>
      <button type="button" onClick={onBook}>
        Zkopírovat booking
      </button>
      <button type="button" className={styles.primary} onClick={onOpportunity}>
        {opportunityLabel}
      </button>
    </nav>
  );
}
