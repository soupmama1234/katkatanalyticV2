import { simpleParser } from 'mailparser'
import pdfParse from 'pdf-parse'
import { parseGrabText, parseLinemanHtml, parseShopeeHtml } from '../src/utils/deliveryParsers.js'

export const config = { runtime: 'nodejs' }

// sender ของแต่ละ platform (ยืนยันแล้วจากอีเมลจริง)
const SENDERS = {
  grab:    'no-reply@grab.com',
  lineman: 'no-reply-merchant@lmwn.com',
  shopee:  'noreply.th@shopeefood.com',
}

// Grab/Lineman ใช้ sender เดียวกันส่งอีเมลหลายประเภท ต้องกรอง subject เพิ่มไม่ให้จับผิดใบ
const SUBJECT_FILTERS = {
  grab: 'สรุปยอดขายสำหรับคำสั่งซื้อ',
  lineman: 'รายงานยอดขายรายวัน',
}

// ── แลก refresh token เป็น access token ใหม่ (หมดอายุทุก 1 ชม.) ──
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('ขอ access token ไม่สำเร็จ: ' + (data.error_description || data.error))
  return data.access_token
}

// ── หา message id ทั้งหมดที่ตรงกับ sender + ช่วงวันที่ ──
async function listMessageIds(accessToken, sender, afterDate, beforeDate, subjectFilter) {
  // Gmail search: after: รวมวันนั้น, before: ไม่รวมวันนั้น
  // +2 วัน = +1 ให้ before ครอบคลุม toDate เต็มวัน, +1 อีกตัวเพราะอีเมลรายงานมาช้ากว่าวันที่รายงานจริง 1 วันเสมอ
  // (เช่น รายงานวันที่ 27 มิ.ย. จะถูกส่งจริงวันที่ 28 มิ.ย. — ยืนยันแล้วจากอีเมลจริงทั้ง Grab/Lineman/Shopee)
  const after = afterDate.replace(/-/g, '/')
  const beforeObj = new Date(beforeDate)
  beforeObj.setDate(beforeObj.getDate() + 2)
  const before = beforeObj.toISOString().slice(0, 10).replace(/-/g, '/')

  let q = `from:${sender} after:${after} before:${before}`
  if (subjectFilter) q += ` subject:"${subjectFilter}"`
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  if (!res.ok) throw new Error('ค้นหาอีเมลไม่สำเร็จ: ' + (data.error?.message || 'unknown'))
  return (data.messages || []).map(m => m.id)
}

// ── ดึงอีเมลฉบับเต็มแบบ raw (.eml เดียวกับที่เทสมาแล้ว) ──
async function fetchRawMessage(accessToken, messageId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  if (!res.ok) throw new Error('ดึงอีเมลไม่สำเร็จ: ' + (data.error?.message || 'unknown'))
  // Gmail ใช้ base64url (มี - กับ _ แทน + กับ /)
  const base64 = data.raw.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64')
}

// ── แปลง html ที่ mailparser decode แล้ว → text ธรรมดา (ตัด tag, ยุบช่องว่าง) ──
function htmlToPlainText(html) {
  return html.replace(/<[^<]+?>/g, ' | ').replace(/\s+/g, ' ')
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'ต้องระบุ from และ to (YYYY-MM-DD)' })

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า Gmail env vars' })
  }

  try {
    const accessToken = await getAccessToken()
    const rows = []
    const needsReview = []

    for (const platform of ['grab', 'lineman', 'shopee']) {
      const sender = SENDERS[platform]
      const messageIds = await listMessageIds(accessToken, sender, from, to, SUBJECT_FILTERS[platform])

      for (const id of messageIds) {
        const rawBuffer = await fetchRawMessage(accessToken, id)
        const parsed = await simpleParser(rawBuffer)

        try {
          let result
          if (platform === 'grab') {
            const pdfAttachment = parsed.attachments.find(a => a.contentType === 'application/pdf')
            if (!pdfAttachment) throw new Error('ไม่พบไฟล์ PDF แนบมากับอีเมล')
            const { text } = await pdfParse(pdfAttachment.content)
            result = parseGrabText(text)
          } else if (platform === 'lineman') {
            const text = htmlToPlainText(parsed.html || '')
            result = parseLinemanHtml(text)
          } else {
            const text = htmlToPlainText(parsed.html || '')
            result = parseShopeeHtml(text)
          }

          if (result.error) {
            needsReview.push({ platform, subject: parsed.subject, messageId: id, error: result.error, raw_source: result.raw })
          } else {
            result.rows.forEach(r => rows.push({ ...r, platform, statement_status: 'ok' }))
          }
        } catch (parseErr) {
          needsReview.push({ platform, subject: parsed.subject, messageId: id, error: parseErr.message, raw_source: (parsed.html || parsed.text || '').slice(0, 500) })
        }
      }
    }

    return res.status(200).json({ rows, needsReview })
  } catch (err) {
    console.error('gmail-sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
