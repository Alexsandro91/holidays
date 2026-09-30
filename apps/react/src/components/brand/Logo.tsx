interface LogoProps {
  className?: string
}

/** Sole sull'orizzonte: il segno di Holidays. Decorativo, il nome dell'app è sempre nel testo vicino. */
const Logo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M3 17h18" />
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M12 6.5V8.5" />
    <path d="M5.9 9.4l1.4 1.4" />
    <path d="M18.1 9.4l-1.4 1.4" />
    <path d="M6.5 20.5h11" />
  </svg>
)

export default Logo
