export function generateRandomString(length: number) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function maskingText(text?: string) {
  if (!text) {
    return text;
  }
  if (text.length <= 4) {
    return text;
  }
  const maskedText = text.slice(0, 2) + "*".repeat(text.length - 4) + text.slice(text.length - 2);
  return maskedText;
}
