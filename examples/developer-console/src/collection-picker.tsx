import { useState } from "react";
import { DatasetBrowser } from "@cyberwave/react";

/** Shared example composition: a named catalog first, with direct IDs as an escape hatch. */
export function CollectionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: { uuid: string; name?: string };
  onChange: (value: { uuid: string; name?: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(!value.uuid);
  const [directId, setDirectId] = useState("");
  function choose(next: typeof value) {
    onChange(next);
    setOpen(false);
    setDirectId("");
  }
  return (
    <section aria-label="Choose dataset">
      {value.uuid && (
        <>
          <p>
            <strong>{value.name || "Selected collection"}</strong>
            <br />
            <small className="cw-sample-id">{value.uuid}</small>
          </p>
          <button
            type="button"
            className="cw-button"
            disabled={disabled}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide datasets" : "Change dataset"}
          </button>
        </>
      )}
      {open && (
        <>
          <DatasetBrowser
            collectionsOnly
            selectedId={value.uuid}
            disabled={disabled}
            onSelect={(dataset) =>
              choose({
                uuid: dataset.uuid,
                name: dataset.name || "Unnamed collection",
              })
            }
          />
          <details>
            <summary>Open a dataset by UUID</summary>
            <label className="cw-catalog-filter">
              Dataset UUID
              <input
                value={directId}
                disabled={disabled}
                onChange={(event) => setDirectId(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="cw-button"
              disabled={disabled || !directId.trim()}
              onClick={() => choose({ uuid: directId.trim() })}
            >
              Open collection
            </button>
          </details>
        </>
      )}
    </section>
  );
}
