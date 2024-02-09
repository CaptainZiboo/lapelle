export function getDateFromString(value: string) {
  const [valueH, valueM] = value.split(":").map(Number);
  const valueT = new Date();
  valueT.setHours(valueH, valueM, 0);
  return valueT;
}

export const days = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export type Day = (typeof days)[number];

export function getDay(date: Date = new Date()) {
  let index = date.getDay() - 1;
  let number = date.getDate();
  if (index === -1) {
    index = days.length - 1;
  }
  return {
    index,
    number,
    name: days[index],
  };
}

export const month = [
  "Janvier",
  "Févriver",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function getMonth(date: Date = new Date()) {
  let index = date.getMonth();
  return {
    index,
    number: index + 1,
    name: month[index],
  };
}

export function getYear(date: Date = new Date()) {
  return date.getFullYear();
}
