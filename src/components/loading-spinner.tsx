import { Orbit } from "lucide-react";

export function LoadingSpinner() {
  return (
    <div aria-label="Caricamento in corso" aria-live="polite" className="loading-indicator" role="status">
      <Orbit aria-hidden="true" className="loading-spinner" size={36} />
    </div>
  );
}
