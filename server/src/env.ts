import { z } from 'zod'
import { readFileSync } from 'fs'
import path from 'path'

const keyPath = '/Users/jesseferreira/Downloads/profound-jet-471516-n9-72b76a0e1508.json'
let creds: any = {}
try {
  const abs = path.resolve(keyPath)
  creds = JSON.parse(readFileSync(abs, 'utf8'))
} catch {}

const raw = {
  GCS_PROJECT_ID: process.env.GCS_PROJECT_ID || creds.project_id,
  GCS_BUCKET: process.env.GCS_BUCKET || 'hytechcrm_app_storage',
  GCS_CLIENT_EMAIL: process.env.GCS_CLIENT_EMAIL || creds.client_email,
  GCS_PRIVATE_KEY: process.env.GCS_PRIVATE_KEY || creds.private_key,
}

const schema = z.object({
  GCS_PROJECT_ID: z.string().min(1),
  GCS_BUCKET: z.string().min(1),
  GCS_CLIENT_EMAIL: z.string().email(),
  GCS_PRIVATE_KEY: z.string().min(1),
})

const parsed = schema.safeParse(raw)
if (!parsed.success) throw new Error('Missing or invalid GCS environment variables')
export const env = {
  GCS_PROJECT_ID: parsed.data.GCS_PROJECT_ID,
  GCS_BUCKET: parsed.data.GCS_BUCKET,
  GCS_CLIENT_EMAIL: parsed.data.GCS_CLIENT_EMAIL,
  GCS_PRIVATE_KEY: (parsed.data.GCS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
}

export const GCS_BUCKET = env.GCS_BUCKET
