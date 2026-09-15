import { TOKEN_PROTON_TNAME_MAX } from "@/services/tokenProton";

/** Aesthetic placeholder name + 1-7 letter ticker. Lists live in this function. */
export function randomPlaceholderToken(): { name: string; symbol: string } {
  const adj = [
    "astral sidereal stellar cosmic zodiac nebular eclipsed cometary auroral heliacal lunar solar",
    "alchemic auric mercurial sulfuric azothic elixired calcined nigredo albedo rubedo transmuted vitriolic",
    "theurgic numinous seraphic empyrean hallowed hieratic liturgic sanctified orphic anagogic",
    "chthonic stygian infernal tartarean abyssal umbral sepulchral charnel cimmerian plutonic",
    "fey faerie eldritch glamoured twilit seelie unseelie sylvan enchanted enspelled",
    "runic oracular sibylline vatic mantic pythian augural fateful omened prophetic",
    "hermetic gnostic occult arcane esoteric veiled ciphered cabalic mystic hidden",
    "igneous aqueous aetheric telluric tempest volcanic glacial pyric zephyrous stormborn",
    "hexed coven sabbatic bewitched warding sigiled cursed charmed moonlit grimoired",
    "ancestral spectral wraithlike revenant haunted ghostly eidolic phantasmal oneiric liminal",
    "primordial chaotic voidborn elder formless ancient aeonic antediluvian prelunar ylemic",
    "olympian asgardian divine mythic legendary sacred immortal godly apollonian dionysian",
  ]
    .join(" ")
    .split(" ");
  const animals = [
    "phoenix griffin hydra chimera pegasus minotaur harpy cerberus cyclops medusa",
    "fenrir sleipnir nidhogg ratatosk huginn muninn draugr fafnir lindworm garm",
    "ammit apep bennu anubis bastet wadjet sphinx apis taweret serpopard",
    "anzud lamassu pazuzu tiamat sirrush apkallu lilitu utukku kulullu humbaba",
    "kelpie banshee selkie dullahan afanc pooka merrow spriggan cusith leanan",
    "rusalka leshy kikimora firebird gamayun sirin alkonost zmey vila domovoi",
    "qilin kappa tengu oni kitsune baku byakko genbu suzaku fenghuang ryujin tatsu",
    "garuda naga makara yaksha rakshasa hamsa airavata vasuki shesha kinnara",
    "quetzal ahuizotl camazotz cipactli xolotl nagual alux zipacna itzpapalotl xiuhcoatl",
    "simurgh roc peri ifrit djinn manticore homa karkadann zahhak azhdaha",
    "basilisk wyvern cockatrice unicorn dragon leviathan behemoth yale catoblepas hippogriff",
    "thunderbird wendigo bunyip taniwha tikbalang aswang nanka mokele yeti mapinguari",
  ]
    .join(" ")
    .split(" ");
  const a = adj[(Math.random() * adj.length) | 0]!;
  const b = animals[(Math.random() * animals.length) | 0]!;
  const L = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const core = L(b).slice(0, 7);
  const j = L(a).slice(0, 3);
  const symbol = ((Math.random() < 0.5 && core.length < 7 ? j.slice(0, 7 - core.length) : "") + core).slice(0, 7);
  const name = `${a[0]!.toUpperCase()}${a.slice(1)} ${b[0]!.toUpperCase()}${b.slice(1)}`
    .slice(0, TOKEN_PROTON_TNAME_MAX)
    .trim();
  return { name, symbol };
}
