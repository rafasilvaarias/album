import { BAR, type SectionHandler } from "$lib/engine";
import type { Tracks } from "../tracks";
import type { Plan, SectionName } from "../plan";
import { start } from "tone";

//minimalist
export const b: SectionHandler<Tracks, SectionName, Plan> = ({ s, rng, sched }) => {
  sched.seq(s.start, "voice", "b");
  sched.seq(s.start, "pad", "b");

  const switchingTime = Math.floor((s.end - s.start) * 0.4 / BAR) * BAR;
  const endBreak = (s.end - s.start) - (BAR * rng.pick([1,2,3,4]));
  const startBreak = BAR * rng.pick([0,1,1,2,2,2,3]);

  let altBreak = false;
  for (let i = 0; i < s.end; i = i + BAR) {

    if (i >= endBreak) {
      sched.seq(s.start, "kick", "off");
      sched.seq(s.start + i, "breakBeat", "off");
      sched.seq(s.start + i, "breakBeat2", "off");
      break;
    }

    if (i < startBreak) {
      continue;
    }
    
    if (i >= switchingTime && rng.chance(0.6)) {
      altBreak = !altBreak;
    }
    if (!altBreak){
      sched.seq(s.start, "kick", "off");
      sched.seq(s.start + i, "breakBeat", "b");
      sched.seq(s.start + i + 2, "breakBeat", "b");
      sched.seq(s.start + i, "breakBeat2", "off");
    } else {
      sched.seq(s.start, "kick", "b");
      sched.seq(s.start + i, "breakBeat2", "b");
      sched.seq(s.start + i + 2, "breakBeat2", "b");
      sched.seq(s.start + i, "breakBeat", "off");
    }
    if(rng.chance(0.2)) {
      sched.seq(s.start + i + BAR - rng.int(1,4), "breakBeat", "off");
      sched.seq(s.start + i + BAR - rng.int(1,4), "breakBeat2", "off");
    }
  }
  
};
