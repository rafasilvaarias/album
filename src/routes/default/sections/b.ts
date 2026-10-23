import { BAR, type SectionHandler } from "$lib/engine";
import type { Tracks } from "../tracks";
import type { Plan, SectionName } from "../plan";

//minimalist
export const b: SectionHandler<Tracks, SectionName, Plan> = ({ s, rng, sched }) => {
  sched.seq(s.start, "kick", "b");
  sched.fadeIn("snare", s.start, BAR, "b");
};
