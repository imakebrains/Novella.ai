/* ============================================================
   Randomized starter worlds

   Every install used to open the same filler story, which made a
   new project feel like a demo someone else had already written.
   This builds one instead: a cast, a place, a thing, and a reason,
   drawn from independent pools and assembled into real prose.

   Two rules make it testable and safe:

   1. Pure. The seed comes in from the caller (Date.now() at the
      click, not here), so a given seed always yields byte-identical
      files. No Math.random, no clock, no I/O.

   2. Every combination has to read. The pools are deliberately
      register-matched — realist, timeless, slightly uncanny — and
      the premises are written to take ANY object and ANY second
      character, so nothing can assemble into a mashup. Two further
      constraints hold that together:
        · Place text never names its own terrain (no "valley" in a
          line an island might draw).
        · Prose uses subject pronouns only with past-tense verbs,
          which are identical for she/he/they. "was/were", "has/have"
          and the present tense are avoided for that reason.
   ============================================================ */

import { presetById } from "./presets";

/* ---------- PRNG ---------- */

/** mulberry32 — small, fast, and good enough that adjacent seeds
    (two installs a millisecond apart) diverge completely. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function pick<T>(rand: Rand, pool: readonly T[]): T {
  return pool[Math.floor(rand() * pool.length)]!;
}

/** Two different members of a pool — used where repeating a line
    inside one project would be the tell that it was assembled. */
function pickTwo<T>(rand: Rand, pool: readonly T[]): [T, T] {
  const a = Math.floor(rand() * pool.length);
  let b = Math.floor(rand() * (pool.length - 1));
  if (b >= a) b++;
  return [pool[a]!, pool[b]!];
}

/* ---------- pools ---------- */

interface Person {
  name: string;
  first: string;
  last: string;
  keep: string; // one habit, for the codex sheet
}

interface Second {
  name: string;
  first: string;
  /** Fits the apposition slot: "Name, ROLE, did something." */
  role: string;
}

interface Place {
  name: string;
  kind: string;
  feature: string; // a concrete spot anyone could stand at
  note: string; // always begins "where …", so "A mill town <note>" reads
}

interface Thing {
  noun: string;
  the: string;
  intro: string; // a prose sentence introducing it
  detail: string; // a short clause, for plot cards and the codex
}

interface Tone {
  name: string;
  air: string; // a standalone sentence about the weather or light
  hour: string; // a time phrase that can sit mid-sentence
}

const PEOPLE: readonly Person[] = [
  { name: "Iris Fenn", first: "Iris", last: "Fenn", keep: "Reads the last page first, and lies about it." },
  { name: "August Mears", first: "August", last: "Mears", keep: "Counts doorways. Has done since childhood and cannot say why." },
  { name: "Nell Harrow", first: "Nell", last: "Harrow", keep: "Answers questions with the second-truest thing available." },
  { name: "Sylvie Ardan", first: "Sylvie", last: "Ardan", keep: "Keeps every receipt, and could not tell you what for." },
  { name: "Cormac Vale", first: "Cormac", last: "Vale", keep: "Cleans other people's kitchens when the talk turns serious." },
  { name: "Juno Bell", first: "Juno", last: "Bell", keep: "Learns names on the first hearing and never uses them." },
  { name: "Theo Sandaker", first: "Theo", last: "Sandaker", keep: "Walks the long way round to arrive at the right temperature." },
  { name: "Marlow Quist", first: "Marlow", last: "Quist", keep: "Carries a pencil and no paper, on principle." },
  { name: "Edith Crane", first: "Edith", last: "Crane", keep: "Finishes other people's sentences silently, to check." },
  { name: "Rafe Okonjo", first: "Rafe", last: "Okonjo", keep: "Apologises first, decides later whether it was owed." },
  { name: "Beatrix Nye", first: "Beatrix", last: "Nye", keep: "Sleeps with the curtains open and the door locked." },
  { name: "Isaac Pell", first: "Isaac", last: "Pell", keep: "Repeats the important word back, slightly wrong, to see what happens." },
  { name: "Solveig Rask", first: "Solveig", last: "Rask", keep: "Eats standing up. Sits down only for bad news." },
  { name: "Emory Cato", first: "Emory", last: "Cato", keep: "Writes the date on everything, including things nobody will keep." },
  { name: "Hattie Brune", first: "Hattie", last: "Brune", keep: "Laughs a half-beat after everyone else, having checked." },
  { name: "Lucian Vey", first: "Lucian", last: "Vey", keep: "Never sits with a door behind, and pretends that means nothing." },
  { name: "Rosalind Tam", first: "Rosalind", last: "Tam", keep: "Corrects small facts and lets large ones stand." },
  { name: "Caspar Whitlow", first: "Caspar", last: "Whitlow", keep: "Whistles when lying. Everyone knows. He has not been told." },
];

