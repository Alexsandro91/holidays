import { z } from 'zod'

// Zod 4 compila gli schemi con new Function() se può: con la CSP di produzione (niente 'unsafe-eval') il tentativo
// fallisce in silenzio ma lascia una violazione in console e nei report. Senza JIT la validazione resta identica.
// Va importato per primo in main.tsx, prima che qualunque schema venga usato
z.config({ jitless: true })
