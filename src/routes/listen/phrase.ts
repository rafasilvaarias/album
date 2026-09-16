import { mulberry32 } from "$lib/assets/mulberry32";

const phrases = [
    {phrase: "A fox jumps over the sea", url: "www.youtube.com"},
    {phrase: "Fuck", url: "www.youtube.com"},
    {phrase: "Youtube", url: "www.youtube.com"},
    {phrase: "President Trump is a crackhead", url: "www.youtube.com"},
    {phrase: "Motherfucking Nature", url: "www.youtube.com"}
];

export function getPhrase(seed: number) {
    const rand = mulberry32(seed);
    const index = Math.floor(rand() * phrases.length);
    return phrases[index];
}