const SECONDS: readonly Second[] = [
  { name: "Ondine Marsh", first: "Ondine", role: "who keeps the parish records" },
  { name: "Gideon Rell", first: "Gideon", role: "the solicitor from the next town over" },
  { name: "Peg Torrance", first: "Peg", role: "who owns the shop and therefore the news" },
  { name: "Vasily Orr", first: "Vasily", role: "who buys and sells things with no questions attached" },
  { name: "Constance Bly", first: "Constance", role: "the schoolteacher, thirty years in" },
  { name: "Milo Fetch", first: "Milo", role: "a lodger with one suitcase and no plans" },
  { name: "Agnes Hoyle", first: "Agnes", role: "the doctor's widow" },
  { name: "Barnaby Sisk", first: "Barnaby", role: "who drives the only van that goes anywhere" },
  { name: "Thea Loveless", first: "Thea", role: "a cousin nobody had thought to mention" },
  { name: "Hollis Dray", first: "Hollis", role: "the constable, more or less retired" },
  { name: "Ivy Sorrel", first: "Ivy", role: "who rents the room above the shop" },
  { name: "Ambrose Kite", first: "Ambrose", role: "who came back after everyone had assumed otherwise" },
  { name: "Mercy Wolfe", first: "Mercy", role: "the last of a family that used to own most of the land here" },
  { name: "Douglas Fane", first: "Douglas", role: "who used to work for the family and stopped without saying so" },
];

const PLACES: readonly Place[] = [
  { name: "Ashgate", kind: "mill town", feature: "the mill race", note: "where the water still runs the colour of a dye they stopped making in 1961" },
  { name: "Coldbeck", kind: "moor village", feature: "the drove road", note: "where the road is older than any building standing beside it" },
  { name: "Sennen Bar", kind: "fishing village", feature: "the harbour wall", note: "where the tide takes the lower street twice a day and gives it back" },
  { name: "Marrowfield", kind: "farming parish", feature: "the church steps", note: "where the fields are all named and most of the people are not" },
  { name: "Tinsley Vale", kind: "railway town", feature: "the viaduct", note: "where the trains stopped coming and the viaduct stayed anyway" },
  { name: "Ostrey Island", kind: "island", feature: "the lighthouse stair", note: "where the boat comes on Thursdays, weather permitting" },
  { name: "Larkmoor", kind: "hill village", feature: "the reservoir path", note: "where the water covers an older village with the same name" },
  { name: "Braithe", kind: "slate town", feature: "the quarry road", note: "where the hills were taken away in pieces and sold south" },
  { name: "Hollow Hythe", kind: "marsh town", feature: "the sea wall", note: "where the maps have to be redrawn every few winters" },
  { name: "Verrin", kind: "border town", feature: "the customs house", note: "where two countries have taken turns owning the same street" },
  { name: "Ackworth", kind: "spa town", feature: "the pump room", note: "where the water was famous once and is only water now" },
  { name: "Peldon Cross", kind: "crossroads village", feature: "the milestone", note: "where four roads meet and none of them slow down" },
  { name: "Sable Wick", kind: "coastal town", feature: "the pier", note: "where the pier lost its far end in a storm and kept the rest" },
  { name: "Kestrel Ford", kind: "river town", feature: "the ford", note: "where the river decides each spring whether the bridge was necessary" },
];

