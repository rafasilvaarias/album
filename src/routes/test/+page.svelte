<script lang="ts">
  import { mulberry32 } from "$lib/assets/mulberry32";
  const random = mulberry32(Math.floor(Math.random() * 10000));

  let songStructure : {section : string, time: number, start: number, end: number}[] = [];
  let sequenceScheduling : any = [];
  let paramScheduling : any = []

  let sum = 0;

  // A = ana cruse, I = intro, V = verse, P = pause, C = climax, O = outro

  // Define beginning section

  if (random() < 0.3) {
    const section = "A";
    const start = sum;
    const time = 4 + (Math.floor(random() * 6))
    sum = sum + time;
    songStructure.push({section, time, start, end: sum});
  }
  
  if (random() < 0.2) {
    const section = "P";
    const timePossibilities = [4, 6];
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
    }
  }

  // Defining closing structure

  if (random() < 0.194){
    const section = "C";
    const timePossibility = [10,12,14,16];
    const start = sum;
    const time = timePossibility[Math.floor(random() * timePossibility.length)] * 16;
    sum = sum + time;
    songStructure.push({section, time, start, end: sum});
  } else {
    const sections = ["C", "O"];
    const cTimePossibility = [8,10,12];
    const oTimePossibility = [2,2,3,4,4,4];
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
    }
  }

  console.log(songStructure);
  console.log("Song Time (Total) -> ",Math.floor(sum * 0.344 / 60),":",Math.floor((sum * 0.344 % 60)*60/100));

  songStructure.forEach((section) => {
    
    //anacruse section
    if (section.section == "A") {
      const seq = random() < 0.3 ? 9 : 8;
      sequenceScheduling.push({beat : section.start, name : 'voice', seq});
      sequenceScheduling.push({beat : section.end, name : 'voice', seq: 0});
    }

    //intro section
    if (section.section == "I") {
      //define type of intro
      let introType : string = "";
      if (section.end - section.start < 6*16) introType = "jam";
      else if (section.end - section.start < 8*16) {
        if (random() < 0.4) introType = "jam";
        else introType = "buildUp";
      } else introType = "buildUp";

      //define the intro
      if (introType == "buildUp"){ //buildup: elements of verse come slowly one by one
        let trackSequence = ['kick','snare','ride','toms'];
        let trackTimes = [0, 0, 0, 0];
        for (let i = 0; i < trackSequence.length; i++){
          trackTimes[i] = (
            (section.start / 16 + 1) 
            + random() * ((section.end / 16 - 1) - (section.start / 16 + 1))
          ) * 16;
          sequenceScheduling.push({beat : trackTimes[i], name : trackSequence[i], seq: 1});
        }
        let lowestTime = Math.min(...trackTimes);
        sequenceScheduling.push({beat: section.start, track: 'bass', seq: 1});
        paramScheduling.push({beat: section.start, track: 'bass'})
      } else if (introType == "jam"){ //jam: cymbal mania before verse
        const tracks = ['tambourine', 'ride', 'hiHat']
        for (let i = 0; i < tracks.length; i++){
          sequenceScheduling.push({beat : section.start, track : tracks[i], param: 'gain', value: tracks.bass.gain, rampBeats: lowestTime/16});
        }
      }

      //grunting in intro
      if (random() < 0.7) { // grunts start
        const time = (section.start + 24) + (random() * ((section.end - 24) - (section.start + 24)))
        sequenceScheduling.push({beat : time, track: 'voice', seq: 2});
      }
    }
  });
</script>