import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import BuilderScreen from "./screens/BuilderScreen";
import PersonaScreen from "./screens/PersonaScreen";
import { useSessionStore } from "./store/useSessionStore";

export default function App() {
  const { ready, hydrate, persona } = useSessionStore();

  useEffect(() => {
    api
      .config()
      .then(hydrate)
      .catch(() => hydrate({}));  
  }, [hydrate]);

  if (!ready) {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Persona selection is the entry point — there is no landing screen. */}
      <Route path="/" element={<PersonaScreen />} />
      <Route path="/persona" element={<Navigate to="/" replace />} />
      <Route
        path="/build"
        element={
 
          persona === undefined ? <Navigate to="/" replace /> : <BuilderScreen />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
