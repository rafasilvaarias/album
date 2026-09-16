<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import StochasticSequencer from "$lib/StochasticSequencer.svelte";
  import { positionToDb, mulberry32 } from "$lib/globalFunctions";
  import { EQ_RANGE, ISOLATOR_RANGE } from "$lib/globalVariables";
  import kickSchema from "./kick.json";
  import rideSchema from "./ride.json";
  import tomsSchema from "./toms.json";
  import snareSchema from "./snare.json";
  import bassSchema from "./bass.json";
  import harpSchema from "./harp.json";
  import crashSchema from "./crash.json";
  import guitarSchema from "./guitar.json";
  import sonarSchema from "./pad.json";
  import voiceSchema from "./voice.json";
  import hiHatSchema from "./hiHat.json";
  import breakDrumsSchema from "./crashDrums.json";
  import synthSchema from "./synth.json";
  import pianoSchema from "./piano.json";
  import tambourineSchema from "./tambourine.json";
  import { getPhrase } from "./phrase";
  import { TransportClass } from "tone/build/esm/core/clock/Transport";

  type EqSettings = {
    low: number;
    mid: number;
    high: number;
    lowFrequency?: number;  // defaults to 200
    highFrequency?: number; // defaults to 6800
  };

  type TrackMessage = [number[], number, string[], number];

  type Track = {
    schema: any;
    gain: number;
    pan: number | null;   // null = no panner, straight to master bus
    eq: EqSettings | null; // null = no per-track EQ3
    reverb: number | null; // null = no reverb send, otherwise send gain amount
    metaSequence: number;
    extraMutations: any[];
    message: TrackMessage;
    reset: number;
    // built in onMount:
    channel?: Tone.Gain;
    panner?: Tone.Panner;
    eq3?: Tone.EQ3;
    reverbSend?: Tone.Gain;
  };

  type ParamName = 'gain' | 'pan' | 'low' | 'mid' | 'high' | 'reverb';

  //const seed = 1018;
  const seed = Math.round(Math.random() * 100000);
  console.log("Seed: ",seed);
  const random = mulberry32(seed);

  // --- State ---
  let playing = $state(false);
  let beat = $state(-1);
  let time = $state(0);
  let sequencerReady = $state(false);

  let bpm = $state(87);
  let subdivision = $state(2);
  let beatTime = (60 / bpm) / subdivision;

  let songStructure : {section : string, time: number, start: number, end: number}[] = [];
  let sequenceScheduling : {beat: number, track: keyof typeof tracks, seq: number}[] = [];
  let paramScheduling : {beat: number, track: keyof typeof tracks, param: ParamName, value: number, rampBeats?: number }[] = [];

  const defaultEQ = {low:0,mid:0,high:0};
  const defaultMessage : TrackMessage = [[], 1000, [], 1000];

  let middleStructure = {start: 0, end: 0};
  let endingStructure = {start: 0, end: 0};
  let breakPoints : {time: number, probability: number}[] = [];
  let pianoPoint = 0;

  let masterEq: Tone.EQ3;

  function setSongStructure(){
    let sum = 0;

    // A = ana cruse, I = intro, V = verse, P = pause, C = climax, O = outro
    // Define beginning section

    if (random() < 0.45) {
      const section = "A";
      const start = sum;
      const time = 4 + (Math.floor(random() * 6))
      sum = sum + time;
      songStructure.push({section, time, start, end: sum});
    }
    if (random() < 0.222) {
      const section = "P";
      const timePossibilities = [2, 2, 4, 4, 6];
      let time = timePossibilities[Math.floor(random() * timePossibilities.length)];
      if (random() < 0.3) time = time - 1;
      const start = sum;
      time = time * 16;
      sum = sum + time;
      songStructure.push({section, time, start, end: sum});
    } else {
      const section = "I";
      const timePossibilities = [4, 6, 8, 10];
      let time = timePossibilities[Math.floor(random() * timePossibilities.length)];
      if (time < 10 && random() < 0.2) time = time - 1; 
      const start = sum;
      time = time * 16;
      sum = sum + time;
      songStructure.push({section, time, start, end: sum});
    }

    
    // Defining middle structure

    let middleSequence : string[] = []

    if (songStructure[songStructure.length - 1].section == "P"){
      if (random() < 0.3) {middleSequence = ["V","P"]} else {middleSequence = ["V","P","V"]}
    } else {
      if (random() < 0.2) {
        middleSequence = ["V","P"];
      } else if (random() < 0.5){
        middleSequence = ["V","P","V"];
      } else {
        middleSequence = ["V","P","V","P"];
      }
    }

    if (middleSequence.join(",") === "V,P"){
      let sections = ["V", "P"];
      const timePossibilities = [12,16];
      const times = [
        timePossibilities[Math.floor(random() * timePossibilities.length)], 
        timePossibilities[Math.floor(random() * timePossibilities.length)]
      ];
      if (random() < 0.2) timePossibilities[Math.floor(random()*timePossibilities.length)] = 14;
      for(let i = 0; i<sections.length; i++){
        const section = sections[i];
        const start = sum;
        const time = times[i] * 16;
        sum = sum + time;
        songStructure.push({section, time, start, end: sum});
        if (i == 0) middleStructure.start = start;
        if (i == sections.length - 1) middleStructure.end = sum;
      }

    } else if (middleSequence.join(",") === "V,P,V"){
      let sections = ["V", "P", "V"];
      const timePossibilities = [4,8];
      const firstVerseTime = timePossibilities[Math.floor(random() * timePossibilities.length)];
      const times = [
        firstVerseTime, 
        timePossibilities[Math.floor(random() * random() * timePossibilities.length)], 
        firstVerseTime == 4 ? 8 : 4
      ];
      if (random() < 0.2) timePossibilities[Math.floor(random()*timePossibilities.length)] = 14;
      for(let i = 0; i<sections.length; i++){
        const section = sections[i];
        const start = sum;
        const time = times[i] * 16;
        sum = sum + time;
        songStructure.push({section, time, start, end: sum});
        if (i == 0) middleStructure.start = start;
        if (i == sections.length - 1) middleStructure.end = sum;
      }

    } else if (middleSequence.join(",") === "V,P,V,P"){
      let sections = ["V", "P", "V", "P"];
      const timePossibilities = [4,6];
      const times = [
        timePossibilities[Math.floor(random() * random() * timePossibilities.length)],
        timePossibilities[Math.floor(random() * random() * timePossibilities.length)],
        timePossibilities[Math.floor(random() * random() * timePossibilities.length)],
        timePossibilities[Math.floor(random() * random() * timePossibilities.length)]
      ];
      if (random() < 0.1) timePossibilities[Math.floor(random()*timePossibilities.length)] = 8;
      if (random() < 0.1) timePossibilities[Math.floor(random()*timePossibilities.length)] = 14;
      for(let i = 0; i<sections.length; i++){
        const section = sections[i];
        const start = sum;
        const time = times[i] * 16;
        sum = sum + time;
        songStructure.push({section, time, start, end: sum});
        if (i == 0) middleStructure.start = start;
        if (i == sections.length - 1) middleStructure.end = sum;
      }
    }

    const pianoPointPossibilities = [16,16,32,32,32,32,48,48,48,48,48,64]
    pianoPoint = random() < 0.2 ? 
      songStructure[songStructure.length - 1].end 
      : songStructure[songStructure.length - 1].end - pianoPointPossibilities[Math.floor(random() * pianoPointPossibilities.length)];
    console.log("piano point: ", pianoPoint);

    // Defining closing structure

    if (random() < 0.194){
      const section = "C";
      const timePossibility = [10,12,14,16];
      const start = sum;  
      const time = timePossibility[Math.floor(random() * timePossibility.length)] * 16;
      sum = sum + time;
      songStructure.push({section, time, start, end: sum});
      endingStructure.start = start;
      endingStructure.end = sum;
    } else {
      const sections = ["C", "O"];
      const cTimePossibility = [8,10,12];
      const oTimePossibility = [3,4,4,4,5,5,6,6,6];
      const times = [
        cTimePossibility[Math.floor(random() * cTimePossibility.length)] * 16,
        oTimePossibility[Math.floor(random() * oTimePossibility.length)] * 16
      ];
      if (random () > 0.2) times[1] = times[1] - 12;
      for(let i = 0; i<sections.length; i++){
        const section = sections[i];
        const start = sum;
        const time = times[i];
        sum = sum + time;
        songStructure.push({section, time, start, end: sum});
        if (i==0) endingStructure.start = start;
        if (i==1) endingStructure.end = sum;
      }
    }

    console.log(songStructure);
    console.log("Song Time (Total) -> ",Math.floor(sum * 0.344 / 60),":",Math.floor((sum * 0.344 % 60)*60/100));
  }
  
  function setTrackScheduling(){
    const pianoMutated = random() < 0.8 ? false : true;
    let verseCount = 0;
    songStructure.forEach((section, index) => {
      //anacruse section
      if (section.section == "A") {
        const seq = random() < 0.3 ? 6 : 5;
        sequenceScheduling.push({beat: section.start, track: 'voice', seq});
      } else if (section.section == "I") {
        //define type of intro
        let introType : string = "";
        if (section.end - section.start < 5*16) introType = "jam";
        else if (section.end - section.start < 7*16) {
          if (random() < 0.4) introType = "jam";
          else introType = "buildUp";
        } else introType = "buildUp";

        //define the intro
        if (introType == "buildUp"){ //buildup: elements of verse come slowly one by one
          let trackSequence = ['kick','snare','ride','toms'];
          let trackTimes = new Array(trackSequence.length);
          let usedTimes = new Set();
          for (let i = 0; i < trackSequence.length; i++){
            let time;
            let tries = 0
            do {
              time = (
                (section.start / 16 + 2) +
                Math.floor(random() * ((section.end / 16 - 1) - (section.start / 16 + 2)))
              ) * 16;
              tries++;
            } while (usedTimes.has(time) && tries < 100);
            usedTimes.add(time);
            trackTimes[i] = time;
            sequenceScheduling.push({beat: trackTimes[i], track: trackSequence[i], seq: 1});
            if (trackSequence[i] == 'ride') sequenceScheduling.push({beat: trackTimes[i] - 4, track: trackSequence[i], seq: 2});
          }
          //set bass rampUp
          let lowestTime = Math.min(...trackTimes);
          sequenceScheduling.push({beat: section.start, track: 'bass', seq: 1});
          tracks.bass.channel!.gain.value = 0;
          paramScheduling.push({beat: section.start, track: 'bass', param: 'gain', value: tracks.bass.gain, rampBeats: lowestTime})
          //set vocals fadeOut;
          if (songStructure[0].section == "A") {
            let gainEndValue = 0;
            let endOfFadeOut = 0
            if (random() < 0.7) {
              endOfFadeOut = 6 + Math.floor((1 - (random() * random()))*(lowestTime + 10));
            } else {
              gainEndValue = 0.75;
              endOfFadeOut = 3 + Math.floor(random() * 5);
            }
            paramScheduling.push({beat: section.start, track: 'voice', param: 'gain', value: gainEndValue, rampBeats: endOfFadeOut});
            sequenceScheduling.push({beat: section.start + endOfFadeOut, track: 'voice', seq: 0});
            paramScheduling.push({beat: section.start + endOfFadeOut, track: 'voice', param: 'gain', value: tracks.voice.gain, rampBeats: 1});

          }
        } else if (introType == "jam"){ //jam: cymbal mania before verse
          const introTracks = ['tambourine', 'ride', 'hiHat']
          for (let i = 0; i < introTracks.length; i++){
            sequenceScheduling.push({beat : section.start, track : introTracks[i], seq:1});
            const probability = introTracks[i] == 'hiHat' ? 0.2 : 0.7
            if (random() < probability){
              const randomEQsettings = [[-0.5,0.6,0.2],[-0.6,0.5,-0.8],[-0.3,0.1,0.5],[0.2,-0.5,-0.3]];
              const randomStepSize = 5 + Math.floor(random() * 5);
              const probability = (3 + Math.floor(random() * 4)) / ((section.end - section.start)/randomStepSize);
              let lastStep = 0;
              let anySweep = false;
              for (let a = section.start + randomStepSize; a < section.end; a = a + randomStepSize){
                if(random() < probability){
                  const index = Math.floor(random()*randomEQsettings.length);
                  paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'low', value: randomEQsettings[index][0], rampBeats: a - lastStep});
                  paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'mid', value: randomEQsettings[index][1], rampBeats: a - lastStep});
                  paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'high', value: randomEQsettings[index][2], rampBeats: a - lastStep});
                  anySweep = true;
                  lastStep = a;
                }
              }
              if (anySweep == true) {
                paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'low', value: 0, rampBeats: section.end - lastStep});
                paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'mid', value: 0, rampBeats: section.end - lastStep});
                paramScheduling.push({beat: lastStep, track: introTracks[i], param: 'high', value: 0, rampBeats: section.end - lastStep});
              }
            }
            if (introTracks[i] == 'tambourine' && random() < 0.65) {
              const pause = random() < 0.5 ? 4 : 2
              const probability = (1 + Math.floor(random() * 3)) / ((section.end - section.start)/16);
              for (let a = section.start; a < section.end; a = a + 16) {
                if (random() < probability){
                  sequenceScheduling.push({beat : a - 2, track : introTracks[i], seq:0});
                  sequenceScheduling.push({beat : a, track : introTracks[i], seq:1});
                }
              }
            }
          }
          if (random() < 0.6){
            const fadeOutTrack = random() * 0.5 ? "tambourine" : "hiHat";
            let fadeOutTempo = 16;
            if (fadeOutTrack == "tambourine" && random() < 0.7) fadeOutTempo = 32;
            paramScheduling.push({beat: section.end, track: fadeOutTrack, param: 'gain', value: 0, rampBeats: fadeOutTempo});
            sequenceScheduling.push({beat: section.end + fadeOutTempo, track: fadeOutTrack, seq: 0});
            paramScheduling.push({beat: section.end + fadeOutTempo, track: fadeOutTrack, param: 'gain', value: tracks[fadeOutTrack].gain, rampBeats: 1});
            sequenceScheduling.push({beat: section.end, track: fadeOutTrack == "tambourine" ? "hiHat" : "tambourine", seq: 0});
          } else {
            sequenceScheduling.push({beat: section.end, track: 'tambourine', seq: 0});
            sequenceScheduling.push({beat: section.end, track: 'hiHat', seq: 0});
          }
          sequenceScheduling.push({beat: section.start, track: 'voice', seq: 0});
        }
        //grunting in intro
        if (random() < 0.7) { // grunts start
          const time = (section.start + 16 + Math.floor((section.end - section.start - 40 - 16) * random()));
          sequenceScheduling.push({beat : time, track: 'voice', seq: 2});
        }
        const glotalSoundStart = section.end - 32;
        paramScheduling.push({beat : glotalSoundStart - 1, track: 'voice', param: 'gain', value: 0, rampBeats: 1});
        sequenceScheduling.push({beat : section.end - 32, track: 'voice', seq: 3});
        paramScheduling.push({beat : glotalSoundStart, track: 'voice', param: 'gain', value: tracks.voice.gain, rampBeats: 32});
        if (random() < 0.4) {          
          sequenceScheduling.push({beat : section.end - 2, track: 'hiHat', seq: 2});
          sequenceScheduling.push({beat : section.end, track: 'hiHat', seq: 0});
        }
      
      } else if (section.section == "P") {
        const isIntro = index <= 1;
        if (!isIntro) breakPoints.push({time:section.start, probability:1});
        if (!isIntro && songStructure[index - 1].time > 64) {//check if not intro and if previous section is larger than 4 bars
          if (random() < 0.35) {//fadeInGuitar
            const fadeIn = 16 + Math.floor(random() * 16);
            paramScheduling.push({beat: section.start - fadeIn - 1, track: 'guitar', param: 'gain', value: 0, rampBeats: 1})
            paramScheduling.push({beat: section.start - fadeIn, track: 'guitar', param: 'gain', value: tracks.guitar.gain, rampBeats: fadeIn})
            sequenceScheduling.push({beat: section.start - fadeIn, track: 'guitar', seq: 3});
          } else {
            const soloStart = section.start + (Math.floor(random() * (section.time / 64) + 0.2) * 16);
            sequenceScheduling.push({beat: soloStart, track: 'guitar', seq: 3});
          }
          
          if (random() < 0.55) {//fadeInTambourine
            const fadeIn = 16 + Math.floor(random() * 32);
            paramScheduling.push({beat: section.start - fadeIn - 1, track: 'tambourine', param: 'gain', value: 0, rampBeats: 1})
            paramScheduling.push({beat: section.start - fadeIn, track: 'tambourine', param: 'gain', value: tracks.tambourine.gain, rampBeats: fadeIn})
            sequenceScheduling.push({beat: section.start - fadeIn, track: 'tambourine', seq: 1});
          }
        } else if (!isIntro) {
          if (random() < 0.95) {
            sequenceScheduling.push({beat: section.start, track: 'guitar', seq: 3});
          }
        }
        if (random() < 0.7) sequenceScheduling.push({beat: section.end, track: 'guitar', seq: 0});
        let glotalTime = 0;
        if (isIntro) {
          let probability = 0.6
          if (section.time > 4*16){
            probability = 1;
          }
          if (random() < probability){
            glotalTime = 32
            const glotalSoundStart = section.end - glotalTime;
            paramScheduling.push({beat : glotalSoundStart - 1, track: 'voice', param: 'gain', value: 0, rampBeats: 1});
            sequenceScheduling.push({beat : section.end - 32, track: 'voice', seq: 3});
            paramScheduling.push({beat : glotalSoundStart, track: 'voice', param: 'gain', value: tracks.voice.gain, rampBeats: 32});
          }
          const appearances = ['sonar', 'synth'];
          for (let i = 0; i < appearances.length; i++){
            if (random() < 0.5) { //sonar
              const timePossibilities = [0, 0, 0, 16, 16, 32];
              let start;
              let end;
              do {
                start = section.start + timePossibilities[Math.floor(random() * timePossibilities.length)];
                end = section.end - timePossibilities[Math.floor(random() * timePossibilities.length)];
              } while (start >= end);
              sequenceScheduling.push({beat : start, track: appearances[i], seq: 1});
              sequenceScheduling.push({beat : end, track: appearances[i], seq: 0});
            }
          }
        }
        if (random() < 0.4  ) {
          sequenceScheduling.push({beat : section.end - 2, track: 'hiHat', seq: 2});
          sequenceScheduling.push({beat : section.end, track: 'hiHat', seq: 0});
        }
        sequenceScheduling.push({beat: section.start, track: 'bass', seq: 2});
        sequenceScheduling.push({beat: section.start, track: 'kick', seq: 2});
        sequenceScheduling.push({beat: section.start, track: 'snare', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'toms', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'tambourine', seq:1});
        let seqRide = random() < 0.7 ? 0 : 3;
        sequenceScheduling.push({beat: section.start, track: 'ride', seq: seqRide});
        if (random() < 0.8) { //ride retrigger
          const changes = 1 + Math.floor(random() * 4);
          const distribution = random();
          for (let i = 0; i < changes; i++){
            let seqRide = random() < distribution ? 0 : 3;
            let changePoint = section.start + (Math.floor((section.end - section.start) / 2 * random()) * 2)
            sequenceScheduling.push({beat: changePoint, track: 'ride', seq: seqRide});
          }
        }
        if (random() < 0.6) sequenceScheduling.push({beat: section.start, track: 'crash', seq: 1}); 
        if (random() < 0.7) { //crash retrigger
          const period = 6 + (Math.floor(random() * 16) * 2);
          const probability = (1 + Math.floor(random() * 3)) / ((section.end - section.start) / period); 
          const seqCrash = random() < 0.2 ? 2 : 1;
          for (let i = section.start; i < section.end; i = i + period){
            if (random() < probability) sequenceScheduling.push({beat: i, track: 'crash', seq: seqCrash});
          }
        }
        let seqVoice = random() < 0.1 ? 2 : 0;
        sequenceScheduling.push({beat: section.start, track: 'voice', seq: seqVoice});
        if (random() < 0.9) { // voice retrigger
          const period = 7 + Math.floor(random() * 32);
          const probability = (1 + Math.floor(random() * 6)) / ((section.end - section.start) / period); 
          const endTime = random() < 0.1 ? section.end : section.end - glotalTime;
          for (let i = section.start; i < endTime; i = i + period){
            seqVoice = seqVoice == 0 ? 2 : 0;
            if (random() < probability) sequenceScheduling.push({beat: i, track: 'voice', seq: seqVoice});
          }
        }
        //piano starting point
        if (index == 0) sequenceScheduling.push({beat: section.start, track: 'piano', seq: 2});
        else if (random() < 0.7 && section.start - 3 < pianoPoint) sequenceScheduling.push({beat: section.start - 3, track: 'piano', seq: 1});
        else if (section.start < pianoPoint)sequenceScheduling.push({beat: section.start, track: 'piano', seq: 2});

        //bar tings
        for (let i = section.start; i < section.end; i=i+16){
          if (pianoMutated) { 
            if (i < pianoPoint) sequenceScheduling.push({beat: i, track: 'piano', seq: 0});
            if (i + 13 < pianoPoint) sequenceScheduling.push({beat: i + 13, track: 'piano', seq: 1});
          }
          if (random() < 0.3){
            const pause = random() < 0.5 ? 4 : 2;
            const probability = random() < 0.15 ? 1 : (1 + Math.floor(random() * 3)) / ((section.end - section.start)/16);
            for (let a = section.start; a < section.end; a = a + 16) {
              if (random() < probability){
                    sequenceScheduling.push({beat : a - pause, track: 'tambourine', seq:0});
                    sequenceScheduling.push({beat : a, track: 'tambourine', seq:1});
              }
            }
          }
        }
        if (random() < 0.7) {
          const pause = random() < 0.25 ? 4 : 2;
          sequenceScheduling.push({beat : section.end - pause, track: 'tambourine', seq:0});
        }
        if (isIntro) {
          if (random() < 0.5){
            let fadeOutTempo = 8 + Math.floor(random() * 16);
            sequenceScheduling.push({beat: section.end, track: 'tambourine', seq: 1});
            paramScheduling.push({beat: section.end, track: 'tambourine', param: 'gain', value: 0, rampBeats: fadeOutTempo});
            sequenceScheduling.push({beat: section.end + fadeOutTempo, track: 'tambourine', seq: 0});
            paramScheduling.push({beat: section.end + fadeOutTempo, track: 'tambourine', param: 'gain', value: tracks.tambourine.gain, rampBeats: 1});
          } else {
            sequenceScheduling.push({beat : section.end, track: 'tambourine', seq:0});
          }
        } else {
          sequenceScheduling.push({beat : section.end, track: 'tambourine', seq:0});
        }
        //piano ending point
        if (!isIntro && !pianoMutated && random() * 0.15 && section.end + 13 < pianoPoint) sequenceScheduling.push({beat: section.end + 13, track: 'piano', seq: 0});
        else if (random() < 0.6 && section.end < pianoPoint) sequenceScheduling.push({beat: section.end, track: 'piano', seq: 0});
        else if (section.end - 3 < pianoPoint) sequenceScheduling.push({beat: section.end - 3, track: 'piano', seq: 0});


      } else if (section.section == "V") {
        breakPoints.push({time:section.start, probability:1});
        sequenceScheduling.push({beat: section.start, track: 'bass', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'kick', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'snare', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'toms', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'ride', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'crash', seq: 1});
        if (section.time > 64 && random() < 0.6) sequenceScheduling.push({beat: section.start + 32, track: 'voice', seq: 1});
        else sequenceScheduling.push({beat: section.start, track: 'voice', seq: 1});
        sequenceScheduling.push({beat: section.end, track: 'hiHat', seq: 0});
        
        let part = "ride";
        let lastPart = "ride";
        const distribution = random() * 0.5 + 0.20;
        //const probability = 0.3 + (random() * 0.7);
        const probability = 0.3 + ((1-(random() * random())) * 0.7);
        for (let i = section.start; i < section.end; i = i + 16){
          const firstBar = i == section.start;
          if (random() < probability) {
            part = random() < distribution ? "hiHat" : "ride";
            if (part == "ride"){ //RIDE
              if (lastPart == "hiHat"){
                breakPoints.push({time:i, probability:2})
                if (random () < 0.2) sequenceScheduling.push({beat: i, track: 'guitar', seq: 2});
                sequenceScheduling.push({beat: i, track: 'ride', seq: 1});
                sequenceScheduling.push({beat: i, track: 'hiHat', seq: 0});
                sequenceScheduling.push({beat: i, track: 'guitar', seq: 0});
                sequenceScheduling.push({beat: i, track: 'snare', seq: 1});
                if (!firstBar){ //transitions
                  if (random() < 0.2) sequenceScheduling.push({beat: i - 4, track: 'ride', seq: 2});
                  else if (random () < 0.2) {
                    const time = 5 + Math.floor(random() * 12);
                    sequenceScheduling.push({beat: i - time, track: 'ride', seq: 1});
                    paramScheduling.push({beat : i - time - 1, track: 'ride', param: 'gain', value: 0, rampBeats: 1});
                    paramScheduling.push({beat : i - time, track: 'ride', param: 'gain', value: tracks.ride.gain, rampBeats: time});
                  }
                }
                lastPart = "ride";
              }
            } 
            if (part == "hiHat"){ //HI HAT
              if (lastPart == "ride"){
                breakPoints.push({time:i, probability:2});
                sequenceScheduling.push({beat: i, track: 'guitar', seq: 2});
                const rideSeq = random() < .5 ? 0 : 3;
                sequenceScheduling.push({beat: i, track: 'ride', seq: rideSeq});
                paramScheduling.push({beat : i, track: 'hiHat', param: 'gain', value: tracks.hiHat.gain});
                sequenceScheduling.push({beat: i, track: 'hiHat', seq: 1});
                if (random() < 0.4) sequenceScheduling.push({beat: i, track: 'snare', seq: 0});
                if (!firstBar){ //transitions
                  if (random() < 0.2) {
                    const time = 5 + Math.floor(random() * 12);
                    sequenceScheduling.push({beat: i - time, track: 'hiHat', seq: 1});
                    paramScheduling.push({beat : i - time - 1, track: 'hiHat', param: 'gain', value: 0, rampBeats: 1});
                    paramScheduling.push({beat : i - time, track: 'hiHat', param: 'gain', value: tracks.hiHat.gain, rampBeats: time});
                  } else if (random() < 0.4){
                    sequenceScheduling.push({beat: i - 2, track: 'hiHat', seq: 2});
                  }
                }
                lastPart = "hiHat";
              } else {
                if (random() < 0.5) {
                  const rideSeq = random() < .5 ? 0 : 3;
                  sequenceScheduling.push({beat: i, track: 'ride', seq: rideSeq});
                }
                if (random() < 0.4) sequenceScheduling.push({beat: i, track: 'snare', seq: 0});
              }
            }
          }
        }
        //piano hits
        const pianoHits = Math.floor(section.time / 64 * (verseCount + 1) * random() + 0.2);
        for(let i = 0; i < pianoHits; i++){
          const hitTime = section.start + (Math.floor(section.time * random() / 16) * 16);
          if (hitTime < pianoPoint) {
            if (random() < 0.8 || pianoMutated) {
              sequenceScheduling.push({beat: hitTime - 3, track: 'piano', seq: 1});
              sequenceScheduling.push({beat: hitTime, track: 'piano', seq: 0});
            } else {
              sequenceScheduling.push({beat: hitTime - 3, track: 'piano', seq: 1});
              sequenceScheduling.push({beat: hitTime + 13, track: 'piano', seq: 0});
            }
          }
        }

        verseCount++;
      } else if (section.section == "C") {
        //buildup
        const possibilities = [16,16,24,24,32,32,40];
        const buildUpTime = possibilities[Math.floor(random() * possibilities.length)];
        const time = section.start - buildUpTime;
        paramScheduling.push({beat : time - 1, track: 'breakDrums', param: 'gain', value: 0, rampBeats: 1});
        paramScheduling.push({beat : time, track: 'breakDrums', param: 'gain', value: tracks.breakDrums.gain, rampBeats: buildUpTime});
        for (let i = time; i < section.start; i++) {
          sequenceScheduling.push({beat: i, track: 'breakDrums', seq: 1});
        }
        for (let i = section.start; i < section.end; i = i+16){
          sequenceScheduling.push({beat: i, track: 'breakDrums', seq: 1});
        }
        sequenceScheduling.push({beat: section.start, track: 'kick', seq: 2});
        sequenceScheduling.push({beat: section.start, track: 'crash', seq: 1});
        sequenceScheduling.push({beat: section.start, track: 'snare', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'ride', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'toms', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'hiHat', seq: 0});
        sequenceScheduling.push({beat: section.start, track: 'bass', seq: 2});
        sequenceScheduling.push({beat: section.start, track: 'guitar', seq: 4});
        sequenceScheduling.push({beat: section.start, track: 'tambourine', seq: 1});
        sequenceScheduling.push({beat: section.end, track: 'breakDrums', seq: 0})
        sequenceScheduling.push({beat: section.end, track: 'tambourine', seq: 0});
        const breakDrumsEQsettings : {name : ParamName, value: number}[] = [{name: 'low', value: - 1},{name: 'mid', value: 0.6},{name: 'high', value: - 0.2}]
        function getStartPoint() {
          return section.start + Math.floor((section.end - section.start) / 2) + Math.floor(random() * 24) * (random() < 0.5 ? -1 : 1);
        }
        for (let i = 0; i < breakDrumsEQsettings.length; i++){
          const startPoint = getStartPoint();
          paramScheduling.push({beat: startPoint, track: 'breakDrums', param: breakDrumsEQsettings[i].name, value: breakDrumsEQsettings[i].value, rampBeats: section.end - startPoint});
        }
        
      } else if (section.section == "O") {
        //piano; or complete fadeout or nothing or doesnt play from the start
        if (random() < 0.4) sequenceScheduling.push({beat: section.start, track: 'piano', seq: (section.start + Math.floor((section.end - section.start) * random()))});
        else if (random() < 0.1) sequenceScheduling.push({beat: section.start, track: 'piano', seq: 0});
        //kick; or stop; or low pass filter seep; or low pass filter
        if (random() < 0.2) {
          sequenceScheduling.push({beat: (section.start + Math.floor((section.end - section.start) * random())), track: 'kick', seq: 0});
        } else if (random() < 0.6) {
          paramScheduling.push({beat: section.start, track: 'piano', param: 'mid', value: -0.4, rampBeats: section.time});
          paramScheduling.push({beat: section.start, track: 'piano', param: 'high', value: -0.7, rampBeats: section.time});
        } else {
          paramScheduling.push({beat: section.start - 1, track: 'piano', param: 'mid', value: -0.4, rampBeats: section.start - 1});
          paramScheduling.push({beat: section.start - 1, track: 'piano', param: 'high', value: -0.7, rampBeats: section.start - 1});
        }
        //guitar; or gets thin; or nothing; or doesn't play
        if (random() < 0.5) {
        } else if (random() < 0.6) {
          paramScheduling.push({beat: section.start, track: 'guitar', param: 'mid', value: -0.3, rampBeats: section.time});
          paramScheduling.push({beat: section.start, track: 'guitar', param: 'low', value: -0.5, rampBeats: section.time});
        } else {
          sequenceScheduling.push({beat: section.start, track: 'guitar', seq: 0});
        }
        //synth; or mid boost sweep or stops
        if (random () < 0.6) {
          paramScheduling.push({beat: section.start, track: 'synth', param: 'mid', value: 0.45, rampBeats: section.time});
        } else {
          sequenceScheduling.push({beat: (section.start + (Math.floor((section.end - section.start) / 16 * random()) * 16)), track: 'synth', seq: 0});
        }
        //sonar; or stop or nothing
        if (random () < 0.4) {
          sequenceScheduling.push({beat: (section.start + (Math.floor((section.end - section.start) / 16 * random()) * 16)), track: 'sonar', seq: 0});
        } else {
        }
      }
    });

    //synth and sonar scheduling

    //sonar start, and on/off points
    const sonarProb = {min: 0.2 + (random() * 0.4), max: 0.8 - (random() * 0.3)};
    let sonarStarted = false;
    let lastSonarPoint = 0;
    for (let i = 0; i < breakPoints.length; i++) {
      let probability = sonarProb.min + ((sonarProb.max - sonarProb.min) * i/breakPoints.length);
      if (breakPoints[i].probability == 2) probability = 1 - ((1 - probability)**2);
      if (sonarStarted) probability = probability / 1.5;
      if (random() < probability){
        sequenceScheduling.push({beat: breakPoints[i].time, track: 'sonar', seq: 1});
        if (sonarStarted) {
          const pausePossibilities = [16, 16, 16, 32, 32];
          let pause = 0;
          if (random() < 0.9) {
            pause = pausePossibilities[Math.floor(random() * pausePossibilities.length)];
          } else {
            pause = 3 + Math.floor(random() * 30)
          }
          const pauseTime = Math.max(breakPoints[i].time - pause, lastSonarPoint + 16);
          sequenceScheduling.push({beat: pauseTime, track: 'sonar', seq: 0});
        }
        lastSonarPoint = breakPoints[i].time;
        sonarStarted = true;
      }
    }

    let lastSynthPoint = middleStructure.start;
    const division = 0.4 + (random()*0.2);
    for (let i = 0; i < 3; i++){
      let time = (
        lastSynthPoint + 32
        + (Math.floor(
          (middleStructure.end - (lastSynthPoint + 32)) * division * random() / 16
        ) * 16)
      );
      if (i == 0 && random() < 0.5) time = time - 32;
      if (i == 2 && random() < 0.3) time = middleStructure.end - 32;
      if (i == 0 && time >= middleStructure.start + 32 && random() < 0.4) {
        time = time - 32;
        paramScheduling.push({beat : time - 1, track: 'synth', param: 'gain', value: 0, rampBeats: 1});
        paramScheduling.push({beat : time, track: 'synth', param: 'gain', value: tracks.synth.gain, rampBeats: 32});
        sequenceScheduling.push({beat: time, track: 'synth', seq: i+1});
      } else {
        sequenceScheduling.push({beat: time, track: 'synth', seq: i+1});
      }
      lastSynthPoint = time;
      console.log("synthPoint nº", i, ":", time);
    }

    //pianoPoint schedule
    if (random() < 0.8) sequenceScheduling.push({beat: pianoPoint - 3, track: 'piano', seq: 1});
    else sequenceScheduling.push({beat: pianoPoint, track: 'piano', seq: 2});
    
    sequenceScheduling.push({beat: endingStructure.start, track: 'voice', seq: 5});
    const voiceSwitchTime = (
      endingStructure.start
      + ((Math.floor((endingStructure.end - 32 - endingStructure.start) * random() / 2)) * 2)
    )
    sequenceScheduling.push({beat: voiceSwitchTime, track: 'voice', seq: 6});
    if (random() < 0.4){
      const voiceCutOff = endingStructure.end - (Math.floor(random() * 32 / 2)* 2);
      console.log("voiceCutOff: ", voiceCutOff);
      const seq = random() < 6 ? 2 : 0;
      sequenceScheduling.push({beat: voiceCutOff, track: 'voice', seq: seq});
    }
    console.log("switchVoiceTime: ", voiceSwitchTime);


    Object.keys(tracks).forEach((name) => {
      sequenceScheduling.push({ beat: endingStructure.end, track: name, seq: 0 });
    });

    console.log(sequenceScheduling);
    console.log(paramScheduling);
    console.log(breakPoints);
  }
  
  function buildExtraMutations() {
    const bass = (() => {
      const possibleSteps = [1, 2, 4, 5, 7, 8, 10, 11, 12];
      function getRandomInt(min: number, max: number) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(random() * (max - min + 1)) + min;
      }
      const mutationsPerSequence = [getRandomInt(0, 3), getRandomInt(0, 3), getRandomInt(0, 3), getRandomInt(0, 3)];
      function getRandomMutation(index: number) {
        const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
        return {
          "type": "change",
          "where": ["sequences", index + 1, randomStep],
          "probability": 1,
          "injection": 0
        }
      }
      let extraMutations = [];
      for (let i = 0; i < mutationsPerSequence.length; i++) {
        for (let j = 0; j < mutationsPerSequence[i]; j++) {
          extraMutations.push(getRandomMutation(i));
        }
      }
      return extraMutations;
    })();

    const ride = (() => {
      let possibleSteps = [3, 4, 5, 6, 7];
      let extraMutations = [];
      for (let i = 0; i < possibleSteps.length; i++) {
        if (random() < 0.15) {
          const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
          extraMutations.push({
            "type": "change",
            "where": ["sequences", 6, randomStep],
            "probability": 1,
            "injection": [null, [4, 4]]
          });
        }
      }
      possibleSteps = [0, 1, 2, 3, 4, 5, 6, 7];
      for (let i = 0; i < possibleSteps.length; i++) {
        if (random() < 0.15) {
          const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
          extraMutations.push({
            "type": "change",
            "where": ["sequences", 7, randomStep],
            "probability": 1,
            "injection": [null, [4, 4]]
          });
        }
      }

      return extraMutations;
    })();

    const sonar = (() => {
      let extraMutations = [];
      for (let i = 0; i < 15; i++) {
        if (random() < 0.5) {
          const sampleN = random() < 0.2 ? 1 : 0;
          const sampleOffset = i + (random() * 0.2 - 0.1);
          const sampleName = "[]";
          extraMutations.push(
            {
              "type": "change",
              "where": ["sequences", 1, i + 1],
              "probability": 1,
              "injection":
              {
                "name": sampleName,
                "sample": sampleN,
                "gain": [0.9, 1, 1.1],
                "delay": 0,
                "offset": sampleOffset,
                "duration": 16,
                "probability": 0.5
              }
            }
          )
        }
        if (random() < 0.5) {
          const sampleN = random() < 0.2 ? 1 : 0;
          const sampleOffset = i + (random() * 0.2 - 0.1);
          const sampleName = "[]";
          extraMutations.push(
            {
              "type": "change",
              "where": ["sequences", 2, i + 1],
              "probability": 1,
              "injection":
              {
                "name": sampleName,
                "sample": sampleN,
                "gain": [0.9, 1, 1.1],
                "delay": 0,
                "offset": sampleOffset,
                "duration": 16,
                "probability": 0.5
              }
            }
          )
        }
      }

      return extraMutations;
    })();

    const voice = (() => {
      let extraMutations = [];

      let iGOrder = [0, 1, 2, 3, 4, 5];
      iGOrder = iGOrder.sort(() => random() - 0.5);

      for (let i = 0; i < iGOrder.length; i++) {
        const name = "IG" + iGOrder[i] + ".wav";
        extraMutations.push({
          "type": "change",
          "where": ["samples", [i]],
          "probability": 1,
          "injection": name,
        });
      }

      ///////////////////////////////////// Interjections for aaaaaaaa
      const numberOfInterjections = 3;
      for (let i = 0; i < numberOfInterjections; i++) {
        const nOfA = Math.floor(random() * 15) + 10;
        const minDiff = 8; // min y-gap between the two middle points
        const minGap = 3;  // min x-gap between every pair of points

        const startPoint = [0, 0];
        const endPoint = [nOfA, 11];

        let pointA: [number, number];
        let pointB: [number, number];
        do {
          const xA = Math.floor(random() * (nOfA - 1)) + 1;
          const xB = Math.floor(random() * (nOfA - 1)) + 1;
          const [x1, x2] = xA <= xB ? [xA, xB] : [xB, xA];
          pointA = [x1, Math.floor(random() * 12)];
          pointB = [x2, Math.floor(random() * 12)];
        } while (
          pointA[0] - startPoint[0] < minGap ||
          endPoint[0] - pointB[0] < minGap ||
          pointB[0] - pointA[0] < minGap ||
          Math.abs(pointB[1] - pointA[1]) < minDiff
        );

        const points = [];
        for (let x = startPoint[0]; x <= pointA[0]; x++) {
          const t = (x - startPoint[0]) / (pointA[0] - startPoint[0]);
          points.push(Math.floor(startPoint[1] + t * (pointA[1] - startPoint[1])));
        }
        for (let x = pointA[0] + 1; x <= pointB[0]; x++) {
          const t = (x - pointA[0]) / (pointB[0] - pointA[0]);
          points.push(Math.floor(pointA[1] + t * (pointB[1] - pointA[1])));
        }
        for (let x = pointB[0] + 1; x < endPoint[0]; x++) {
          const t = (x - pointB[0]) / (endPoint[0] - pointB[0]);
          points.push(Math.floor(pointB[1] + t * (endPoint[1] - pointB[1])));
        }
        let aSequence: (any)[] = [null];
        for (let i = 0; i < points.length; i++) {
          aSequence.push(
            {
              "name": "a",
              "sample": 7,
              "gain": 1.5,
              "delay": 0,
              "offset": points[i] / 2,
              "duration": 0.5,
              "probability": 1
            }
          );
        }

        //pairing for half note
        const paired = [];
        for (let i = 0; i < aSequence.length; i += 2) {
          paired.push([aSequence[i], aSequence[i + 1] ?? null]);
        }
        //console.log(paired);

        const probability = i == 2 ? 1 : random() * 0.5 + 0.25;

        extraMutations.push({
          "type": "add",
          "where": ["interjections"],
          "probability": 1,
          "injection": {
            "when": {
              "sequences": [4],
              "beats": [3]
            },
            "probability": probability,
            "sequence": paired
          },
        });
      }

      //// markov phrase builder
      const alphabet = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"]
      type Chain = Record<string, string[]>;

      function buildMarkovChain(text: string): Chain {
        const clean = text.toLowerCase().replace(/[^a-z]/g, '');
        const chain: Chain = {};

        for (let i = 0; i < clean.length; i++) {
          const current = clean[i];
          const next = clean[(i + 1) % clean.length];
          if (!chain[current]) chain[current] = [];
          chain[current].push(next);
        }

        return chain;
      }

      function generate(chain: Chain, n: number, start?: string): string {
        const keys = Object.keys(chain);
        let current = start ?? keys[0];
        let result = current;

        while (result.length < n) {
          const options = chain[current];
          if (!options || options.length === 0) {
            current = keys[Math.floor(random() * keys.length)];
            continue;
          }
          current = options[Math.floor(random() * options.length)];
          result += current;
        }

        return result;
      }

      // Example
      const phrase = getPhrase(seed);
      const text = phrase.phrase;
      const chain = buildMarkovChain(text);
      let sequenceLetters = generate(chain, 32);
      let sequenceSlow = [];
      let sequenceFast = [];
      for (let i = 0; i < sequenceLetters.length; i++){
        const index = alphabet.indexOf(sequenceLetters[i]);
        sequenceSlow.push(
          {
              "name": sequenceLetters[i],
              "sample": 9,
              "gainMin": 1.5, "gainMax": 1.7,
              "delay": 0,
              "offset": index*2,
              "duration": 2,
              "probability": 1
          },
        );
        sequenceSlow.push(null);
        
      }

      sequenceLetters = generate(chain, 32);

      for (let i = 0; i < sequenceLetters.length; i++){
        const index = alphabet.indexOf(sequenceLetters[i]);
        sequenceFast.push(
          {
              "name": sequenceLetters[i],
              "sample": 10,
              "gainMin": 1.5, "gainMax": 1.7,
              "delay": 0,
              "offset": index,
              "duration": 1,
              "probability": 1
          },
        );
      }

      extraMutations.push({
          "type": "change",
          "where": ["sequences",8],
          "probability": 1,
          "injection": sequenceSlow,
      });
      extraMutations.push({
          "type": "change",
          "where": ["sequences",9],
          "probability": 1,
          "injection": sequenceFast,
      });

      return extraMutations;
    })();

    const bD = (() => {
      let extraMutations: any = [];
      const durations = [0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 0.75, 1.5, 1.5, 1.5, 1.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.25, 1.25, 1, 0.75, 2, 1, 1, 0.25, 0.5, 0.25, 0.5, 0.25, 0.75, 0.5, 0.75, 0.5, 0.25, 0.25];
      let indexes = Array.from({ length: 38 }, (_, i) => i);
      const nOfSequences = 10 + Math.floor(random() * 11);
      const sequences = [];

      for (let i = 0; i < nOfSequences; i++) {
        if (indexes.length === 0) break;
        let sequence = null;
        let attempts = 0;
        while (!sequence && attempts < 200) {
          attempts++;
          const pool = [...indexes];
          const current = [];
          let sum = 0;
          const startPos = Math.floor(random() * pool.length);
          const startIndex = pool.splice(startPos, 1)[0];
          current.push(startIndex);
          sum += durations[startIndex];
          while (sum !== 1 && sum !== 2 && pool.length > 0) {
            const pos = Math.floor(random() * pool.length);
            const candidateIndex = pool[pos];
            pool.splice(pos, 1);
            if (sum + durations[candidateIndex] <= 2) {
              current.push(candidateIndex);
              sum += durations[candidateIndex];
            }
          }
          if (sum === 1 || sum === 2) {
            sequence = current.map(idx => ({ index: idx, duration: durations[idx] }));
          }
        }
        if (!sequence) break;
        sequences.push(sequence);
        indexes = indexes.filter(idx => !sequence.some(s => s.index === idx));
      }

      for (let i = 0; i < sequences.length; i++) {
        const totalDuration = sequences[i].reduce((sum, s) => sum + s.duration, 0);
        let injection: any = totalDuration === 1
          ? [[null, null, null, null]]
          : [[null, null, null, null], [null, null, null, null]];
        let tempoSum = 0;
        for (let a = 0; a < sequences[i].length; a++) {
          injection[tempoSum >= 4 ? 1 : 0][tempoSum % 4] = {
            "name": "&&",
            "sample": 0,
            "gain": 1,
            "delay": 0,
            "offset": sequences[i][a].index * 2,
            "duration": 2,
            "probability": 1
          }
          tempoSum = tempoSum + sequences[i][a].duration * 4;
        }
        extraMutations.push({
          "type": "add",
          "where": ["sequences"],
          "probability": 1,
          "injection": injection,
        });
      }

      // 1 = the existing sequence already in the json, 2..N = the ones we just added, in order
      const nOfCDSequences = sequences.length + 1;
      const cdSequenceList = Array.from({ length: nOfCDSequences }, (_, i) => i + 1);

      const cdMarkovMatrix = [];
      for (let s = 0; s < nOfCDSequences; s++) {
        const row = new Array(nOfCDSequences).fill(0);
        const maxConnections = Math.min(5, nOfCDSequences);
        const nConnections = Math.floor(random() * (maxConnections - 1)) + 2;

        const availableCols = Array.from({ length: nOfCDSequences }, (_, i) => i);
        const chosenCols = [];
        for (let c = 0; c < nConnections; c++) {
          const pos = Math.floor(random() * availableCols.length);
          chosenCols.push(availableCols.splice(pos, 1)[0]);
        }

        const rawWeights = chosenCols.map(() => random());
        const weightSum = rawWeights.reduce((a, b) => a + b, 0);

        chosenCols.forEach((col, idx) => {
          row[col] = rawWeights[idx] / weightSum;
        });

        cdMarkovMatrix.push(row);
      }

      extraMutations.push({
        "type": "change",
        "where": ["metaSequences", 1],
        "probability": 1,
        "injection": {
          "type": "markovian",
          "sequence": cdSequenceList,
          "markovMatrix": cdMarkovMatrix
        }
      });

      return extraMutations;
    })();

    return { bass, ride, sonar, voice, bD };
  }
  const {bass: bassExtraMutations, ride: rideExtraMutations, sonar: sonarExtraMutations, voice: voiceExtraMutations, bD: bDExtraMutations } = buildExtraMutations();
  
  function buildAudioGraph() {
    masterEq = new Tone.EQ3({
      low: 0,
      mid: 0,
      high: 0,
      lowFrequency: 300,
      highFrequency: 4000,
    }).toDestination();

    const reverb = new Tone.Reverb({ decay: 0.8, wet: 1 }).connect(masterEq);
    const reverbReturn = new Tone.Gain(0.2).connect(reverb);

    (Object.values(tracks) as Track[]).forEach((t) => {
      t.channel = new Tone.Gain(t.gain);
      let node: Tone.ToneAudioNode = t.channel;

      if (t.eq) {
        t.eq3 = new Tone.EQ3({
          low: t.eq.low,
          mid: t.eq.mid,
          high: t.eq.high,
          lowFrequency: t.eq.lowFrequency ?? 200,
          highFrequency: t.eq.highFrequency ?? 6800,
        });
        node.connect(t.eq3);
        node = t.eq3;
      }

      if (t.pan !== null) {
        t.panner = new Tone.Panner(t.pan);
        t.panner.channelCount = 2;
        t.panner.channelCountMode = "explicit";
        node.connect(t.panner);
        node = t.panner;
      }

      if (t.reverb !== null) {
        t.reverbSend = new Tone.Gain(t.reverb).connect(reverbReturn);
        t.channel.connect(t.reverbSend);
      }

      node.connect(masterEq);
    });
  }

  // #region Tracks ------------------------------------------------------------------------------------------------------------------------------------

  const tracks = $state<Record<string, Track>>({
    kick:       { schema: kickSchema,       gain: 0.25, pan: null, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    ride:       { schema: rideSchema,       gain: 0.16, pan: 0.5,  eq: defaultEQ,   reverb: null, metaSequence: 0, extraMutations: rideExtraMutations,  message: defaultMessage, reset: 0 },
    toms:       { schema: tomsSchema,       gain: 0.40, pan:-0.2,  eq: null,        reverb: 1,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    snare:      { schema: snareSchema,      gain: 0.18, pan:-0.05, eq: null,        reverb: 1.3,  metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    bass:       { schema: bassSchema,       gain: 0.90, pan: null, eq: null,        reverb: null, metaSequence: 0, extraMutations: bassExtraMutations,  message: defaultMessage, reset: 0 },
    crash:      { schema: crashSchema,      gain: 0.20, pan: null, eq: null,        reverb: 3,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    guitar:     { schema: guitarSchema,     gain: 0.07, pan: 0.2,  eq: null,        reverb: 2,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    sonar:      { schema: sonarSchema,      gain: 1.40, pan: null, eq: null,        reverb: 1,    metaSequence: 0, extraMutations: sonarExtraMutations, message: defaultMessage, reset: 0 },
    voice:      { schema: voiceSchema,      gain: 1.65, pan: null, eq: null,        reverb: 0,    metaSequence: 0, extraMutations: voiceExtraMutations, message: defaultMessage, reset: 0 },
    hiHat:      { schema: hiHatSchema,      gain: 0.60, pan:-0.2,  eq: defaultEQ,   reverb: 1.7,  metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    breakDrums: { schema: breakDrumsSchema, gain: 0.45, pan: null, eq: defaultEQ,   reverb: null, metaSequence: 0, extraMutations: bDExtraMutations,    message: defaultMessage, reset: 0 },
    synth:      { schema: synthSchema,      gain: 0.90, pan: null, eq: defaultEQ,   reverb: 5,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    piano:      { schema: pianoSchema,      gain: 1.60, pan: null, eq: null,        reverb: null, metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    tambourine: { schema: tambourineSchema, gain: 0.35, pan: null, eq: defaultEQ,   reverb: null, metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
  });

  // #endregion

  function setSeq(track: keyof typeof tracks, seq: number) {
    tracks[track].metaSequence = seq;
    tracks[track].reset++;
  }

  function setParam(
    track: keyof typeof tracks,
    param: ParamName,
    value: number,      // -1..1 for low/mid/high, raw value for gain/pan/reverb
    rampBeats: number = 0
  ) {
    const t = tracks[track];

    const node = {
      gain:   t.channel?.gain,
      pan:    t.panner?.pan,
      low:    t.eq3?.low,
      mid:    t.eq3?.mid,
      high:   t.eq3?.high,
      reverb: t.reverbSend?.gain,
    }[param];

    if (!node) return;

    const isEq = param === 'low' || param === 'mid' || param === 'high';
    const target = isEq ? positionToDb(value, ...EQ_RANGE[param]) : value;
    const rampTime = rampBeats * beatTime;

    rampTime > 0 ? node.rampTo(target, rampTime) : (node.value = target);
  }

  function setIsolator(values: [number, number, number], rampBeats: number = 0) {
    const [low, mid, high] = values;
    const rampTime = rampBeats * beatTime;

    const targets = {
      low:  positionToDb(low,  ...ISOLATOR_RANGE.low),
      mid:  positionToDb(mid,  ...ISOLATOR_RANGE.mid),
      high: positionToDb(high, ...ISOLATOR_RANGE.high),
    };

    (['low', 'mid', 'high'] as const).forEach((band) => {
      rampTime > 0
        ? masterEq[band].rampTo(targets[band], rampTime)
        : (masterEq[band].value = targets[band]);
    });
  }

  // --- Setup on mount ---
  onMount(async () => {
    if (typeof window === "undefined") return;

    buildAudioGraph();
    setSongStructure();
    setTrackScheduling();

    sequencerReady = true;
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    Tone.Transport.stop();
    Tone.Transport.cancel();
  });

  // --- Play / Stop ---
  async function togglePlay() {
    if (playing) {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        playing = false;
        return;
    }
    await Tone.start();
    Tone.Transport.bpm.value = bpm;

    Tone.Transport.scheduleRepeat((t) => {
      beat++;
      time = t;

      const paramEvents = paramScheduling.filter(e => e.beat === beat);
      for (const e of paramEvents) {
          setParam(
              e.track,
              e.param,
              e.value,
              e.rampBeats ?? 0
          );
      }

      const seqEvents = sequenceScheduling.filter(e => e.beat === beat);
      for (const e of seqEvents) {
          setSeq(e.track, e.seq);
      }

    }, beatTime);

    Tone.Transport.start();
    playing = true;
  }
</script>

{#if sequencerReady}
  {#each Object.entries(tracks) as [name, track] (name)}
    <StochasticSequencer
      sampleSchema={track.schema}
      extraMutations={track.extraMutations}
      {beat}
      metaSequenceIndex={track.metaSequence}
      channel={track.channel!}
      {time}
      beatDuration={beatTime}
      {seed}
      bind:message={track.message}
      bind:reset={track.reset}
    />
  {/each}
{/if}

<div class="message">
  {#each Object.values(tracks) as track}
    <div class="messageDiv">
      <div>
        {#each track.message[0] as sequenceIndex, j}
          <p class={j === track.message[1] ? "pulsate" : ""}>{sequenceIndex}</p>
        {/each}
      </div>
      <div>
        {#each track.message[2] as beatName, j}
          <p class={j + 1 === track.message[3] ? "pulsate" : ""}>{beatName}</p>
        {/each}
      </div>
    </div>
  {/each}
</div>

<p class="white">{beat}</p>

<button
  class="play-btn"
  class:active={playing}
  onclick={togglePlay}
>
  {playing ? "■ stop" : "▶ play"}
</button>

<style>
  :global(body) {
    margin: 0;
    background: #0a0a0a;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 100vh;
    font-family: "Courier New", monospace;
  }

  .play-btn {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    border: 1px solid #444;
    color: #ccc;
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    padding: 0.5rem 2rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .play-btn:hover {
    border-color: #fff;
    color: #fff;
  }

  .play-btn.active {
    border-color: #f00;
    color: #f00;
  }

  .message {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    width: 100%;
  }

  .messageDiv {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .messageDiv > div:first-child {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 26%;
    padding-left: 1rem;
  }

  .messageDiv > div:last-child {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 66.666%;
  }

  .messageDiv > div > p {
    color: #646464;
    transition: color ease-in-out 0.1s;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .messageDiv > div > .pulsate {
    color: #fff;
    animation: pulsate 0.5s ease-out;
    border: 0.5px solid transparent;
  }

  @keyframes pulsate {
    0%   { background-color: transparent; border: 0.5px solid #444; }
    100% { background-color: transparent; border: 0.5px solid transparent; }
  }
</style>