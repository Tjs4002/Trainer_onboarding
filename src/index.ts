import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, SubmissionRow } from './types'

const app = new Hono<{ Bindings: Env }>()

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const PINCODE = /^[1-9][0-9]{5}$/
const ACCOUNT = /^[0-9]{9,18}$/

const submissionSchema = z.object({
  region: z.enum(['Nashik', 'Wardha'], { errorMap: () => ({ message: 'Please choose a region' }) }),
  name: z.string().trim().min(1, 'Name is required').max(160),
  postal_address: z.string().trim().min(1, 'Postal address is required').max(600),
  pincode: z.string().trim().regex(PINCODE, 'Pincode must be 6 digits'),
  has_laptop: z.enum(['yes', 'no']),
  bank_name: z.string().trim().min(1, 'Bank name is required').max(160),
  instagram: z.string().trim().max(200).optional().default(''),
  facebook: z.string().trim().max(200).optional().default(''),
  twitter: z.string().trim().max(200).optional().default(''),
  bank_account_number: z
    .string()
    .trim()
    .regex(ACCOUNT, 'Account number must be 9 to 18 digits'),
  bank_ifsc: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(IFSC, 'IFSC looks invalid (e.g. HDFC0001234)')),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  geo_accuracy_m: z.coerce.number().min(0).optional(),
  geo_captured_at: z.coerce.number().int().min(0).optional(),
}).refine((d) => d.latitude != null && d.longitude != null, {
  message: 'Please share your location before submitting',
  path: ['latitude'],
})

const ALLOWED_PHOTO = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const ALLOWED_PASSBOOK = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
])

function id(): string {
  return crypto.randomUUID()
}

function extFor(type: string): string {
  switch (type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

/* ------------------------------------------------------------------ *
 * Public: accept a submission
 * ------------------------------------------------------------------ */

app.post('/api/submit', async (c) => {
  const maxBytes = Number(c.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ ok: false, error: 'Expected multipart form data' }, 400)
  }

  const fields = {
    region: form.get('region'),
    name: form.get('name'),
    postal_address: form.get('postal_address'),
    pincode: form.get('pincode'),
    has_laptop: form.get('has_laptop'),
    bank_name: form.get('bank_name'),
    instagram: form.get('instagram') ?? '',
    facebook: form.get('facebook') ?? '',
    twitter: form.get('twitter') ?? '',
    bank_account_number: form.get('bank_account_number'),
    bank_ifsc: form.get('bank_ifsc'),
    latitude: form.get('latitude') || undefined,
    longitude: form.get('longitude') || undefined,
    geo_accuracy_m: form.get('geo_accuracy_m') || undefined,
    geo_captured_at: form.get('geo_captured_at') || undefined,
  }

  const parsed = submissionSchema.safeParse(fields)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return c.json(
      { ok: false, error: first?.message ?? 'Invalid form', field: first?.path?.[0] },
      400,
    )
  }
  const data = parsed.data

  // Files
  const photo = form.get('photo')
  const passbook = form.get('passbook')

  if (!(photo instanceof File) || photo.size === 0) {
    return c.json({ ok: false, error: 'Photo is required', field: 'photo' }, 400)
  }
  if (!(passbook instanceof File) || passbook.size === 0) {
    return c.json(
      { ok: false, error: 'Passbook / cancelled cheque is required', field: 'passbook' },
      400,
    )
  }
  if (!ALLOWED_PHOTO.has(photo.type)) {
    return c.json({ ok: false, error: 'Photo must be a JPG, PNG, WEBP or HEIC image', field: 'photo' }, 400)
  }
  if (!ALLOWED_PASSBOOK.has(passbook.type)) {
    return c.json(
      { ok: false, error: 'Passbook must be an image or a PDF', field: 'passbook' },
      400,
    )
  }
  if (photo.size > maxBytes || passbook.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024))
    return c.json({ ok: false, error: `Each file must be ${mb} MB or smaller` }, 400)
  }

  const subId = id()
  const photoKey = `submissions/${subId}/photo.${extFor(photo.type)}`
  const passbookKey = `submissions/${subId}/passbook.${extFor(passbook.type)}`

  // Store files first; if the DB insert fails we leave orphaned objects rather
  // than a row that points at nothing.
  await c.env.UPLOADS.put(photoKey, await photo.arrayBuffer(), {
    httpMetadata: { contentType: photo.type },
  })
  await c.env.UPLOADS.put(passbookKey, await passbook.arrayBuffer(), {
    httpMetadata: { contentType: passbook.type },
  })

  await c.env.DB.prepare(
    `INSERT INTO submissions (
       id, region, name, postal_address, pincode,
       latitude, longitude, geo_accuracy_m, geo_captured_at,
       has_laptop, instagram, facebook, twitter,
       bank_name, bank_account_number, bank_ifsc,
       photo_key, photo_type, photo_size,
       passbook_key, passbook_type, passbook_size
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      subId,
      data.region,
      data.name,
      data.postal_address,
      data.pincode,
      data.latitude ?? null,
      data.longitude ?? null,
      data.geo_accuracy_m ?? null,
      data.geo_captured_at ?? null,
      data.has_laptop === 'yes' ? 1 : 0,
      data.instagram || null,
      data.facebook || null,
      data.twitter || null,
      data.bank_name,
      data.bank_account_number,
      data.bank_ifsc,
      photoKey,
      photo.type,
      photo.size,
      passbookKey,
      passbook.type,
      passbook.size,
    )
    .run()

  return c.json({ ok: true, id: subId })
})

/* ------------------------------------------------------------------ *
 * Admin - token protected
 * ------------------------------------------------------------------ */

function checkAdmin(c: { env: Env; req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }): boolean {
  const token = c.env.ADMIN_TOKEN
  if (!token) return false
  const auth = c.req.header('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
  const supplied = bearer ?? c.req.query('token')
  // constant-time-ish compare
  if (!supplied || supplied.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ supplied.charCodeAt(i)
  return diff === 0
}

app.get('/api/admin/submissions', async (c) => {
  if (!checkAdmin(c)) return c.json({ ok: false, error: 'Unauthorized' }, 401)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM submissions ORDER BY created_at DESC LIMIT 1000`,
  ).all<SubmissionRow>()

  return c.json({ ok: true, submissions: results })
})