const THINGS: readonly Thing[] = [
  { noun: "compass", the: "the compass", intro: "A brass compass, heavier than it looks, with a needle that has settled on something other than north.", detail: "the lid is scratched inside with initials that fit nobody in the family" },
  { noun: "ledger", the: "the ledger", intro: "A ledger bound in green cloth, ruled for money, filled instead with names and dates and one column nobody troubled to label.", detail: "the unlabelled column runs to three figures and never repeats" },
  { noun: "coat", the: "the coat", intro: "A winter coat, good wool, long in the arm, with one pocket sewn shut from the inside.", detail: "the stitching on the shut pocket is recent and done left-handed" },
  { noun: "key", the: "the key", intro: "A door key with a paper tag, and on the tag a house number higher than any house on the street.", detail: "the tag is written in a hand that stops halfway through the last digit" },
  { noun: "photograph", the: "the photograph", intro: "A photograph of six people on a step, and a seventh shadow with nobody to belong to.", detail: "the shadow falls the wrong way for the light in the rest of the frame" },
  { noun: "ring", the: "the ring", intro: "A signet ring worn nearly smooth, the crest gone, the inside still sharp with an engraved date.", detail: "the engraved date is four years after the last person who could have worn it" },
  { noun: "tin", the: "the tin", intro: "A biscuit tin with the lid taped down and, inside, sorted and rubber-banded, other people's letters.", detail: "none of the letters were sent and all of them were answered" },
  { noun: "violin", the: "the violin", intro: "A violin with a label inside naming a maker who never existed, and a repair no one living could do.", detail: "the repair uses a wood that does not grow within a thousand miles" },
  { noun: "map", the: "the map", intro: "A survey map folded to one corner, with a field marked in pencil that the printing leaves blank.", detail: "the pencilled field has a boundary and a name and no road to it" },
  { noun: "watch", the: "the watch", intro: "A pocket watch that keeps perfect time and is wrong by exactly eleven minutes.", detail: "it has been wrong by eleven minutes for as long as anyone can remember" },
  { noun: "hymnal", the: "the hymnal", intro: "A hymnal with a name on the flyleaf and, down the margins, a running argument in two hands.", detail: "one hand stops mid-page and the other keeps answering for years" },
  { noun: "knife", the: "the knife", intro: "A working knife honed down to half its width, notched near the heel the way a tally is notched.", detail: "there are nineteen notches and the last one is not finished" },
  { noun: "packet", the: "the packet", intro: "A seed packet with the printing worn off, still sealed, and heavier than seed has any business being.", detail: "it weighs what a handful of gravel weighs and rattles like nothing at all" },
  { noun: "letter", the: "the letter", intro: "A letter still in its envelope, addressed in a careful hand, with no year anywhere in the postmark.", detail: "the paper is old and the ink has not finished going brown" },
];

const TONES: readonly Tone[] = [
  { name: "Cold and clear", air: "The frost had held all week and the light came off it hard.", hour: "before eight" },
  { name: "Rain", air: "It had rained since Tuesday and had stopped pretending it might stop.", hour: "in the last of the afternoon" },
  { name: "Fog", air: "The fog came in over the low ground and took the far end of everything.", hour: "an hour before first light" },
  { name: "Late summer", air: "It came to the end of a hot month and the grass went the colour of paper.", hour: "in the flat part of the afternoon" },
  { name: "First snow", air: "The first snow came early and lightly, and nothing had decided yet whether to keep it.", hour: "just after dark" },
  { name: "Wind", air: "The wind had been up three days and everyone had begun talking louder than they needed to.", hour: "at the turn of the evening" },
  { name: "Thaw", air: "The thaw started overnight and the whole place ran with water it could not use.", hour: "at midmorning" },
  { name: "Long dusk", air: "The evenings had begun to hold on past nine, which made people restless.", hour: "in the long part of the dusk" },
  { name: "Heat", air: "The heat settled early and stayed low to the ground like something owed.", hour: "at noon, with nothing moving" },
  { name: "Storm coming", air: "The pressure fell all day and the birds went quiet about it.", hour: "in the hour before the weather" },
  { name: "After rain", air: "The rain passed in the night and left everything sharper than it had been.", hour: "early, with the ground still dark" },
  { name: "Grey", air: "It stayed the kind of grey that never becomes anything, and it had done for a fortnight.", hour: "at some hour in the middle of the day" },
];

/* The cast, once drawn. Every template below takes exactly this. */
interface Cast {
  hero: Person;
  second: Second;
  place: Place;
  thing: Thing;
  tone: Tone;
}

interface Premise {
  thread: string; // plot-board column id
  hook: (c: Cast) => string; // the trouble, landing in chapter one
  beat: (c: Cast) => string; // what chapter two does with it
  question: (c: Cast) => string; // for the notes file
}

/* Written object-agnostically on purpose: each of these has to work
   with a violin and with a seed packet, or the pools stop being
   independent and the combination count collapses. */
