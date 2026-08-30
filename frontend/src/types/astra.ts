export type IncidentStatus = 'started' | 'paused' | 'resolved' | 'failed'

export interface AstraIncident {
  thread_id: string
  alert_name: string
  pod: string
  namespace: string
  diagnosis: string
  severity: string
  tool: string
  confidence: number
  investigation_summary: string
  tool_result: string
  status: IncidentStatus
  created_at: string
}
