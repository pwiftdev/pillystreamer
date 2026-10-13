import {
  character,
  compose,
  EXPRESSIONS,
  MOUTHS,
  HPC,
} from "/mascot.js-source";

const roomOverrides = { happy: { mouth: "smile" }, "in-love": { fx: [] } };

export const roomExpressions = Object.fromEntries(
  Object.entries(EXPRESSIONS).map(([id, options]) => [
    id,
    {
      eyes: ["open", "open"],
      mouth: "grin",
      blush: true,
      ...options,
      ...roomOverrides[id],
    },
  ]),
);

export function roomCharacter(headphones) {
  const color = HPC[headphones] || HPC.Green;
  const parts = (items, names) =>
    compose(
      items.filter(({ L }) => names.includes(L.name)),
      color,
    );
  const group = (id, content) => `<g id="${id}" display="none">${content}</g>`;
  const base = character({});
  let eyes = "",
    extras = "";
  for (const [id, options] of Object.entries(roomExpressions)) {
    const items = character(options);
    eyes += group(`pl-ex-${id}`, parts(items, ["eyes"]));
    extras += group(
      `pl-xb-${id}`,
      parts(items, ["brows", "glasses", "fx-shapes", "fx-lines"]),
    );
  }
  const mouths = Object.keys(MOUTHS)
    .map((mouth) =>
      group(`pl-m-${mouth}`, parts(character({ mouth }), ["mouth"])),
    )
    .join("");
  return (
    parts(base, [
      "body",
      "headphones-band",
      "headphones-cups",
      "headphones-mic",
    ]) +
    `<g id="pl-blush">${parts(base, ["blush"])}</g>` +
    `<g id="pl-face"><g id="pl-eyes">${eyes}</g>${extras}${mouths}</g>`
  );
}
