export interface Bot { id: string; name: string; label: string; needs: number; unread: number }
export interface Message { id: string; bot_id: string; text: string; status: 'pending' | 'sent' | 'failed' | 'replied' | 'timeout' | 'queued'; reply_short: string | null; created_at: number; replied_at: number | null }
export interface Need { id: string; bot_id: string; bot_name: string; kind: string; title: string; detail: string; created_at: number; action: string | null }
