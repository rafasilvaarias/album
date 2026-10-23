import * as Tone from 'tone';
import { positionToDb } from '$lib/globalFunctions';
import { EQ_RANGE, ISOLATOR_RANGE } from './constants';
import type { EqSettings, ParamName, TracksMap } from './types';

export type TrackNodes = {
  channel: Tone.Gain;
  panner?: Tone.Panner;
  eq3?: Tone.EQ3;
  reverbSend?: Tone.Gain;
};

export type AudioGraph = {
  masterEq: Tone.EQ3;
  nodes: Record<string, TrackNodes>;
  dispose(): void;
};

type AnyParam = {
  value: number;
  rampTo(v: number, t: number, start?: number): unknown;
  setValueAtTime(v: number, t: number): unknown;
};

function normEq(eq: TracksMap[string]['eq']): EqSettings | null {
  if (!eq) return null;
  return { low: 0, mid: 0, high: 0, ...(eq === true ? {} : eq) };
}

export function buildAudioGraph(tracks: TracksMap): AudioGraph {
  const masterEq = new Tone.EQ3({
    low: 0, mid: 0, high: 0,
    lowFrequency: 300,
    highFrequency: 4000,
  }).toDestination();

  const reverb = new Tone.Freeverb({ roomSize: 0.65, dampening: 1200, wet: 1 }).connect(masterEq);
  const reverbReturn = new Tone.Gain(1).connect(reverb);

  const nodes: Record<string, TrackNodes> = {};

  for (const [name, def] of Object.entries(tracks)) {
    const n: TrackNodes = { channel: new Tone.Gain(def.gain) };
    let out: Tone.ToneAudioNode = n.channel;

    const eq = normEq(def.eq);
    if (eq) {
      n.eq3 = new Tone.EQ3({
        low: 0, mid: 0, high: 0,
        lowFrequency: eq.lowFrequency ?? 200,
        highFrequency: eq.highFrequency ?? 6800,
      });
      out.connect(n.eq3);
      out = n.eq3;
    }

    if (def.pan != null) {
      n.panner = new Tone.Panner(def.pan);
      n.panner.channelCount = 2;
      n.panner.channelCountMode = 'explicit';
      out.connect(n.panner);
      out = n.panner;
    }

    if (def.reverb != null) {
      n.reverbSend = new Tone.Gain(def.reverb).connect(reverbReturn);
      n.channel.connect(n.reverbSend);
    }

    out.connect(masterEq);
    nodes[name] = n;
  }

  const graph: AudioGraph = {
    masterEq,
    nodes,
    dispose() {
      Object.values(nodes).forEach((n) => {
        n.channel.dispose(); n.panner?.dispose(); n.eq3?.dispose(); n.reverbSend?.dispose();
      });
      reverbReturn.dispose(); reverb.dispose(); masterEq.dispose();
    },
  };
  resetTrackParams(graph, tracks);
  return graph;
}

function paramOf(n: TrackNodes, p: ParamName): AnyParam | undefined {
  switch (p) {
    case 'gain':   return n.channel.gain as unknown as AnyParam;
    case 'pan':    return n.panner?.pan as unknown as AnyParam | undefined;
    case 'low':    return n.eq3?.low as unknown as AnyParam | undefined;
    case 'mid':    return n.eq3?.mid as unknown as AnyParam | undefined;
    case 'high':   return n.eq3?.high as unknown as AnyParam | undefined;
    case 'reverb': return n.reverbSend?.gain as unknown as AnyParam | undefined;
  }
}

/**
 * value: -1..1 position for low/mid/high, raw value for gain/pan/reverb.
 * rampSeconds > 0 -> ramp. `at` = audio-context time (the tick's `t`); omit for "right now".
 */
export function setTrackParam(
  n: TrackNodes | undefined,
  param: ParamName,
  value: number,
  rampSeconds = 0,
  at?: number
) {
  const node = n && paramOf(n, param);
  if (!node) return;

  const isEq = param === 'low' || param === 'mid' || param === 'high';
  const target = isEq ? positionToDb(value, ...EQ_RANGE[param]) : value;

  if (rampSeconds > 0) node.rampTo(target, rampSeconds, at);
  else if (at !== undefined) node.setValueAtTime(target, at);
  else node.value = target;
}

/** Put every track's mix params back to their configured starting values. */
export function resetTrackParams(graph: AudioGraph, tracks: TracksMap) {
  for (const [name, def] of Object.entries(tracks)) {
    const n = graph.nodes[name];
    setTrackParam(n, 'gain', def.gain);
    if (def.pan != null) setTrackParam(n, 'pan', def.pan);
    if (def.reverb != null) setTrackParam(n, 'reverb', def.reverb);
    const eq = normEq(def.eq);
    if (eq) (['low', 'mid', 'high'] as const).forEach((b) => setTrackParam(n, b, eq[b]));
  }
}

export function setIsolator(graph: AudioGraph, [low, mid, high]: [number, number, number], rampSeconds = 0, at?: number) {
  const targets = {
    low:  positionToDb(low,  ...ISOLATOR_RANGE.low),
    mid:  positionToDb(mid,  ...ISOLATOR_RANGE.mid),
    high: positionToDb(high, ...ISOLATOR_RANGE.high),
  };
  (['low', 'mid', 'high'] as const).forEach((band) => {
    const p = graph.masterEq[band];
    if (rampSeconds > 0) p.rampTo(targets[band], rampSeconds, at);
    else if (at !== undefined) p.setValueAtTime(targets[band], at);
    else p.value = targets[band];
  });
}