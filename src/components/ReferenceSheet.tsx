import { MathText } from './MathText';

/** Math uchun formulalar varag'i (markaz tomonidan tuzilgan qisqa ro'yxat). */
const ITEMS: Array<[string, string]> = [
  ['Doira', '$A = \\pi r^2$, $\\quad C = 2\\pi r$'],
  ["To'g'ri to'rtburchak", '$A = \\ell w$'],
  ['Uchburchak', '$A = \\tfrac{1}{2}bh$'],
  ['Pifagor teoremasi', '$c^2 = a^2 + b^2$'],
  ['Maxsus uchburchaklar', '$30^\\circ\\!-\\!60^\\circ\\!-\\!90^\\circ$: $\\;x,\\ x\\sqrt{3},\\ 2x$ $\\quad 45^\\circ\\!-\\!45^\\circ\\!-\\!90^\\circ$: $\\;s,\\ s,\\ s\\sqrt{2}$'],
  ["To'g'ri burchakli parallelepiped", '$V = \\ell w h$'],
  ['Silindr', '$V = \\pi r^2 h$'],
  ['Shar', '$V = \\tfrac{4}{3}\\pi r^3$'],
  ['Konus', '$V = \\tfrac{1}{3}\\pi r^2 h$'],
  ['Piramida', '$V = \\tfrac{1}{3}\\ell w h$'],
  ['Burchaklar', "Aylana yoyi $360^\\circ$ ($2\\pi$ radian); uchburchak burchaklari yig'indisi $180^\\circ$"],
  ['Kvadrat tenglama', '$x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'],
  ['Qiyalik', '$m = \\dfrac{y_2 - y_1}{x_2 - x_1}$'],
  ['Aylana tenglamasi', '$(x - h)^2 + (y - k)^2 = r^2$'],
];

export function ReferenceSheet() {
  return (
    <div className="flex flex-col gap-2">
      {ITEMS.map(([name, f]) => (
        <div key={name} className="rounded-xl bg-soft p-3">
          <div className="mb-1 text-xs font-semibold text-hint">{name}</div>
          <MathText text={f} />
        </div>
      ))}
    </div>
  );
}
