"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { goTo } from "@/lib/app-helpers";

export function Pool({ note }: { note: (s: string) => void }) {
  const [rows, setRows] = useState<
      {
        id: string;
        name: string;
        role: string;
        skills: string[];
        location: string | null;
        availability: string | null;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [confirmingDelete, setConfirmingDelete] = useState(false),
    [form, setForm] = useState({
      name: "",
      role: "",
      skills: "",
      location: "",
      availability: "",
    });
  const load = () =>
    fetch("/api/capacities")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows);
  useEffect(() => {
    load();
  }, []);
  const openEdit = (c: { id: string; name: string; role: string; skills: string[]; location: string | null; availability: string | null }) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      role: c.role,
      skills: c.skills.join(", "),
      location: c.location || "",
      availability: c.availability || "",
    });
    setOpen(true);
  };
  const deleteCapacity = async (id: string) => {
    const r = await fetch("/api/capacities", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) {
      note("Kapacitu se nepodařilo odstranit.");
      return;
    }
    setOpen(false);
    setConfirmingDelete(false);
    load();
    note("Kapacita byla odstraněna.");
  };
  const save = async () => {
    const r = await fetch("/api/capacities", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    });
    if (!r.ok) {
      note("Doplňte jméno a roli kapacity.");
      return;
    }
    setOpen(false);
    setEditingId(null);
    setForm({ name: "", role: "", skills: "", location: "", availability: "" });
    load();
    note(editingId ? "Kapacita byla upravena." : "Kapacita byla uložena.");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>DOSTUPNÉ KAPACITY</p>
          <h1>Pool kapacit</h1>
          <small>
            Párujte skutečně evidované specialisty s obchodními příležitostmi.
          </small>
        </div>
        <button className="primary" onClick={() => { setEditingId(null); setForm({ name: "", role: "", skills: "", location: "", availability: "" }); setOpen(true); }}>
          <Plus size={17} />
          Přidat kapacitu
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="panel empty-state">
          Zatím není evidovaná žádná kapacita. Přidejte prvního specialistu.
        </div>
      ) : (
        <div className="pool">
          {rows.map((c) => (
            <article
              key={c.id}
              onClick={() => openEdit(c)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEdit(c);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <span className="avatar blue">
                  {c.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </span>
                <b>{c.availability || "Termín neuveden"}</b>
              </div>
              <h2>{c.name}</h2>
              <p>{c.role}</p>
              <section>
                {c.skills.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </section>
              <footer>
                <small>{c.location || "Lokalita neuvedena"}</small>
                <button onClick={(event) => { event.stopPropagation(); goTo("Poptávky"); }}>
                  Najít poptávky <ArrowUpRight size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {open && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header>
              <div>
                <p>{editingId ? "DETAIL KAPACITY" : "NOVÁ KAPACITA"}</p>
                <h2>{editingId ? form.name : "Specialista"}</h2>
              </div>
              <button type="button" onClick={() => { setOpen(false); setEditingId(null); }}>
                ×
              </button>
            </header>
            <div className="form-grid">
              {[
                ["name", "Jméno"],
                ["role", "Role"],
                ["skills", "Dovednosti, oddělené čárkou"],
                ["location", "Lokalita"],
                ["availability", "Dostupnost"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    required={key === "name" || key === "role"}
                    value={form[key as keyof typeof form]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => { setOpen(false); setEditingId(null); }}
              >
                Zrušit
              </button>
              {editingId && (
                <button type="button" className="icon danger" aria-label="Odstranit kapacitu" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={15} />
                </button>
              )}
              <button className="primary">{editingId ? "Uložit změny" : "Uložit kapacitu"}</button>
            </footer>
          </form>
        </div>
      )}
      {confirmingDelete && editingId && (
        <div className="modal-backdrop">
          <div className="modal delete-choice">
            <header>
              <div>
                <p>POOL KAPACIT</p>
                <h2>Odstranit „{form.name}"</h2>
              </div>
              <button type="button" onClick={() => setConfirmingDelete(false)}>×</button>
            </header>
            <p className="merge-hint">
              <b>Tuto akci nelze vrátit zpět.</b> Kapacita bude trvale odstraněna.
            </p>
            <footer>
              <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>Zrušit</button>
              <button type="button" className="danger" onClick={() => deleteCapacity(editingId)}>
                Ano, odstranit
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
