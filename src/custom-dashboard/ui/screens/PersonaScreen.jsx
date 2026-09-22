"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../api";
import Icon from "../components/common/Icon";
import StepDots from "../components/common/StepDots";
import { useSessionStore } from "../store/useSessionStore";
import { DASHBOARDS } from "../lib/routes";

export default function PersonaScreen() {
  const router = useRouter();
  const { userName, setUserName, persona, setPersona } = useSessionStore();
  const [personas, setPersonas] = useState([]);
  // Coming back to change role starts from the current one.
  const [selected, setSelected] = useState(persona || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .personas()
      .then((r) => setPersonas(r.personas || []))
      .catch(() => setPersonas([]));
  }, []);

  async function choose(personaId) {
    setBusy(true);
    try {
      await api.selectPersona(personaId);
      setPersona(personaId);
      router.push(DASHBOARDS);
    } finally {
      setBusy(false);
    }
  }

  const nameOk = userName.trim().length > 0;

  return (
    <div className="persona">
      <div className="persona__inner">
        <StepDots count={3} active={0} />

        <h1 className="persona__title">Before we begin, tell us a bit about you</h1>
        <p className="persona__sub">
          We&apos;ll tailor your dashboard experience and suggest the most
          <br />
          relevant report widgets for your role.
        </p>

        <div className="persona__namerow">
          <label className="persona__namelabel" htmlFor="cd-name">
            What should we call you?
          </label>
          <input
            id="cd-name"
            className="persona__name"
            value={userName}
            placeholder="Your name"
            onChange={(e) => setUserName(e.target.value.slice(0, 24))}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
            autoFocus
          />
        </div>

        <div className="persona__grid">
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`persona-card${selected === p.id ? " persona-card--on" : ""}`}
              onClick={() => setSelected(p.id)}
              aria-pressed={selected === p.id}
            >
              <span className="persona-card__icon">
                <Icon name={p.icon} size={18} />
              </span>
              <span className="persona-card__title">{p.title}</span>
              <span className="persona-card__desc">{p.description}</span>
            </button>
          ))}
        </div>

        <div className="persona__actions">
          <button
            className="btn btn--link"
            disabled={busy || !nameOk}
            onClick={() => choose(null)}
          >
            Skip
          </button>
          <button
            className="btn btn--solid"
            disabled={!selected || busy || !nameOk}
            onClick={() => choose(selected)}
          >
            {busy ? "Setting up…" : "Next"} <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
