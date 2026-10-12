"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { Dataset, MLModel } from "cyberwave";
import { useCyberwave } from "./index.js";
import { useResource, useResourceKey } from "./resource.js";

type Selection<T> = {
  selectedId?: string;
  onSelect: (item: T) => void;
  disabled?: boolean;
};
type Page<T> = { items: T[]; hasMore: boolean };
const pageSize = 12;

/** These APIs paginate, but do not advertise server-side name search. */
function Catalog<T extends { uuid: string; name?: string | null }>({
  label,
  load,
  describe,
  selectionReason,
  selectedId,
  onSelect,
  disabled = false,
}: Selection<T> & {
  label: string;
  load: (offset: number, signal: AbortSignal) => Promise<Page<T>>;
  describe: (item: T) => ReactNode;
  selectionReason?: (item: T) => string | undefined;
}) {
  const [offset, setOffset] = useState(0),
    [filter, setFilter] = useState(""),
    [refresh, setRefresh] = useState(0);
  const state = useResource(
    useMemo(
      () => (signal: AbortSignal) => load(offset, signal),
      [load, offset, refresh],
    ),
  );
  const items = state.data?.items.filter((item) =>
    `${item.name || ""} ${item.uuid}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  return (
    <section className="cw-browser cw-data-catalog" aria-label={label}>
      <div className="cw-sensor-heading">
        <h3>{label}</h3>
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading}
          onClick={() => setRefresh(refresh + 1)}
        >
          Refresh {label.toLowerCase()}
        </button>
      </div>
      <label className="cw-catalog-filter">
        Filter this page by name or UUID
        <input
          type="search"
          value={filter}
          disabled={disabled}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <p className="cw-muted">
        Browse by name. The filter applies to this page; use Next to explore
        more.
      </p>
      {state.loading && <p role="status">Loading {label.toLowerCase()}…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      <div className="cw-resource-list">
        {items?.map((item) => {
          const reason = selectionReason?.(item);
          return (
            <button
              type="button"
              className={`cw-resource ${selectedId === item.uuid ? "cw-selected" : ""}`}
              key={item.uuid}
              aria-pressed={selectedId === item.uuid}
              disabled={disabled || !!reason}
              onClick={() => onSelect(item)}
            >
              <span>
                <strong>{item.name || "Unnamed dataset"}</strong>
                {describe(item)}
                <small className="cw-sample-id">{item.uuid}</small>
                {reason && <small>{reason}</small>}
              </span>
            </button>
          );
        })}
      </div>
      {items?.length === 0 && (
        <p role="status">
          {filter.trim()
            ? "No matching names on this page. Clear the filter or browse another page."
            : `No ${label.toLowerCase()} on this page.`}
        </p>
      )}
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - pageSize))}
        >
          Previous {label.toLowerCase()}
        </button>
        <span>Page {offset / pageSize + 1}</span>
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading || !state.data?.hasMore}
          onClick={() => setOffset(offset + pageSize)}
        >
          Next {label.toLowerCase()}
        </button>
      </div>
    </section>
  );
}

/** Browse visible datasets; optionally allow selection only of media collections. */
export function DatasetBrowser(
  props: Selection<Dataset> & { collectionsOnly?: boolean },
) {
  const client = useCyberwave();
  const key = useResourceKey(client, props.collectionsOnly);
  const load = useMemo(
    () => async (offset: number, signal: AbortSignal) => {
      const page = await client.datasets.list(
        { limit: pageSize, offset },
        { signal },
      );
      return { items: page.datasets, hasMore: page.has_more };
    },
    [client],
  );
  return (
    <Catalog
      key={key}
      {...props}
      label="Datasets"
      load={load}
      describe={(dataset) => (
        <small>
          {dataset.metadata?.sample_collection === true
            ? "Media collection"
            : "Episode dataset"}{" "}
          · {dataset.visibility}
        </small>
      )}
      selectionReason={(dataset) =>
        props.collectionsOnly && dataset.metadata?.sample_collection !== true
          ? "Select a media collection to review image samples."
          : undefined
      }
    />
  );
}

/** Model discovery uses server declarations, never a provider-name allowlist. */
export function ModelBrowser(props: Selection<MLModel>) {
  const client = useCyberwave();
  const key = useResourceKey(client);
  const load = useMemo(
    () => async (offset: number, signal: AbortSignal) => {
      const items = await client.mlmodels.list(
        { limit: pageSize + 1, offset },
        { signal },
      );
      return {
        items: items.slice(0, pageSize),
        hasMore: items.length > pageSize,
      };
    },
    [client],
  );
  return (
    <Catalog
      key={key}
      {...props}
      label="Models"
      load={load}
      describe={(model) => (
        <>
          <small>
            {model.model_provider_name} · {model.deployment}
          </small>
          <small>
            {modelInputTypes(model).join(" · ") || "Inputs not declared"}
          </small>
          {model.inference_issue && <small>{model.inference_issue}</small>}
        </>
      )}
    />
  );
}

/** io_schema takes precedence over legacy modality flags, matching the backend. */
export function modelInputTypes(model: MLModel): string[] {
  if (model.io_schema)
    return [
      ...new Set((model.io_schema.inputs || []).map((input) => input.type)),
    ];
  return (["text", "image", "audio", "video", "action"] as const).filter(
    (type) => model[`can_take_${type}_as_input`],
  );
}

/** Present backend-owned requirements without inferring a transport from task metadata. */
export function ModelInputSummary({ model }: { model: MLModel }) {
  const requirements = (model.required_inputs || []).map((input) =>
    typeof input === "string"
      ? input
      : Array.isArray(input) &&
          input.every((value) => typeof value === "string")
        ? `One of: ${input.join(" / ")}`
        : "Unrecognized input requirement",
  );
  return (
    <section className="cw-model-inputs" aria-label="Model input contract">
      <h3>{model.name}</h3>
      <p className="cw-muted">
        Accepted inputs: {modelInputTypes(model).join(", ") || "not declared"}
      </p>
      {model.io_schema ? (
        <>
          <ul>
            {model.io_schema.inputs?.map((input) => (
              <li key={input.name}>
                <code>{input.name}</code> · {input.type} ·{" "}
                {input.required ? "required" : "optional"}
              </li>
            ))}
          </ul>
          {model.io_schema.semantic_issues?.map((issue, index) => (
            <p role="alert" key={index}>
              {issue}
            </p>
          ))}
        </>
      ) : (
        requirements.length > 0 && (
          <p className="cw-muted">
            Model input requirements: {requirements.join("; ")}. A structured
            task can supply its own prompt template.
          </p>
        )
      )}
      {model.inference_issue && (
        <p role="alert" className="cw-error">
          {model.inference_issue}
        </p>
      )}
    </section>
  );
}
