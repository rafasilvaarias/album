import { BAR, type SectionHandler } from "$lib/engine";
import type { Tracks } from "../tracks";
import type { Plan, SectionName } from "../plan";

// maximalist
export const a: SectionHandler<Tracks, SectionName, Plan> = ({ s, sched, plan }) => {
  plan.aStructure.forEach((section, index) => {
    const sectionName = index + 1;
    sched.seq(s.start + section.start, "kick", sectionName);
    sched.seq(s.start + section.start, "snare", sectionName);
    console.log(`Scheduled section ${sectionName} at ${s.start + section.start}`);
  });
};
