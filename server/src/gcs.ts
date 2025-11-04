import { Storage } from '@google-cloud/storage'
import { env } from './env'

export const storage = new Storage({ projectId: env.GCS_PROJECT_ID, credentials: { client_email: env.GCS_CLIENT_EMAIL, private_key: env.GCS_PRIVATE_KEY } })
export const bucket = storage.bucket(env.GCS_BUCKET)

export function sanitizeKey(key: string) {
  key = key.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  if (key.includes('..')) throw Object.assign(new Error('Bad key'), { code: 'BadKey' })
  return key
}

export async function putObject(key: string, buf: Buffer, contentType?: string) {
  key = sanitizeKey(key)
  const f = bucket.file(key)
  await f.save(buf, { contentType, resumable: false, validation: 'md5' })
  return { key }
}

export async function getSignedUrl(key: string, expiresInSeconds = 3600) {
  key = sanitizeKey(key)
  const f = bucket.file(key)
  const [url] = await f.getSignedUrl({ action: 'read', expires: Date.now() + expiresInSeconds * 1000 })
  return url
}

export async function listObjects(prefix = 'iphone/') {
  const [files] = await bucket.getFiles({ prefix })
  return files.map(f => ({ key: f.name, size: Number(f.metadata.size || 0), updated: f.metadata.updated }))
}

export async function deleteObject(key: string) {
  key = sanitizeKey(key)
  await bucket.file(key).delete({ ignoreNotFound: true })
}
