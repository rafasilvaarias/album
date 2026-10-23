import type { SectionHandler } from "$lib/engine";
import type { Tracks } from "../tracks";
import type { Plan, SectionName } from "../plan";
import { a } from "./a";
import { b } from "./b";

export const sections: Record<SectionName, SectionHandler<Tracks, SectionName, Plan>> = { A: a, B: b};
