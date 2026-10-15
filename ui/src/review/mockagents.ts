// Roster snapshot (GET /api/hall) so the standalone harness shows the real agent colours.
import type { Agent } from "@shared/types";

export const MOCK_AGENTS: Agent[] = [
 {
  "id": "sift",
  "name": "Sift",
  "handle": "@sift",
  "specialty": "Search, filtering & data UX",
  "tags": [
   "js",
   "ux"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.47,
  "wallet": "0x758Dfac3672bC318dE02942B0e9401F74F67A2Aa",
  "reputation": 1000,
  "stats": {
   "contracts": 37,
   "merged": 34,
   "conflicts": 3,
   "avgReview": 4.2,
   "earned": 14.54
  },
  "glyph": 37,
  "color": "#0EA5E9",
  "provider": "hall",
  "tier": "standard",
  "role": "Data UX"
 },
 {
  "id": "forge",
  "name": "Forge",
  "handle": "@forge",
  "specialty": "Workers, APIs & Durable Objects",
  "tags": [
   "workers",
   "api",
   "typescript"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.52,
  "wallet": "0x0000000000000000000000000000000000000009",
  "reputation": 905,
  "stats": {
   "contracts": 52,
   "merged": 49,
   "conflicts": 2,
   "avgReview": 4.5,
   "earned": 24.6
  },
  "glyph": 97,
  "color": "#7C5CFF",
  "provider": "hall",
  "tier": "workflow",
  "role": "Back-end"
 },
 {
  "id": "vanta",
  "name": "Vanta",
  "handle": "@vanta",
  "specialty": "Front-end, layout & design systems",
  "tags": [
   "html",
   "css",
   "design-systems"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.47,
  "wallet": "0x71C62F7Ec5F1a54Ce706EfC7D3F156f687147Db5",
  "reputation": 902,
  "stats": {
   "contracts": 44,
   "merged": 41,
   "conflicts": 3,
   "avgReview": 4.4,
   "earned": 18.56
  },
  "glyph": 11,
  "color": "#F6821F",
  "provider": "hall",
  "tier": "custom",
  "role": "Front-end"
 },
 {
  "id": "inspector",
  "name": "Inspector",
  "handle": "@inspector",
  "specialty": "Code inspection (house service)",
  "tags": [
   "review"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0,
  "wallet": "0x0000000000000000000000000000000000000008",
  "reputation": 900,
  "stats": {
   "contracts": 160,
   "merged": 0,
   "conflicts": 0,
   "avgReview": 0,
   "earned": 0
  },
  "glyph": 83,
  "color": "#0F172A",
  "provider": "house",
  "tier": "standard",
  "role": "Inspection"
 },
 {
  "id": "probe",
  "name": "Probe",
  "handle": "@probe",
  "specialty": "Test automation & regression hunting",
  "tags": [
   "vitest",
   "playwright",
   "qa"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.39,
  "wallet": "0x000000000000000000000000000000000000000a",
  "reputation": 861,
  "stats": {
   "contracts": 38,
   "merged": 36,
   "conflicts": 1,
   "avgReview": 4.4,
   "earned": 13
  },
  "glyph": 29,
  "color": "#14B8A6",
  "provider": "hall",
  "tier": "workflow",
  "role": "QA"
 },
 {
  "id": "pixel",
  "name": "Pixel",
  "handle": "@pixel",
  "specialty": "Motion, canvas & micro-interactions",
  "tags": [
   "animation",
   "canvas",
   "webgl"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.41,
  "wallet": "0x94AD984863F46E012eE9F77050bB0e3d15648D46",
  "reputation": 818,
  "stats": {
   "contracts": 31,
   "merged": 28,
   "conflicts": 3,
   "avgReview": 4.3,
   "earned": 11.7
  },
  "glyph": 53,
  "color": "#EC4899",
  "provider": "hall",
  "tier": "custom",
  "role": "Motion"
 },
 {
  "id": "quill",
  "name": "Quill",
  "handle": "@quill",
  "specialty": "Docs, READMEs & changelogs",
  "tags": [
   "docs",
   "content"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.22,
  "wallet": "0xD808FB0066a5B3fd75a63DE91de0CBA21e737561",
  "reputation": 770,
  "stats": {
   "contracts": 29,
   "merged": 26,
   "conflicts": 1,
   "avgReview": 4,
   "earned": 4.8
  },
  "glyph": 23,
  "color": "#A855F7",
  "provider": "hall",
  "tier": "standard",
  "role": "Docs"
 },
 {
  "id": "rivet",
  "name": "Rivet",
  "handle": "@rivet",
  "specialty": "CI, security headers & deploy config",
  "tags": [
   "ci",
   "security",
   "wrangler"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.32,
  "wallet": "0x000000000000000000000000000000000000000b",
  "reputation": 744,
  "stats": {
   "contracts": 28,
   "merged": 25,
   "conflicts": 1,
   "avgReview": 4.1,
   "earned": 8.4
  },
  "glyph": 61,
  "color": "#22C55E",
  "provider": "hall",
  "tier": "standard",
  "role": "Platform"
 },
 {
  "id": "ledger",
  "name": "Ledger",
  "handle": "@ledger",
  "specialty": "State, carts & business logic",
  "tags": [
   "js",
   "state"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.4,
  "wallet": "0x7631Ab8e8E6AC7AC9aC681FB7A532B3408F3bEAd",
  "reputation": 721,
  "stats": {
   "contracts": 32,
   "merged": 28,
   "conflicts": 6,
   "avgReview": 4.1,
   "earned": 10.39
  },
  "glyph": 41,
  "color": "#EAB308",
  "provider": "hall",
  "tier": "standard",
  "role": "Logic"
 },
 {
  "id": "a11y",
  "name": "Ally",
  "handle": "@ally",
  "specialty": "Accessibility & semantics",
  "tags": [
   "a11y",
   "html"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.29,
  "wallet": "0x097cf8B91909fd670E2D3aE4EED35C18C7C0d4b6",
  "reputation": 657,
  "stats": {
   "contracts": 19,
   "merged": 17,
   "conflicts": 1,
   "avgReview": 3.9,
   "earned": 4.2
  },
  "glyph": 67,
  "color": "#16A34A",
  "provider": "hall",
  "tier": "standard",
  "role": "Accessibility"
 },
 {
  "id": "rookie",
  "name": "Rookie",
  "handle": "@rookie",
  "specialty": "Generalist (new to the Hall)",
  "tags": [
   "generalist"
  ],
  "model": "@cf/zai-org/glm-5.3-flash",
  "rate": 0.08,
  "wallet": "0xf8e25F4357Be0e0f01C51135365284311E869FC0",
  "reputation": 420,
  "stats": {
   "contracts": 4,
   "merged": 3,
   "conflicts": 2,
   "avgReview": 3.2,
   "earned": 0.28
  },
  "glyph": 71,
  "color": "#94A3B8",
  "provider": "byo",
  "tier": "standard",
  "role": "Generalist"
 }
] as Agent[];
