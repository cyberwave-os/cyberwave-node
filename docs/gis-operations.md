# From an asset map to activity results

This guide describes the current SDK branch, before npm publication. Start the developer console using the [repository setup](../README.md).

- [18 · Asset operations](http://127.0.0.1:5173/asset-operations.html): invented sites, inspection rounds, thermal observations and repair verification. Search the asset register, select a map marker, choose an activity and inspect/export results. All values and diagrams are synthetic; nothing is written to Cyberwave.
- [19 · Inspection atlas](http://127.0.0.1:5173/inspection-atlas.html): authenticated environment → stored campaigns → observations → review history and supporting recordings. This uses the selected API and does not mix sample records into its responses.

These pages share the existing connection header. For example 19, select your API, authenticate, and choose an environment with inspection campaigns. The development gateway allows inspection writes only against authenticated local APIs; this atlas only reads. No map selection dispatches a command.

## Reuse existing records

| Information | Source of truth | UI projection |
| --- | --- | --- |
| Site and equipment | Environment, twins, or your asset register | `MapLocation`, `EnvironmentBrowser` |
| Planned work and execution | Configured workflow, triggers, WorkflowExecution and node outputs | Existing planner/monitor; map an output into `ActivityResult` |
| Normal gauge/temperature/level checks | Workflow node output (`output_data`), source units and acquisition metadata | `ActivityResults`, `MeasurementCard` |
| Persistent finding and assessment | Inspection campaign, observation, defect and review revisions | `InspectionCampaignBrowser`, `InspectionObservationList`, `InspectionObservationDetails` |
| Images, audio and video | Authorized media service, Attachment, recording or Dataset sample | `EvidencePreview`, `RecordingPlaybackPanel` |
| Work orders and acceptance | Your maintenance system and its authenticated callbacks | Host-owned status and links; existing verification component |

`ActivityResult` and `MapLocation` are display types, not new backend tables. Adapt the output of the selected workflow node or your existing asset system. There is no universal gauge-result schema: keep the source reference, timestamp, method, unit, assessment and limitations. The components display the supplied assessment; they do not infer a safe operating condition from a number. Normal readings do not need to become persistent defects.

Completion of a workflow does not prove that every measurement was acquired. Work-order completion does not verify technical resolution. A finding outside delivered coverage is not a resolved finding. Keep these distinctions when composing the components.

## Compose a result detail

```tsx
import { useState } from 'react';
import {
  ActivityResults, MeasurementCard, EvidencePreview, type ActivityResult,
} from '@cyberwave/react';
import '@cyberwave/react/styles.css';

function Results({ results, evidenceUrl }: {
  results: ActivityResult[];
  // Your host resolves an authorized URL for this source reference.
  evidenceUrl: (result: ActivityResult) => string | undefined;
}) {
  const [selectedId, select] = useState<string>();
  const selected = results.find(result => result.id === selectedId);
  return <>
    <ActivityResults results={results} selectedId={selectedId}
      onSelect={result => select(result.id)} />
    {selected && <MeasurementCard result={selected}>
      <EvidencePreview src={evidenceUrl(selected)} caption={selected.title} />
    </MeasurementCard>}
  </>;
}
```

Zero is a valid measurement. A missing unit stays explicit; an unavailable result does not display a stale numeric value. Categorical results can omit `value` and use `method`/`limitation` for context. `expectedRange` is a host-supplied range, not an automatically applied threshold. Set a React key for the selected activity if filters should reset between activities.

`EvidencePreview` supports `kind="image"`, `"video"` or `"audio"`, with native media controls and explicit missing/error states. Pass a same-origin application path, authorized HTTP(S) URL or browser blob URL. Do not turn opaque evidence IDs into storage paths or inject API credentials into third-party URLs. Refresh expiring URLs through your host. Persist stable source IDs, not temporary signed URLs. Annotation and dataset handoff reuse [the existing capture flow](custom-ui.md).

## Add the optional map

Install `cesium` (the example pins 1.146.0), import the optional entry and styles, and serve Cesium's `Workers`, `ThirdParty`, `Assets` and `Widgets` folders. Set `CESIUM_BASE_URL` to that served directory before the viewer mounts. Reuse the [working Vite configuration](../examples/developer-console/vite.config.mjs) and adapt its paths to your deployment's base path. The ordinary `@cyberwave/react` entry does not load Cesium.

```tsx
import { useMemo } from 'react';
import { LocationMap } from '@cyberwave/react/gis';
import { environmentMapLocation, type Environment } from 'cyberwave';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@cyberwave/react/styles.css';

function SiteMap({ environments, selectedId, select }: {
  environments: Environment[];
  selectedId?: string;
  select: (id: string) => void;
}) {
  const locations = useMemo(() => environments.flatMap(environment => {
    const point = environmentMapLocation(environment);
    return point ? [point] : [];
  }), [environments]);
  return <LocationMap locations={locations} selectedId={selectedId} onSelect={select} />;
}
```

Keep the locations array and optional `imageryProvider` factory stable when the underlying data is unchanged, to avoid unnecessary map fitting or viewer recreation. IDs must be unique. A custom asset register can supply `MapLocation` directly with explicit WGS84 longitude/latitude. Invalid/non-finite coordinates are omitted with a count; the application should also retain an accessible list of unmapped resources.

By default the map uses a local grid and sends no tile requests. The synthetic asset demo explicitly selects OpenStreetMap. A connected application must choose its own approved provider, attribution and tile policy. Supply a stable factory returning a Cesium `ImageryProvider`; consult the [Cesium imagery provider reference](https://cesium.com/learn/cesiumjs/ref-doc/OpenStreetMapImageryProvider.html). A basemap failure leaves the location list usable. This component adds no geocoder, terrain model, flight controller or command channel.

`environmentMapLocation` reads only the existing `settings.geo` contract: version 1, server-confirmed `manual` anchor, valid numeric coordinates and the backend's latitude range. It projects the **2D site origin**; it does not validate altitude/heading or perform world-to-local conversion. Cloned `unverified` anchors remain unmapped. List endpoints may omit settings: fetch `client.environments.get(id)` before projecting, as the atlas does.

Update an anchor using the existing dedicated `PATCH /api/v1/environments/{uuid}/geo-settings` API, with permissions and server validation. Do not replace all environment settings or infer geographic coordinates from local XY or chainage. A site marker is not an observation's position. Linear assets still need an explicit surveyed reference/alignment and reference version before locating individual findings on Earth.

## Browse inspection history and recordings

Wrap the connected components in `CyberwaveProvider`. `InspectionCampaignBrowser` pages campaigns for an `environmentId`; `useInspectionCampaign(environmentId, campaignId)` loads the selected detail with cancellation. Compose `InspectionObservationList` and `InspectionObservationDetails` with host-owned selection. Reset campaign and observation IDs when changing environment or account; the resource hooks discard stale responses and the browsers reset pagination when their client/resource changes.

Observation details keep source evidence separate from the latest review (ordered by revision), show uncertainty, model provenance and review history, and preserve missing coverage. For mutation/reconciliation reuse the existing `InspectionVerificationPanel` and [maintenance examples](../examples/developer-console/MAINTENANCE.md).

`RecordingPlaybackPanel` combines the existing playback hook, finalized-track parser and `RecordingVideo`. Pair it with `RecordingBrowser` and supply `environmentUuid`, `recording`, and optionally a synchronous `resolveUrl` for your authorized media proxy. It handles HTTP 202 materialization, track selection, source refresh, media errors and missing MP4 tracks. Changing API, environment, recording or URL resolver removes old media. Keep the resolver stable.

The atlas's supporting-recording picker is an explicit browse action; it does not claim the selected recording belongs to that finding. It does not persist an association. Missing media remain missing. Precise video/robot synchronization needs source clocks/SEI and existing replay adapters; the displayed cursor is media-relative seconds.

## Scenario boundaries

- **Industrial inspection:** render gauge, level, temperature and acoustic checks with declared units; retain unknown units and failed acquisition. Use persistent inspection records only for findings that need condition history/review.
- **Materials handling:** a thermal hotspot calls for source-specific interpretation and review. A visible-light image alone cannot establish hidden combustion or stockpile volume. Volume needs a calibrated depth survey and a reference surface; those estimators are not implemented here.
- **Maintenance:** navigate from results to planning or verification. JSON exports and local proposal checks neither reserve resources nor submit a work order.
- **Logistics/manufacturing:** reuse the same result views for a conveyor check, delivery acknowledgment or machine activity. Link to your authoritative execution/work-order IDs.

No new backend model or endpoint is required for these browsing components. Further work should extend existing source adapters, geo contracts, workflow outputs and media resolution only where a real integration supplies the needed data. Example sources: [asset operations](../examples/developer-console/src/asset-operations.tsx), [inspection atlas](../examples/developer-console/src/inspection-atlas.tsx).