const PREMISES: readonly Premise[] = [
  {
    thread: "what-came-back",
    hook: (c) => `${cap(c.thing.the)} went into the ground with the coffin. Three weeks later it sat on the kitchen table, dry.`,
    beat: (c) => `${c.second.first} admitted to having been at the house that week, and to nothing else.`,
    question: (c) => `Who opened the ground, and who wanted ${c.hero.first} to know it had been opened?`,
  },
  {
    thread: "the-wrong-name",
    hook: (c) => `${cap(c.thing.the)} carried a name belonging to nobody ${c.hero.first} had ever met, and ${c.second.first} went quiet at the sound of it.`,
    beat: (c) => `${c.second.first} gave ${c.hero.first} an account of the name that stayed true in every particular and false as a whole.`,
    question: (c) => `Whose name is it, and what was ${c.second.first} promised for keeping it quiet?`,
  },
  {
    thread: "the-offer",
    hook: (c) => `${c.second.name} offered money for ${c.thing.the} — more than it could be worth — and would not say on whose behalf.`,
    beat: (c) => `The offer doubled, and the deadline inside it had been set before ${c.hero.first} ever refused.`,
    question: () => `Who is buying, and what do they know that makes the price sensible?`,
  },
  {
    thread: "the-second-one",
    hook: (c) => `There turned out to be another. ${cap(c.thing.the)} had a twin, identical down to the damage, and ${c.hero.first} had seen it in ${c.place.name} inside the month.`,
    beat: (c) => `${c.hero.first} found the second one sitting where the first one should have been.`,
    question: (c) => `Which of them came first, and does the answer matter to anyone but ${c.hero.first}?`,
  },
  {
    thread: "the-fire-that-wasnt",
    hook: (c) => `${cap(c.thing.the)} appeared on an inventory of things lost in a fire — a fire ${c.place.name} kept no record of, in a year ${c.place.name} remembered perfectly well.`,
    beat: (c) => `The inventory turned out to have a second page, and ${c.second.first} had been holding it.`,
    question: () => `What burned, and who needed the burning written down?`,
  },
  {
    thread: "the-agreed-story",
    hook: (c) => `Everyone in ${c.place.name} told the same story about the winter the water came up. ${cap(c.thing.the)} carried a detail too small to have been invented, and it did not fit.`,
    beat: (c) => `${c.second.first} told the agreed version twice, word for word, which was how ${c.hero.first} knew it had been learned rather than remembered.`,
    question: () => `What did the town decide to say, and who decided it for them?`,
  },
  {
    thread: "the-debt",
    hook: (c) => `${c.second.name} said ${c.thing.the} had stood as collateral. The loan it secured was being called in, and the paper carried the ${c.hero.last} name.`,
    beat: (c) => `The lender's agent came as far as ${c.place.feature}, polite, carrying a copy of everything.`,
    question: () => `Who borrowed, and what did the money go and do?`,
  },
  {
    thread: "the-parcel",
    hook: (c) => `${cap(c.thing.the)} came by post, no sender, and the address had been written in ${c.hero.first}'s own hand.`,
    beat: () => `A card announced a second parcel and gave a date a week out.`,
    question: (c) => `Who can forge a hand that well, and why give ${c.hero.first} the warning?`,
  },
  {
    thread: "moved-and-moved-back",
    hook: (c) => `Nothing left the house. But ${c.thing.the} had been moved and put back badly, twice, by somebody with a key.`,
    beat: (c) => `${c.hero.first} left the house exactly as it stood for a day, and came back to one thing changed.`,
    question: (c) => `What are they looking for, and how will ${c.hero.first} know when they have found it?`,
  },
  {
    thread: "the-witness",
    hook: (c) => `${c.second.name} was the only person who could say where ${c.thing.the} had spent that night, and the account had quietly changed twice.`,
    beat: (c) => `${c.second.first} offered a third version, better than the first two, and asked ${c.hero.first} to prefer it.`,
    question: (c) => `What is ${c.second.first} protecting, and is it a person?`,
  },
  {
    thread: "the-condition",
    hook: (c) => `The will left ${c.hero.first} nothing but ${c.thing.the}, on the condition that it never leave ${c.place.name}. That was the document's only careful sentence.`,
    beat: (c) => `${c.hero.first} tested the clause as far as the parish boundary, and found somebody already waiting there.`,
    question: () => `What happens if it leaves, and who wrote a clause to make sure it could not?`,
  },
  {
    thread: "too-old",
    hook: (c) => `${cap(c.thing.the)} ran older than anyone in ${c.place.name} could account for, and showed no wear at all.`,
    beat: (c) => `${c.second.first} produced a photograph in which it already looked old.`,
    question: () => `Has it been kept, or replaced — and if replaced, how often?`,
  },
  {
    thread: "the-earlier-record",
    hook: (c) => `The parish record of ${c.place.name}, dated well before ${c.hero.first} was born, described a person holding ${c.thing.the}. The description was exact.`,
    beat: (c) => `${c.hero.first} found that entry copied out in a modern hand, tucked into the back of a book ${c.second.first} lent and had since asked for.`,
    question: () => `A coincidence with a long reach, or a plan with a long memory?`,
  },
  {
    thread: "please-return-it",
    hook: (c) => `A letter asked for ${c.thing.the} back. It stayed polite throughout, it went unsigned, and it listed the days on which ${c.hero.first} would not be home.`,
    beat: (c) => `The days on the list stopped matching ${c.hero.first}'s week and started matching ${c.second.first}'s.`,
    question: () => `Who has been keeping the calendar, and how long have they had it?`,
  },
];

