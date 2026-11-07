import { convertBijoyToUnicode, hasBengaliUnicode } from 'bijoy2unicode';

// Word / PDF / পুরনো ফাইল থেকে কপি করলে ক্লিপবোর্ডের html অংশে ফন্টের নাম থাকে
const BIJOY_FONT = /sutonny|bijoy/i;

// শুধু তখনই কনভার্ট হবে: Bijoy ফন্টে কপি হয়েছে এবং লেখায় আগে থেকে Unicode বাংলা নেই
export function isBijoyPaste(html = '', text = '') {
  if (!text || hasBengaliUnicode(text)) return false;
  return BIJOY_FONT.test(html);
}

export const bijoyToUnicode = (text) => convertBijoyToUnicode(text);