// Export all submissions as CSV (opens directly in Excel).
app.get('/api/admin/export.csv', async (c) => {
  if (!checkAdmin(c)) return c.text('Unauthorized', 401)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM submissions ORDER BY created_at DESC LIMIT 5000`,
  ).all<SubmissionRow>()

  const headers = [
    'Submitted At',
    'Name',
    'Region',
    'Postal Address',
    'Pincode',
    'Latitude',
    'Longitude',
    'Map Link',
    'Has Laptop',
    'Instagram',
    'Facebook',
    'Twitter',
    'Bank Name',
    'Account Number',
    'IFSC',
    'Photo File',
    'Passbook File',
  ]

  const cell = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }

  const lines = [headers.join(',')]
  for (const r of results) {
    const map =
      r.latitude != null ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : ''
    lines.push(
      [
        new Date(r.created_at * 1000).toISOString(),
        r.name,
        r.region,
        r.postal_address,
        r.pincode,
        r.latitude ?? '',
        r.longitude ?? '',
        map,
        r.has_laptop ? 'Yes' : 'No',
        r.instagram ?? '',
        r.facebook ?? '',
        r.twitter ?? '',
        r.bank_name ?? '',
        r.bank_account_number,
        r.bank_ifsc,
        r.photo_key ?? '',
        r.passbook_key ?? '',
      ]
        .map(cell)
        .join(','),
    )
  }

  // Leading BOM so Excel reads UTF-8 (keeps Devanagari names correct); CRLF rows.
  const csv = '﻿' + lines.join('\r\n')
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="submissions-${stamp}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
})

// Stream one uploaded file. kind = 'photo' | 'passbook'.
app.get('/api/admin/file/:id/:kind', async (c) => {
  if (!checkAdmin(c)) return c.text('Unauthorized', 401)

  const subId = c.req.param('id')
  const kind = c.req.param('kind')
  if (kind !== 'photo' && kind !== 'passbook') return c.text('Not found', 404)

  const row = await c.env.DB.prepare(
    `SELECT ${kind}_key AS k, ${kind}_type AS t FROM submissions WHERE id = ?`,
  )
    .bind(subId)
    .first<{ k: string | null; t: string | null }>()

  if (!row?.k) return c.text('Not found', 404)

  const obj = await c.env.UPLOADS.get(row.k)
  if (!obj) return c.text('Not found', 404)

  return new Response(obj.body, {
    headers: {
      'content-type': row.t ?? 'application/octet-stream',
      'cache-control': 'private, no-store',
    },
  })
})

export default app
