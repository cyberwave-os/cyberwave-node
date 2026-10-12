import type { ActivityResult } from "@cyberwave/react";
import type { MapLocation } from "cyberwave";
export type Activity = {
  id: string;
  name: string;
  status: string;
  date: string;
  results: ActivityResult[];
};
export type Site = MapLocation & { sector: string; activities: Activity[] };
/** Entirely invented sites, identifiers and values. No customer data. */
export const sites: Site[] = [
  {
    id: "water",
    label: "North water station",
    longitude: 12.48,
    latitude: 41.93,
    sector: "Water infrastructure",
    color: "#38bdf8",
    activities: [
      {
        id: "round",
        name: "Pump inspection round",
        status: "Completed",
        date: "2026-10-08T09:30:00Z",
        results: [
          {
            id: "pressure",
            title: "Discharge pressure",
            outcome: "attention",
            value: 8.4,
            unit: "bar",
            expectedRange: { min: 3, max: 7, unit: "bar" },
            capturedAt: "2026-10-08T09:34:00Z",
            method: "Illustrative gauge reading",
            sourceReference: "demo-round / pressure-node",
            limitation:
              "Synthetic result; the host supplies assessment and operating limits.",
          },
          {
            id: "temperature",
            title: "Motor temperature",
            outcome: "normal",
            value: 34,
            unit: "°C",
            expectedRange: { min: 10, max: 55, unit: "°C" },
            method: "Illustrative thermal reading",
            sourceReference: "demo-round / thermal-node",
          },
          {
            id: "acoustic",
            title: "Bearing acoustic check",
            outcome: "unavailable",
            method: "Acoustic inspection",
            limitation:
              "Audio was not delivered. A completed workflow does not prove every inspection succeeded.",
          },
        ],
      },
      {
        id: "repair",
        name: "Seal replacement",
        status: "Work completed · verification pending",
        date: "2026-10-10T14:00:00Z",
        results: [
          {
            id: "verify",
            title: "Post-intervention pressure check",
            outcome: "unavailable",
            limitation:
              "No follow-up measurement yet. Technical resolution remains unverified.",
          },
        ],
      },
    ],
  },
  {
    id: "storage",
    label: "East materials yard",
    longitude: 12.56,
    latitude: 41.91,
    sector: "Materials handling",
    color: "#eab86c",
    activities: [
      {
        id: "thermal",
        name: "Storage area thermal survey",
        status: "Review required",
        date: "2026-10-09T08:00:00Z",
        results: [
          {
            id: "hotspot",
            title: "Bay C thermal observation",
            outcome: "attention",
            value: 64,
            unit: "°C",
            method: "Illustrative surface temperature",
            limitation:
              "Thermal observation requires review; it is not confirmation of combustion. Emissivity and ambient conditions must accompany real data.",
          },
          {
            id: "volume",
            title: "Stockpile volume estimate",
            outcome: "unavailable",
            unit: "m³",
            method: "Survey comparison",
            limitation:
              "No calibrated depth survey or reference surface supplied. An RGB image alone does not establish volume.",
          },
        ],
      },
    ],
  },
  {
    id: "warehouse",
    label: "West logistics hub",
    longitude: 12.42,
    latitude: 41.88,
    sector: "Logistics",
    color: "#8bd4aa",
    activities: [
      {
        id: "conveyor",
        name: "Conveyor preventive check",
        status: "Completed",
        date: "2026-10-09T16:30:00Z",
        results: [
          {
            id: "level",
            title: "Lubricant reservoir level",
            outcome: "normal",
            value: 72,
            unit: "%",
            expectedRange: { min: 25, max: 90, unit: "%" },
            method: "Illustrative visual reading",
          },
          {
            id: "clearance",
            title: "Access aisle clearance",
            outcome: "normal",
            method: "Manual confirmation",
            limitation:
              "Human acknowledgement is a categorical result; no numeric measurement was supplied.",
          },
        ],
      },
    ],
  },
];
