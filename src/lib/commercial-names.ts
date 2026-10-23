import reviewed from "../data/commercial-models.json";

// Keep '+' and decimal specifications significant (Ka and Ka+ are different).
export const modelLabelKey = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export function commercialModelName(brand: string, model: string) {
  const family = reviewed.families.find(
    (item) =>
      modelLabelKey(item.brand) === modelLabelKey(brand) &&
      item.members.some(
        (member) => modelLabelKey(member.label) === modelLabelKey(model),
      ),
  );
  return family?.name ?? model;
}
