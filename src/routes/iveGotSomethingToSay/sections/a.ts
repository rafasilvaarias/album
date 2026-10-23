import { BAR, type SectionHandler } from "$lib/engine";
import type { Tracks } from "../tracks";
import type { Plan, SectionName } from "../plan";

// maximalist
export const a: SectionHandler<Tracks, SectionName, Plan> = ({ s, sched, plan, rng }) => {
  plan.aStructure.forEach((section, index) => {
    const sectionName = index + 1;
    sched.seq(s.start + section.start, "kick", sectionName);
    sched.seq(s.start + section.start, "snare", sectionName);
    sched.seq(s.start + section.start, "hiHat", sectionName);
    console.log(`Scheduled section ${sectionName} at ${s.start + section.start}`);

    if (section.name == "transition") {
      for (let i = s.start + section.start; i < s.start + section.end; i++) {
        sched.seq(i, "voice", "b");
      }
      sched.fadeIn("voice", s.start + section.start, section.end - section.start);
      sched.seq(s.start + section.end, "voice", "off");
    }
  });

  plan.pad.forEach((change, index) => {
    sched.seq(s.start + change.time, "pad", change.metaSequence);
  });
  sched.seq(s.end, "kick", 0);
  sched.seq(s.end, "snare", 0);
  sched.seq(s.end, "hiHat", 0);
  sched.seq(s.end, "pad", 0);
};
