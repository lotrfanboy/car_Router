import reviewed from "../data/commercial-models.json";

// Keep '+' and decimal specifications significant (Ka and Ka+ are different).
export const modelLabelKey = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const names = new Map(
  reviewed.families.flatMap((family) =>
    family.members.map(
      (member) =>
        [
          `${modelLabelKey(family.brand)}:${modelLabelKey(member.label)}`,
          family.name,
        ] as const,
    ),
  ),
);

export function commercialModelName(brand: string, model: string) {
  return names.get(`${modelLabelKey(brand)}:${modelLabelKey(model)}`) ?? model;
}
