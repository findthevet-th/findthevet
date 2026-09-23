'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Search, Upload, X, ArrowLeft, PawPrint, Hospital, Stethoscope, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { compressImage } from '@/lib/compressImage'
import LoadingScreen from '@/components/LoadingScreen'

const EMOJI: Record<string, string> = { สุนัข: '🐕', แมว: '🐈', กระต่าย: '🐇', นก: '🐦', ปลา: '🐟', อื่นๆ: '🐾' }

interface UnlinkedPet {
  id: string; name: string; species: string; breed: string | null
  gender: string | null; neutered: boolean; photo_url: string | null
  medical_tags: string[]; birthdate: string | null
  visits: number
  created_by_vet: string | null
  latest_clinic: string | null
  latest_date: string | null
}

const fmtShort = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function ClaimPetPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UnlinkedPet[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<UnlinkedPet | null>(null)

  const [proofFile, setProofFile] = useState<{ file: File; preview: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // check if user already has a pending request for selected pet
  const [existingRequest, setExistingRequest] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(false)
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (query.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_unlinked_pets', { q: query.trim() })
      setResults((data as unknown as UnlinkedPet[]) || [])
      setSearching(false)
    }, 350)
  }, [query])

  useEffect(() => {
    if (!selected) { setExistingRequest(false); return }
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('pet_ownership_requests')
        .select('id')
        .eq('pet_id', selected.id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .limit(1)
      setExistingRequest((data?.length ?? 0) > 0)
    }
    check()
  }, [selected])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) { toast.error('กรุณาเลือกสัตว์เลี้ยง'); return }
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    let proof_url = null
    if (proofFile) {
      const file = await compressImage(proofFile.file, { maxWidthPx: 1600, qualityJpeg: 0.8, maxSizeKB: 500 })
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from('ownership-proofs')
        .upload(path, file)
      if (!upErr && up) {
        proof_url = supabase.storage.from('ownership-proofs').getPublicUrl(up.path).data.publicUrl
      }
    }

    const { error } = await supabase.from('pet_ownership_requests').insert({
      pet_id: selected.id,
      requester_id: user.id,
      proof_url,
    })
    setSubmitting(false)
    if (error) { toast.error('ส่งคำขอไม่สำเร็จ: ' + error.message); return }
    toast.success('ส่งคำขอแล้ว — แอดมินจะตรวจสอบและแจ้งผล')
    router.push('/owner/pets')
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/owner/pets" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-primary-600" /> ขอเชื่อมสัตว์เลี้ยง
          </h1>
          <p className="text-sm text-gray-500">สัตว์เลี้ยงที่สร้างโดยสัตวแพทย์ก่อนที่คุณจะสมัคร</p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 text-sm text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-semibold">วิธีใช้งาน</p>
        <ol className="list-decimal pl-4 space-y-0.5 text-blue-600 dark:text-blue-400">
          <li>ค้นหาชื่อสัตว์เลี้ยงของคุณ</li>
          <li>เลือกสัตว์เลี้ยงที่ถูกต้อง</li>
          <li>แนบหลักฐานความเป็นเจ้าของ (รูปถ่าย ใบรับรอง ฯลฯ)</li>
          <li>แอดมินจะตรวจสอบและเชื่อมบัญชีให้ภายใน 1-2 วัน</li>
        </ol>
      </div>

      {!selected ? (
        /* Search step */
        <div className="space-y-3">
          <div>
            <label className="label">ค้นหาชื่อสัตว์เลี้ยง</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="พิมพ์ชื่อสัตว์เลี้ยง (อย่างน้อย 2 ตัวอักษร)"
                className="input pl-9" autoFocus />
            </div>
          </div>

          {searching && <p className="text-sm text-center text-gray-400">กำลังค้นหา...</p>}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">เลือกสัตว์เลี้ยงของคุณ:</p>
              {results.map(p => {
                const age = p.birthdate ? Math.floor((Date.now() - new Date(p.birthdate).getTime()) / (1000 * 60 * 60 * 24 * 365)) : null
                const { visits, created_by_vet: createdByVet, latest_clinic: latestClinic, latest_date: latestDate } = p
                return (
                  <button key={p.id} onClick={() => setSelected(p)}
                    className="card w-full text-left flex items-start gap-3 hover:shadow-md transition-shadow">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                      {p.photo_url
                        ? <Image src={p.photo_url} alt={p.name} width={56} height={56} className="w-full h-full object-cover" />
                        : <span className="text-2xl">{EMOJI[p.species] || '🐾'}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-gray-500">
                        {p.species}{p.breed ? ` · ${p.breed}` : ''}
                        {p.gender && p.gender !== 'ไม่ระบุ' ? ` · ${p.gender}` : ''}
                        {p.neutered ? ' · ทำหมันแล้ว' : ''}
                        {age !== null ? ` · ${age} ปี` : ''}
                      </p>

                      {p.medical_tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.medical_tags.map(t => (
                            <span key={t} className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">⚠️ {t}</span>
                          ))}
                        </div>
                      )}

                      {/* ประวัติการรักษา */}
                      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                        {latestClinic && (
                          <p className="flex items-center gap-1">
                            <Hospital className="w-3 h-3 text-gray-400 shrink-0" />
                            รพ./คลินิกล่าสุด: <span className="font-medium text-gray-600 dark:text-gray-300">{latestClinic}</span>
                            {latestDate && <span className="text-gray-400">({fmtShort(latestDate)})</span>}
                          </p>
                        )}
                        {createdByVet && (
                          <p className="flex items-center gap-1">
                            <Stethoscope className="w-3 h-3 text-gray-400 shrink-0" />
                            สร้างโดย: <span className="font-medium text-gray-600 dark:text-gray-300">{createdByVet}</span>
                          </p>
                        )}
                        {visits > 0 && (
                          <p className="flex items-center gap-1">
                            <ClipboardList className="w-3 h-3 text-gray-400 shrink-0" />
                            เข้ารับบริการ {visits} ครั้ง
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-amber-500 mt-2">ยังไม่มีเจ้าของ</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-gray-400 text-sm">ไม่พบสัตว์เลี้ยงชื่อ "{query}"</p>
              <p className="text-xs text-gray-300 mt-1">ลองสะกดชื่ออื่น หรือติดต่อสัตวแพทย์เพื่อยืนยัน</p>
            </div>
          )}
        </div>
      ) : (
        /* Proof upload step */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selected pet */}
          <div className="card bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800 flex items-center gap-3">
            <span className="text-2xl">{EMOJI[selected.species] || '🐾'}</span>
            <div className="flex-1">
              <p className="font-semibold text-primary-800 dark:text-primary-200">{selected.name}</p>
              <p className="text-xs text-primary-600 dark:text-primary-400">
                {selected.species}{selected.breed ? ` · ${selected.breed}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => { setSelected(null); setProofFile(null) }}
              className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {existingRequest && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
              คุณมีคำขอที่รอการตรวจสอบสำหรับสัตว์เลี้ยงนี้อยู่แล้ว
            </div>
          )}

          {/* Proof upload */}
          <div>
            <label className="label">
              หลักฐานความเป็นเจ้าของ
              <span className="text-gray-400 font-normal ml-1">(ไม่บังคับ แต่ช่วยให้อนุมัติเร็วขึ้น)</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">เช่น รูปถ่ายคุณกับสัตว์เลี้ยง, ใบรับรองการฉีดวัคซีน, ใบเสร็จซื้อสัตว์เลี้ยง</p>
            <label className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer h-36 transition-colors overflow-hidden
              ${proofFile ? 'border-primary-300' : 'border-gray-200 hover:border-primary-300 dark:border-gray-700'}`}>
              {proofFile ? (
                <div className="relative w-full h-full">
                  <Image src={proofFile.preview} alt="proof" fill className="object-cover" />
                  <button type="button" onClick={e => { e.preventDefault(); setProofFile(null) }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow z-10">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-300 mb-1" />
                  <span className="text-sm text-gray-400">อัพโหลดรูปหลักฐาน</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                setProofFile({ file, preview: URL.createObjectURL(file) })
                e.target.value = ''
              }} />
            </label>
          </div>

          <button type="submit" disabled={submitting || existingRequest} className="btn-primary w-full py-3">
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเชื่อมสัตว์เลี้ยง'}
          </button>
        </form>
      )}
    </div>
  )
}
