import { useState } from 'react'
import { useUserBalances } from '@/features/balances/api'
import AdjustBalanceDialog from '@/features/balances/components/AdjustBalanceDialog'

interface Target {
  id: number
  name: string
}

interface RowAdjustDialogProps {
  /** null = chiuso */
  target: Target | null
  onClose: () => void
}

interface BodyProps extends Target {
  open: boolean
  onClose: () => void
}

const Body = ({ id, name, open, onClose }: BodyProps) => {
  const summary = useUserBalances(id, new Date().getFullYear())
  // Il dialog compare quando i saldi della persona sono arrivati: servono alla scelta del saldo e all'anteprima
  if (summary.data === undefined || !summary.data.applicable) return null
  return <AdjustBalanceDialog userId={id} userName={name} summary={summary.data} open={open} onClose={onClose} />
}

/** Rettifica aperta dal menu di riga della pagina Saldi: legge i saldi della persona e poi mostra il dialog. */
const RowAdjustDialog = ({ target, onClose }: RowAdjustDialogProps) => {
  // Persona conservata durante l'animazione di chiusura
  const [last, setLast] = useState<Target | null>(null)
  if (target !== null && (last === null || last.id !== target.id || last.name !== target.name)) setLast(target)
  return last === null ? null : <Body key={last.id} id={last.id} name={last.name} open={target !== null} onClose={onClose} />
}

export default RowAdjustDialog