type Line = (c: Cast) => string;

const OPENINGS: readonly Line[] = [
  (c) => `${c.tone.air} ${c.hero.first} came down to ${c.place.feature} anyway, ${c.tone.hour}, and stood there long enough to be noticed.`,
  (c) => `${c.tone.air} From ${c.place.feature}, ${c.place.name} looked like somewhere that had never done anything worth hiding.`,
  (c) => `${c.tone.air} Nobody in ${c.place.name} locks anything, which was how ${c.hero.first} knew, ${c.tone.hour}, that somebody had gone to the trouble.`,
  (c) => `${c.hero.first} walked out to ${c.place.feature} ${c.tone.hour}, because the house had stopped being somewhere to sit. ${c.tone.air}`,
  (c) => `${c.tone.air} ${c.place.name} took it the way it takes everything, without comment, and ${c.hero.first} did the same for as long as that held.`,
  (c) => `Two roads leave ${c.place.name} and ${c.hero.first} had spent a fortnight using neither. ${c.tone.air}`,
  (c) => `The house had stood empty a month and still smelled of somebody. ${c.tone.air} ${c.hero.first} opened the windows ${c.tone.hour} and let ${c.place.name} in.`,
  (c) => `${c.tone.air} ${c.hero.first} had meant to be gone by now. That was the shape of the whole year: meaning to.`,
  (c) => `${c.tone.air} ${c.hero.first} had learned to tell the hour by ${c.place.feature}, and it ran later than it should have.`,
  (c) => `Everyone in ${c.place.name} knew already. ${c.tone.air} ${c.hero.first} could feel the knowing at ${c.place.feature}, the way a room changes when a door opens.`,
  (c) => `${c.tone.air} ${c.hero.first} had not slept, and ${c.tone.hour} the sleeplessness stopped being a complaint and turned into a decision.`,
  (c) => `${c.tone.air} ${c.hero.first} stopped at ${c.place.feature} ${c.tone.hour} to make certain of a thing already certain.`,
];

const ENTRANCES: readonly Line[] = [
  (c) => `reached ${c.place.feature} before ${c.hero.first} did`,
  () => `came up the path without knocking, twice, and waited to be let in the second time`,
  () => `arrived with something wrapped in a tea towel and would not put it down`,
  (c) => `had been asking after ${c.hero.first} in the shop, in the friendly register people keep for that`,
  (c) => `caught up at ${c.place.feature} and walked the rest of the way as though it had been arranged`,
  () => `left a note, then came in person the same afternoon to make sure of the note`,
  () => `stood in the doorway with the light behind and did not come in`,
  () => `turned up at the end of the day with a bottle and an old grievance`,
  (c) => `sat in the kitchen when ${c.hero.first} came back, and the kettle had already boiled`,
  () => `walked in mid-sentence, finishing an argument begun somewhere else`,
  (c) => `sent word ahead, which nobody in ${c.place.name} does, and then came anyway`,
  (c) => `waited at ${c.place.feature} until the cold made it a point`,
];

const SECOND_LINES: readonly Line[] = [
  (c) => `Whatever ${c.second.first} had come for, it was not the weather.`,
  (c) => `${c.second.first} had the manner of somebody who had rehearsed the first thing and nothing after it.`,
  (c) => `There existed a version of this conversation ${c.second.first} had wanted, and this one kept failing to become it.`,
  (c) => `${c.hero.first} offered tea, which is how it is done here, and got a long answer to a short question.`,
  (c) => `${c.second.first} looked at ${c.thing.the} once, briefly, the way you look at something already seen.`,
  (c) => `Nothing ${c.second.first} said was untrue. None of it was the reason either.`,
];

