import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'

const invitationSchema = z.object({ data: z.object({ name: z.string(), email: z.string(), expires_at: z.string() }) })

export type Invitation = z.infer<typeof invitationSchema>['data']

export interface AcceptInvitationInput {
  password: string
  password_confirmation: string
  privacy_acknowledged: true
}

// Token nel percorso: codificato per sicurezza anche se è alfanumerico
const invitationPath = (token: string): string => `/api/invitations/${encodeURIComponent(token)}`

/** `enabled: false` con una sessione aperta: il server risponderebbe 409 (rotta per ospiti). */
export const useInvitation = (token: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['invitation', token],
    queryFn: async () => (await requestData('GET', invitationPath(token), invitationSchema)).data,
    retry: false,
    staleTime: Infinity,
  })

export const useAcceptInvitation = (token: string) =>
  useMutation({ mutationFn: (input: AcceptInvitationInput) => request('POST', `${invitationPath(token)}/accept`, input) })
