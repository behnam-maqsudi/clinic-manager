export type PatientStatus = 'waiting' | 'in_progress' | 'visited' | 'cancelled';
export type UserRole = 'secretary' | 'doctor';

export interface Patient {
  id: number;
  file_number: string;
  full_name: string;
  phone: string;
  national_id: string;
  visit_date: string;
  visit_time: string;
  status: PatientStatus;
  notes: string;
  created_by: UserRole;
  created_at: string;
  updated_at: string;
  attachment_count?: number;
}

export interface PatientInput {
  file_number?: string;
  full_name: string;
  phone?: string;
  national_id?: string;
  visit_date?: string;
  visit_time?: string;
  status?: PatientStatus;
  notes?: string;
  created_by?: UserRole;
  actor_role?: UserRole;
  expected_updated_at?: string;
}

export interface ReturningMatch {
  full_name: string;
  phone: string;
  national_id: string;
  file_number: string;
  latest_id: number;
}

export interface Attachment {
  id: number;
  patient_id: number;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  title: string;
  uploaded_by: string;
  created_at: string;
}

export interface GitUpdateStatus {
  ok: boolean;
  hasRemote: boolean;
  isPackagedApp?: boolean;
  releaseUrl?: string;
  latestTag?: string;
  remoteUrl?: string;
  branch?: string;
  commit?: string;
  behind: number;
  message: string;
}

export interface HealthInfo {
  ok: boolean;
  clinic: string;
  port: number;
  lanIps: string[];
  urls: string[];
  localUrl: string;
}