const CLOSERS: readonly Line[] = [
  (c) => `${c.hero.first} put it back in the drawer, and left the drawer open.`,
  () => `There were two ways to do this. Only one of them stayed quiet.`,
  (c) => `By morning ${c.hero.first} had decided, and by the afternoon had started lying about when.`,
  (c) => `Nothing happened for eleven days. ${c.hero.first} counted them.`,
  (c) => `${c.hero.first} said nothing, which ${c.second.first} took, correctly, as an answer.`,
  (c) => `It would have been easy to let it go. ${c.hero.first} took the first step away from that.`,
  () => `The house settled around the decision the way houses do, one board at a time.`,
  (c) => `${c.hero.first} wrote the date down. It seemed worth having a beginning marked.`,
  (c) => `Somewhere in ${c.place.name}, somebody else stayed awake too, and that was the whole trouble.`,
  (c) => `${c.hero.first} locked the door, for the first time in a lifetime of not locking it.`,
  (c) => `Whatever this turned out to be, it had started long before ${c.hero.first} was handed it.`,
  (c) => `${c.hero.first} went back inside and did not turn the light on.`,
];

const SECOND_OPENERS: readonly Line[] = [
  (c) => `The week after, ${c.place.name} went back to its own business, which is what ${c.place.name} does with anything it cannot use.`,
  (c) => `${c.hero.first} gave it three days. On the third, the waiting stopped being patience and became something else.`,
  (c) => `${c.tone.air} The second time, ${c.hero.first} went looking on purpose.`,
  (c) => `There is a way of asking questions in ${c.place.name} that does not look like asking. ${c.hero.first} had grown up watching it done and had never had to do it.`,
  () => `The parish records lived in a back room that smelled of damp paper and other people's handwriting.`,
  (c) => `Nothing about ${c.place.feature} had changed, which was the first thing that felt wrong.`,
  (c) => `${c.hero.first} started with what could be proved and ran out of it inside an hour.`,
  (c) => `Two people had already told ${c.hero.first} to leave it alone, and neither had explained what ‘it’ meant.`,
  (c) => `The van goes to town on Tuesdays. ${c.hero.first} went with it, ${c.thing.the} wrapped in a jumper on the seat.`,
  (c) => `${c.tone.air} ${c.hero.first} had begun to notice who looked up and who did not.`,
  (c) => `In ${c.place.name} a thing is either everyone's business or nobody's, and this one had not yet been decided.`,
  (c) => `${c.hero.first} read it again in daylight, which changed nothing except the reading.`,
];

const SECOND_TURNS: readonly Line[] = [
  (c) => `${c.hero.first} let it stand. There is a kind of listening that costs nothing and buys a great deal.`,
  () => `It was the sort of answer that closes a door softly enough to pass for courtesy.`,
  () => `The trouble with a good explanation is how little it leaves to hold.`,
  (c) => `${c.place.name} would have it by evening, in some form, and the form would matter.`,
  (c) => `${c.hero.first} wrote down what had been said, and underneath it what had not.`,
  (c) => `Somebody had thought about this a long time before ${c.hero.first} had.`,
];

/* Chapter two needs somewhere to sit between the answer and the exit,
   or it ends before it has weighed anything. */
const PRESSURES: readonly Line[] = [
  (c) => `By the end of the week two other people in ${c.place.name} had mentioned ${c.thing.the} without being asked, which was two more than should have known about it.`,
  (c) => `${c.hero.first} went back through the house room by room and found nothing. It took until dark and settled less than nothing.`,
  () => `The trouble with a small place is that it will tell you everything except the one thing.`,
  () => `A name kept arriving early in every conversation and leaving before the end of it.`,
  (c) => `${c.second.first} stopped calling round. That, more than anything said out loud, was the useful information.`,
  (c) => `${c.hero.first} worked out what walking away would cost, and the number kept coming out lower than it ought to have.`,
  (c) => `Somebody had been careful. Careful people leave a different kind of mark, and ${c.hero.first} started looking for that instead.`,
  (c) => `${c.place.name} in the evening does a convincing impression of somewhere nothing happens.`,
];

