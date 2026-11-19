export interface Env {
  DB: D1Database
  UPLOADS: R2Bucket

  APP_NAME: string
  /** largest accepted upload, in bytes, as a string from wrangler vars */
  MAX_UPLOAD_BYTES: string

  /** secret - protects /admin and the file-download endpoints */
  ADMIN_TOKEN?: string
}

export interface SubmissionRow {
  id: string
  region: string
  name: string
  postal_address: string
  pincode: string
  latitude: number | null
  longitude: number | null
  geo_accuracy_m: number | null
  geo_captured_at: number | null
  has_laptop: number
  instagram: string | null
  facebook: string | null
  twitter: string | null
  bank_name: string
  bank_account_number: string
  bank_ifsc: string
  photo_key: string | null
  photo_type: string | null
  photo_size: number | null
  passbook_key: string | null
  passbook_type: string | null
  passbook_size: number | null
  created_at: number
}
