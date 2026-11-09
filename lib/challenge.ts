// The face check's challenge (face/app.py has the full story), fixed by the ticket: a colour sequence for
// the screen (indexes into COLORS), the oval the face must come closer into ({x, y} its centre and w its
// width, as shares of the mirrored preview), and when to smile (smiles: ms from the colours' start, like the
// snapshot times; one or two, anywhere in the check: holding still at arm's length, coming closer, or held
// close, so neither the moment nor the phase can be rehearsed). All of it reaches the face service from the
// ticket, never the phone.
// No imports, so the phone (FaceCheck) and the tests can use it as is.

export const COLORS = [
  [255, 255, 255],
  [255, 40, 40],
  [40, 255, 40],
  [40, 80, 255],
  [255, 255, 40],
  [255, 40, 255],
  [40, 255, 255],
] as const;
export const FLASH_MS = 400; // per colour: 2.5 changes a second, under WCAG's 3 flashes a second
export const SMILE_MS = 2000; // to smile once asked
export const RELAX_MS = 1400; // after the last smile, to see it go
const SEQUENCE = 8;

export type Challenge = { colors: number[]; oval: { x: number; y: number; w: number }; smiles: number[] };

// ms from the colours' start to the end of the check: the colours, then however long the last smile and its
// relax need (so the check's length varies too).
export const endMs = (c: Challenge) => Math.max(c.colors.length * FLASH_MS + 400, c.smiles.at(-1)! + SMILE_MS + RELAX_MS);

// Web Crypto, not Math.random: Math.random's state can be worked out from its outputs, which would let
// someone predict the next colours. (Modulo bias over 2^32 is nothing at these sizes.)
const random = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function pickChallenge(): Challenge {
  let colors: number[];
  do {
    colors = [];
    // Never the same colour twice in a row; the last is white (the close frames are taken in it, which
    // also lights the face for the embedding), so the one before it isn't.
    while (colors.length < SEQUENCE - 1) {
      const c = random(COLORS.length);
      if (c !== colors.at(-1) && !(colors.length === SEQUENCE - 2 && c === 0)) colors.push(c);
    }
    colors.push(0);
  } while (new Set(colors.filter(Boolean)).size < 3);
  const between = (lo: number, hi: number) => Math.round((lo + (random(1001) / 1000) * (hi - lo)) * 1000) / 1000;
  // Smiles on a 100 ms grid (the phone's snapshot clock). The first anywhere from 0.6 s into the far hold
  // (-400) to past the colours (3600); half the time a second, 1.2-2.4 s after the first one's window closes.
  const ms = (lo: number, hi: number) => lo + random((hi - lo) / 100 + 1) * 100;
  const smiles = [ms(-400, 3600)];
  if (random(2)) smiles.push(smiles[0] + SMILE_MS + ms(1200, 2400));
  // The big oval grows from the small one's centre (FaceCheck's FAR_OVAL), straight out; only its size varies.
  return { colors, oval: { x: 0.5, y: 0.46, w: between(0.66, 0.76) }, smiles };
}