const CH1_TITLES: readonly Line[] = [
  (c) => `What ${c.place.name} Keeps`,
  (c) => `The ${cap(c.thing.noun)} on the Table`,
  (c) => `Before ${c.second.first} Came`,
  () => `Nobody Locks Anything`,
  (c) => `${c.hero.first} Comes Back`,
  () => `A Small Weight`,
  () => `The House With the Windows Open`,
  () => `One Thing Out of Place`,
  (c) => `The Wrong ${cap(c.thing.noun)}`,
  (c) => `Late in ${c.place.name}`,
  () => `What Was Left`,
  () => `An Ordinary Week`,
];

const CH2_TITLES: readonly Line[] = [
  () => `Asking Without Asking`,
  (c) => `${c.second.first} Explains`,
  () => `The Second Page`,
  () => `What the Record Says`,
  () => `A Better Version`,
  () => `The Long Way to Town`,
  () => `Three Days`,
  () => `Somebody's Handwriting`,
  () => `The Price of Asking`,
  () => `Everyone Already Knew`,
  (c) => `Back to ${titled(c.place.feature)}`,
  (c) => `What ${c.second.first} Did Not Say`,
];

/* ---------- text helpers ---------- */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Title case that leaves a leading article alone, so a place feature
    can sit inside a chapter title: "Back to the Mill Race". */
const titled = (s: string) =>
  s.split(" ").map((w, i) => (i === 0 ? w : cap(w))).join(" ");

/** Filename-safe, matching the dashed style of the existing seeds. */
const slug = (s: string) =>
  s.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

/** Everything generated goes into YAML double-quoted, because a
    synopsis is allowed to contain a colon and a title is allowed to
    start with a bracket. Cheaper than auditing every pool entry. */
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/* ---------- preset layouts ---------- */

interface Layout {
  chapterDir: string;
  /** Series books want their book in the chapter name; nothing else does. */
  chapterPrefix: string;
  notesPath: string;
  notesName: string;
  notesLead: string;
  lore: boolean;
}

function layoutFor(preset: string): Layout {
  switch (preset) {
    case "series":
      return {
        chapterDir: "Book-1",
        chapterPrefix: "Book 1 — ",
        notesPath: "Notes/Series-Arc.md",
        notesName: "Series Arc",
        notesLead: "Where each book leaves the world, and what the next one inherits.",
        lore: true,
      };
    case "short":
      return {
        chapterDir: "Manuscript",
        chapterPrefix: "",
        notesPath: "Notes/Scratch.md",
        notesName: "Scratch",
        notesLead: "Fragments, cut lines, and the ending you are not sure about yet.",
        lore: false,
      };
    default:
      return {
        chapterDir: "Manuscript",
        chapterPrefix: "",
        notesPath: "Notes/Story-Questions.md",
        notesName: "Story Questions",
        notesLead: "The questions worth answering before chapter ten. Replace them the moment they stop being the real ones.",
        lore: false,
      };
  }
}

/* ---------- the generator ---------- */

/**
 * A whole small project — two chapters of real prose, the codex entries
 * they link to, and a notes file — assembled from `seed`. Same seed in,
 * byte-identical files out; that is what makes it testable.
 */
