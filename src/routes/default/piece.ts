import { definePiece } from "$lib/engine";
import { tracks } from "./tracks";
import { makePlan } from "./plan";
import { sections } from "./sections";

export const piece = definePiece({
  bpm: 142,
  subdivision: 2,
  tracks,
  plan: makePlan,

  compose({ rng, sched, plan }) {
    const { structure } = plan;

    structure.forEach((s, i) => sections[s.name]({ s, i, structure, rng, sched, plan }));

    sched.stopPoints(structure.map((s) => s.start));
    sched.end(structure[structure.length - 1].end);
  },
});
