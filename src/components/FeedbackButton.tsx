'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus, X, Send, Image as ImageIcon, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { compressImage } from '@/lib/compressImage'
import ClinicEditRequestForm from '@/components/ClinicEditRequestForm'

interface ChangelogItem { id: string; summary: string; resolved_at: string }

const fmtChangelog = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

// หน้าที่มีช่องพิมพ์ข้อความติดขอบล่าง — ปุ่มลอยจะไปทับปุ่มส่ง เลยซ่อนไว้
const CHAT_ROUTES = ['/messages/', '/chat/', '/vet/appointment/', '/owner/appointment/']

export default function FeedbackButton() {
  const supabase = createClient()
  const pathname = usePathname()
  const onChatPage = CHAT_ROUTES.some(r => pathname?.startsWith(r))
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [changelog, setChangelog] = useState<ChangelogItem[]>([])
  const [showAllChangelog, setShowAllChangelog] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [tab, setTab] = useState<'app' | 'clinic'>('app')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user))
  }, [])

  useEffect(() => {
    if (!open) return
    supabase
      .rpc('get_public_changelog')
      .then(({ data }) => setChangelog((data as ChangelogItem[]) || []))
  }, [open])

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handleSubmit = async () => {
    if (!message.trim()) { toast.error('กรุณาใส่ข้อความ'); return }
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSending(false); return }

    let image_url: string | null = null
    if (imageFile) {
      const file = await compressImage(imageFile, { maxWidthPx: 1600, qualityJpeg: 0.8, maxSizeKB: 500 })
      const ext = file.name.split('.').pop()
      const path = `feedback/${user.id}-${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('feedback-images').upload(path, file)
      if (error) { toast.error('อัพโหลดรูปไม่สำเร็จ: ' + error.message); setSending(false); return }
      image_url = supabase.storage.from('feedback-images').getPublicUrl(data.path).data.publicUrl
    }

    const { error } = await supabase.from('feedback').insert({ user_id: user.id, message: message.trim(), image_url })
    setSending(false)
    if (error) { toast.error('ส่งไม่สำเร็จ'); return }
    toast.success('ส่ง Feedback แล้ว ขอบคุณครับ!')
    setMessage(''); setImageFile(null); setImagePreview(null); setOpen(false)
  }

  if (!loggedIn || onChatPage) return null

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-30 bg-primary-600 hover:bg-primary-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-colors"
        title="แจ้ง Feedback / ขอฟีเจอร์"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-lg">แจ้ง Feedback</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-3 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button onClick={() => setTab('app')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${tab === 'app' ? 'bg-white dark:bg-gray-900 shadow-sm text-primary-600' : 'text-gray-500'}`}>
                แจ้งปัญหา / ขอฟีเจอร์
              </button>
              <button onClick={() => setTab('clinic')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${tab === 'clinic' ? 'bg-white dark:bg-gray-900 shadow-sm text-primary-600' : 'text-gray-500'}`}>
                ขอแก้ข้อมูล รพ.
              </button>
            </div>

            {tab === 'clinic' ? (
              <ClinicEditRequestForm onDone={() => setOpen(false)} />
            ) : (
            <>
            <p className="text-xs text-gray-400">ทดลองใช้แล้วติดขัดตรงไหน อยากให้เพิ่มหรือลดตรงไหน บอกได้เลยครับ</p>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="input resize-none w-full text-sm"
              rows={5}
              placeholder="เช่น อยากให้หน้า OPD แสดงประวัติย้อนหลังได้ / ปุ่มนี้ใช้งานไม่ได้ / ..."
              autoFocus
            />

            {/* Image */}
            <div className="space-y-2">
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="preview" className="w-full h-40 object-cover rounded-xl" />
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null) }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 cursor-pointer w-fit">
                  <ImageIcon className="w-4 h-4" />
                  <span>แนบรูป (ถ้ามี)</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
                </label>
              )}
            </div>

            <button onClick={handleSubmit} disabled={sending || !message.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'กำลังส่ง...' : 'ส่ง Feedback'}
            </button>

            {/* Recent changelog */}
            {changelog.length > 0 && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-primary-500" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">อัปเดตล่าสุด</p>
                </div>
                <ul className="space-y-2">
                  {(showAllChangelog ? changelog : changelog.slice(0, 5)).map(c => (
                    <li key={c.id} className="flex gap-2 text-sm">
                      <span className="text-primary-500 shrink-0">✓</span>
                      <div className="min-w-0">
                        <p className="text-gray-700 dark:text-gray-300 leading-snug">{c.summary}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{fmtChangelog(c.resolved_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {changelog.length > 5 && (
                  <button
                    onClick={() => setShowAllChangelog(v => !v)}
                    className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                    {showAllChangelog
                      ? <><ChevronUp className="w-3.5 h-3.5" /> ย่อ</>
                      : <><ChevronDown className="w-3.5 h-3.5" /> ดูทั้งหมด ({changelog.length})</>
                    }
                  </button>
                )}
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