export function makeStarterWorld(seed: number, preset: string): Array<[string, string]> {
  const rand = mulberry32(seed);

  // Drawn before any branch on preset, so the same seed produces the
  // same cast whichever preset a writer picked.
  const cast: Cast = {
    hero: pick(rand, PEOPLE),
    second: pick(rand, SECONDS),
    place: pick(rand, PLACES),
    thing: pick(rand, THINGS),
    tone: pick(rand, TONES),
  };
  const premise = pick(rand, PREMISES);
  const opening = pick(rand, OPENINGS);
  const entrance = pick(rand, ENTRANCES);
  const secondLine = pick(rand, SECOND_LINES);
  const [closeOne, closeTwo] = pickTwo(rand, CLOSERS);
  const secondOpener = pick(rand, SECOND_OPENERS);
  const secondTurn = pick(rand, SECOND_TURNS);
  const pressure = pick(rand, PRESSURES);
  const title1 = pick(rand, CH1_TITLES)(cast);
  const title2 = pick(rand, CH2_TITLES)(cast);

  const { hero, second, place, thing } = cast;
  const layout = layoutFor(preset);
  const objectThread = `the-${thing.noun}`;

  const chapterOne = [
    opening(cast),
    `${thing.intro} ${premise.hook(cast)}`,
    `[[${second.name}]], ${second.role}, ${entrance(cast)}. ${secondLine(cast)}`,
    closeOne(cast),
  ].join("\n\n");

  const chapterTwo = [
    secondOpener(cast),
    `${premise.beat(cast)} ${secondTurn(cast)}`,
    pressure(cast),
    closeTwo(cast),
  ].join("\n\n");

  const files: Array<[string, string]> = [
    [
      `${layout.chapterDir}/01-${slug(title1)}.md`,
      `---
type: chapter
name: ${q(layout.chapterPrefix + title1)}
order: 1
pov: ${q(`[[${hero.name}]]`)}
synopsis: ${q(`${hero.first} is back in ${place.name} with ${thing.the}, which does not fit the story anyone here tells.`)}
plot:
  ${premise.thread}:
    - ${q(premise.hook(cast))}
  ${objectThread}:
    - ${q(`${cap(thing.the)} is introduced — ${thing.detail}.`)}
---
${chapterOne}
`,
    ],
    [
      `${layout.chapterDir}/02-${slug(title2)}.md`,
      `---
type: chapter
name: ${q(layout.chapterPrefix + title2)}
order: 2
pov: ${q(`[[${hero.name}]]`)}
synopsis: ${q(`${second.first} gives ${hero.first} an answer, and ${hero.first} starts counting what it leaves out.`)}
beats:
  - ${q(premise.beat(cast))}
  - ${q(`${hero.first} stopped asking politely and started asking in the order that gets answers.`)}
plot:
  ${premise.thread}:
    - ${q(premise.beat(cast))}
  ${objectThread}:
    - ${q(`${hero.first} learned what ${thing.the} is worth to somebody else.`)}
---
${chapterTwo}
`,
    ],
    [
      `Codex/Characters/${slug(hero.name)}.md`,
      `---
type: character
name: ${q(hero.name)}
aliases: [${q(hero.first)}, ${q(hero.last)}]
tags: [protagonist]
---
${hero.keep}

Back in [[${place.name}]] on a stay that keeps extending, and holding ${thing.the} — ${thing.detail}. Knows [[${second.name}]] the way everyone here knows everyone, which is to say by reputation and not at all.

What does ${hero.first} want, and what does ${hero.first} tell people instead?

- [ ] Decide what ${hero.first} does with both hands when the truth arrives
- [ ] Give ${hero.first} one thing worth losing
`,
    ],
    [
      `Codex/Characters/${slug(second.name)}.md`,
      `---
type: character
name: ${q(second.name)}
tags: [supporting]
---
In [[${place.name}]]: ${second.role}.

Knew this business before [[${hero.name}]] did, and has decided how much of it to hand over.

What would ${second.first} lose if the whole of it came out?

- [ ] Write the one true thing ${second.first} says by accident
`,
    ],
    [
      `Codex/Locations/${slug(place.name)}.md`,
      `---
type: location
name: ${q(place.name)}
tags: [home]
---
A ${place.kind} ${place.note}. Everything that matters here happens within sight of ${place.feature}.

[[${hero.name}]] grew up on the edge of it and left at the first opportunity.

Who holds power here, and who actually runs it?

What happened here that people still will not discuss in company?
`,
    ],
  ];

  if (layout.lore) {
    files.push([
      `Codex/Lore/The-${slug(cap(thing.noun))}.md`,
      `---
type: lore
name: ${q(`The ${cap(thing.noun)}`)}
---
${thing.intro} Notably, ${thing.detail}.

It came to [[${hero.name}]] without explanation, and [[${place.name}]] holds opinions about it that predate the arrival.

What rule does this object obey, and what does obeying it cost?

- [ ] Decide the one thing about it that must never be explained on the page
`,
    ]);
  }

  files.push([
    layout.notesPath,
    `---
type: note
name: ${q(layout.notesName)}
---
${layout.notesLead}

${premise.question(cast)}

What does [[${hero.name}]] want that [[${second.name}]] cannot give?

What does [[${place.name}]] lose if this comes out?

- [ ] Write the promise chapter one makes
- [ ] Name the thing the reader should dread
- [ ] Decide what the ending costs ${hero.first}
`,
  ]);

  return files;
}

/**
 * What a new project actually gets written into it.
 *
 * "Blank Page" is exempt on purpose: its whole promise is an empty
 * first chapter, and a writer who picked it would not thank us for a
 * story. Every other preset gets a world nobody else will open.
 */
export function starterFiles(seed: number, preset: string): Array<[string, string]> {
  if (preset === "blank") return presetById(preset).files;
  return makeStarterWorld(seed, preset);
}
