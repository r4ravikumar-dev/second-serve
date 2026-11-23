// Minimal inline icons (stroke 1.5 per DNA iconStroke/150). currentColor = token colour of parent.
type P = { className?: string };
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconBag = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
export const IconTicket = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z" /><path d="M14 7v10" /></svg>);
export const IconBox = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" /><path d="m4 8 8 4 8-4M12 12v8" /></svg>);
export const IconSpark = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>);
export const IconCheck = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="m5 12 4 4 10-10" /></svg>);
export const IconChart = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const IconHeart = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /></svg>);
export const IconShield = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconStore = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M4 10v10h16V10M3 10l2-6h14l2 6H3Z" /><path d="M10 20v-5h4v5" /></svg>);
export const IconMic = ({ className }: P) => (<svg {...base} className={className} aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const IconX = ({ className }: P) => (<svg {...base} className={className} aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>);
