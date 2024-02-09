export const PascalCase = (value: string) => {
  const words = value.split(" ");
  const capitalizedWords = words.map(
    (word) => word.charAt(0).toUpperCase() + word.slice(1)
  );
  return capitalizedWords.join(" ");
};

export const whitespace = "\u00A0\u00A0\u00A0";
