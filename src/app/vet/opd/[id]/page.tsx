'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, ClipboardList, CalendarDays, Scale, Pencil, X, Check, Plus, Lock, UserPlus, Search, Printer, Upload, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import LoadingScreen from '@/components/LoadingScreen'
import SearchableSelect, { SelectOption } from '@/components/SearchableSelect'
import toast from 'react-hot-toast'
import { compressImage } from '@/lib/compressImage'
import { openConversation } from '@/lib/chat'

const EMOJI: Record<string, string> = { สุนัข: '🐕', แมว: '🐈', กระต่าย: '🐇', นก: '🐦', ปลา: '🐟', อื่นๆ: '🐾' }
const SPECIES = ['สุนัข', 'แมว', 'กระต่าย', 'นก', 'ปลา', 'อื่นๆ']
const GENDERS = ['เพศผู้', 'เพศเมีย', 'ไม่ระบุ']

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDatetime = (d: string) => new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function calcAge(birthdate: string): string {
  const birth = new Date(birthdate)
  const now = new Date()
  let totalMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) totalMonths--
  if (totalMonths < 1) return 'แรกเกิด'
  if (totalMonths < 12) return `${totalMonths} เดือน`
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  return m > 0 ? `${y} ปี ${m} เดือน` : `${y} ปี`
}

/** หลัง 03:00 น. ของวันถัดจาก record_date → lock */
function isEditLocked(recordDate: string): boolean {
  const cutoff = new Date(recordDate + 'T00:00:00')
  cutoff.setDate(cutoff.getDate() + 1)
  cutoff.setHours(3, 0, 0, 0)
  return new Date() > cutoff
}

const OPD_FIELDS = [
  { key: 'cc',      label: 'CC',      title: 'Chief Complaint',        hint: 'อาการหลักที่นำมาพบ' },
  { key: 'hx',      label: 'Hx',      title: 'History Taking',         hint: 'ประวัติการเลี้ยง อาหาร วัคซีน' },
  { key: 'pe',      label: 'PE',       title: 'Physical Examination',  hint: 'ผลการตรวจร่างกาย' },
  { key: 'diff_dx', label: 'Diff Dx', title: 'Differential Diagnosis', hint: 'การวินิจฉัยแยกโรค' },
  { key: 'dx',      label: 'Dx',      title: 'Tentative Diagnosis',    hint: 'การวินิจฉัยโรค' },
  { key: 'tx',      label: 'Tx',      title: 'Treatment',              hint: 'การรักษา หัตถการ' },
  { key: 'rx',      label: 'Rx',      title: 'Prescription',           hint: 'ยาที่สั่ง ขนาด วิธีใช้' },
  { key: 'ce',      label: 'CE',      title: 'Client Education',       hint: 'คำแนะนำสำหรับเจ้าของ' },
] as const
type OPDKey = typeof OPD_FIELDS[number]['key']

function MedicalTags({ tags }: { tags: string[] }) {
  if (!tags?.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map(t => (
        <span key={t} className="text-xs bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">⚠️ {t}</span>
      ))}
    </div>
  )
}

interface Visit { id: string; record_date: string; dx: string | null; created_at: string }
interface PetInfo {
  id: string; name: string; species: string; breed: string | null
  gender: string | null; neutered: boolean; photo_url: string | null
  birthdate: string | null
  medical_tags: string[]; owner_id: string | null; profiles: { full_name: string } | null
}
interface OPDRecord {
  id: string; vet_id: string; record_date: string; created_at: string
  weight: number | null; next_appointment: string | null
  photo1_url: string | null; photo1_caption: string | null
  photo2_url: string | null; photo2_caption: string | null
  cc: string | null; hx: string | null; pe: string | null
  diff_dx: string | null; dx: string | null
  tx: string | null; rx: string | null; ce: string | null
  pets: PetInfo | null
  clinics: { name: string } | null
  vet: { full_name: string } | null
}

export default function OPDDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const router = useRouter()
  const [record, setRecord] = useState<OPDRecord | null>(null)
  const [vetTitle, setVetTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Pet edit
  const [editingPet, setEditingPet] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSpecies, setEditSpecies] = useState('')
  const [editBreed, setEditBreed] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editNeutered, setEditNeutered] = useState(false)
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [breedOptions, setBreedOptions] = useState<SelectOption[]>([])
  const [loadingBreeds, setLoadingBreeds] = useState(false)
  const [savingPet, setSavingPet] = useState(false)

  // Link owner
  const [showLinkOwner, setShowLinkOwner] = useState(false)
  const [ownerQuery, setOwnerQuery] = useState('')
  const [ownerResults, setOwnerResults] = useState<{ id: string; full_name: string; phone: string | null }[]>([])
  const [searchingOwner, setSearchingOwner] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [visits, setVisits] = useState<Visit[]>([])

  // OPD edit
  const [editingOPD, setEditingOPD] = useState(false)
  const [editFields, setEditFields] = useState<Record<OPDKey, string>>({ cc: '', hx: '', pe: '', diff_dx: '', dx: '', tx: '', rx: '', ce: '' })
  const [editWeight, setEditWeight] = useState('')
  const [editNextAppt, setEditNextAppt] = useState('')
  const [savingOPD, setSavingOPD] = useState(false)
  type EditPhoto = { url: string | null; caption: string; file: File | null; preview: string | null }
  const [editPhotos, setEditPhotos] = useState<EditPhoto[]>([
    { url: null, caption: '', file: null, preview: null },
    { url: null, caption: '', file: null, preview: null },
  ])

  useEffect(() => {
    supabase
      .from('opd_records')
      .select('*, pets(id, name, species, breed, gender, neutered, photo_url, birthdate, medical_tags, owner_id, profiles!owner_id(full_name)), clinics(name), vet:profiles!vet_id(full_name)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setRecord(data as any); setLoading(false)
        const vetId = (data as any)?.vet_id
        const petId = (data as any)?.pet_id
        if (vetId) {
          supabase.from('vet_profiles').select('title').eq('user_id', vetId).single()
            .then(({ data: vp }) => setVetTitle((vp as any)?.title || null))
        }
        // ประวัติการตรวจครั้งอื่นของสัตว์ตัวเดียวกัน (โดยหมอคนนี้)
        if (petId && vetId) {
          supabase.from('opd_records')
            .select('id, record_date, dx, created_at')
            .eq('pet_id', petId).eq('vet_id', vetId)
            .order('record_date', { ascending: false }).order('created_at', { ascending: false })
            .then(({ data: rows }) => setVisits((rows as Visit[]) || []))
        }
      })
  }, [id])

  useEffect(() => {
    if (!editingPet) return
    if (editSpecies === 'อื่นๆ' || editSpecies === 'ปลา') { setBreedOptions([]); return }
    setLoadingBreeds(true)
    supabase.from('pet_breeds').select('id, name, name_en').eq('species', editSpecies).order('name')
      .then(({ data }) => {
        setBreedOptions((data || []).map((b: any) => ({ value: b.name, label: b.name_en ? `${b.name} / ${b.name_en}` : b.name })))
        setLoadingBreeds(false)
      })
  }, [editSpecies, editingPet])

  useEffect(() => {
    if (!showLinkOwner || ownerQuery.trim().length < 2) { setOwnerResults([]); return }
    setSearchingOwner(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id, full_name, phone')
        .eq('role', 'owner')
        .ilike('full_name', `%${ownerQuery.trim()}%`)
        .limit(8)
      setOwnerResults((data as any) || [])
      setSearchingOwner(false)
    }, 350)
    return () => clearTimeout(t)
  }, [ownerQuery, showLinkOwner])

  const handleChatOwner = async (ownerId: string) => {
    const convoId = await openConversation(ownerId)
    if (!convoId) { toast.error('เปิดแชทไม่ได้'); return }
    router.push(`/messages/${convoId}`)
  }

  const handleSendLinkRequest = async (owner: { id: string; full_name: string }) => {
    if (!record?.pets?.id) return
    setSendingLink(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('pet_ownership_requests').insert({
      pet_id: record.pets.id,
      requester_id: owner.id,
      target_owner_id: owner.id,
      vet_initiator_id: user.id,
      status: 'pending',
    })
    if (error) { toast.error('ส่งคำขอไม่สำเร็จ'); setSendingLink(false); return }

    await supabase.from('notifications').insert({
      user_id: owner.id,
      title: 'สัตวแพทย์ขอเชื่อมสัตว์เลี้ยงกับคุณ',
      body: `สัตวแพทย์ส่งคำขอเชื่อมสัตว์เลี้ยง "${record.pets.name}" กับบัญชีของคุณ กรุณายืนยันในหน้าสัตว์เลี้ยง`,
      link: '/owner/pets',
    })

    setSendingLink(false)
    setLinkSent(true)
    setShowLinkOwner(false)
    toast.success(`ส่งคำขอให้ ${owner.full_name} แล้ว`)
  }

  const openEditPet = () => {
    const pet = record?.pets
    if (!pet) return
    setEditName(pet.name); setEditSpecies(pet.species); setEditBreed(pet.breed || '')
    setEditGender(pet.gender || 'ไม่ระบุ'); setEditNeutered(pet.neutered || false)
    setEditTags(pet.medical_tags || [])
    setEditingPet(true)
  }

  const openEditOPD = () => {
    if (!record) return
    setEditFields({ cc: record.cc || '', hx: record.hx || '', pe: record.pe || '', diff_dx: record.diff_dx || '', dx: record.dx || '', tx: record.tx || '', rx: record.rx || '', ce: record.ce || '' })
    setEditWeight(record.weight != null ? String(record.weight) : '')
    setEditNextAppt(record.next_appointment || '')
    setEditPhotos([
      { url: record.photo1_url, caption: record.photo1_caption || '', file: null, preview: null },
      { url: record.photo2_url, caption: record.photo2_caption || '', file: null, preview: null },
    ])
    setEditingOPD(true)
  }

  const uploadOPDPhoto = async (original: File) => {
    // phone photos are 2–5 MB; 1600px @ ≤500 KB still prints sharp on A4
    const file = await compressImage(original, { maxWidthPx: 1600, qualityJpeg: 0.8, maxSizeKB: 500 })
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('opd-photos').upload(path, file)
    if (error) { toast.error('อัพโหลดรูปไม่สำเร็จ: ' + error.message); return null }
    return supabase.storage.from('opd-photos').getPublicUrl(data.path).data.publicUrl
  }

  const pickEditPhoto = (i: number, file: File) => {
    setEditPhotos(prev => prev.map((p, idx) => idx === i ? { ...p, file, preview: URL.createObjectURL(file) } : p))
  }
  const clearEditPhoto = (i: number) => {
    setEditPhotos(prev => prev.map((p, idx) => idx === i ? { url: null, caption: '', file: null, preview: null } : p))
  }
  const setEditPhotoCaption = (i: number, caption: string) => {
    setEditPhotos(prev => prev.map((p, idx) => idx === i ? { ...p, caption } : p))
  }

  const addTag = (val: string) => {
    const t = val.trim()
    if (t && !editTags.includes(t)) setEditTags(prev => [...prev, t])
    setTagInput('')
  }

  const handleSavePet = async () => {
    if (!record?.pets?.id || !editName.trim()) { toast.error('กรุณาใส่ชื่อสัตว์เลี้ยง'); return }
    setSavingPet(true)
    const { error } = await supabase.from('pets').update({
      name: editName.trim(), species: editSpecies, breed: editBreed.trim() || null,
      gender: editGender, neutered: editNeutered, medical_tags: editTags,
    }).eq('id', record.pets.id)
    if (error) { toast.error('บันทึกไม่สำเร็จ'); setSavingPet(false); return }
    setRecord(prev => prev ? { ...prev, pets: prev.pets ? { ...prev.pets, name: editName.trim(), species: editSpecies, breed: editBreed.trim() || null, gender: editGender, neutered: editNeutered, medical_tags: editTags } : null } : null)
    toast.success('แก้ไขข้อมูลสัตว์เลี้ยงแล้ว')
    setEditingPet(false); setSavingPet(false)
  }

  const handleSaveOPD = async () => {
    if (!record) return
    setSavingOPD(true)

    // resolve photos: upload new files, keep/clear existing
    const resolved: { url: string | null; caption: string | null }[] = []
    for (const p of editPhotos) {
      let url = p.url
      if (p.file) { url = await uploadOPDPhoto(p.file); if (!url) { setSavingOPD(false); return } }
      resolved.push({ url, caption: url ? (p.caption.trim() || null) : null })
    }

    const photoFields = {
      photo1_url: resolved[0].url, photo1_caption: resolved[0].caption,
      photo2_url: resolved[1].url, photo2_caption: resolved[1].caption,
    }
    const { error } = await supabase.from('opd_records').update({
      ...Object.fromEntries(OPD_FIELDS.map(f => [f.key, editFields[f.key].trim() || null])),
      weight: editWeight ? parseFloat(editWeight) : null,
      next_appointment: editNextAppt || null,
      ...photoFields,
    }).eq('id', record.id)
    if (error) { toast.error('บันทึกไม่สำเร็จ'); setSavingOPD(false); return }
    setRecord(prev => prev ? {
      ...prev,
      ...Object.fromEntries(OPD_FIELDS.map(f => [f.key, editFields[f.key].trim() || null])),
      weight: editWeight ? parseFloat(editWeight) : null,
      next_appointment: editNextAppt || null,
      ...photoFields,
    } : null)
    toast.success('แก้ไขบันทึก OPD แล้ว')
    setEditingOPD(false); setSavingOPD(false)
  }

  if (loading) return <LoadingScreen />
  if (!record) return (
    <div className="text-center py-20">
      <p className="text-gray-400">ไม่พบบันทึก OPD นี้</p>
      <Link href="/vet/opd" className="btn-secondary mt-4 inline-flex">← กลับ</Link>
    </div>
  )

  const pet = record.pets
  const ownerName = (pet?.profiles as any)?.full_name ?? null
  const locked = isEditLocked(record.record_date)

  return (
    <>
    <div className="max-w-2xl mx-auto space-y-5 no-print">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/vet/opd" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-600" /> บันทึก OPD
          </h1>
          <p className="text-sm text-gray-500">{fmtDatetime(record.created_at)}</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="พิมพ์ หรือบันทึกเป็น PDF">
          <Printer className="w-4 h-4" /> พิมพ์ / PDF
        </button>
        {locked && (
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
            <Lock className="w-3 h-3" /> ล็อกแล้ว
          </div>
        )}
      </div>

      {/* Pet card */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            {pet?.photo_url
              ? <Image src={pet.photo_url} alt={pet.name} width={56} height={56} className="w-full h-full object-cover" />
              : <span className="text-2xl">{EMOJI[pet?.species || ''] || '🐾'}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-lg">{pet?.name}</p>
            <p className="text-sm text-gray-500">
              {pet?.species}{pet?.breed ? ` · ${pet.breed}` : ''}
              {pet?.gender && pet.gender !== 'ไม่ระบุ' ? ` · ${pet.gender}` : ''}
              {pet?.neutered ? ' · ทำหมันแล้ว' : ''}
            </p>
            {ownerName
              ? <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-400">เจ้าของ: {ownerName}</p>
                  {pet?.owner_id && (
                    <button onClick={() => handleChatOwner(pet.owner_id!)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 border border-primary-200 rounded-md px-1.5 py-0.5 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors">
                      <MessageCircle className="w-3 h-3" /> ทักแชท
                    </button>
                  )}
                </div>
              : <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-amber-500">ยังไม่มีเจ้าของในระบบ</p>
                  {!linkSent
                    ? <button onClick={() => setShowLinkOwner(true)}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 border border-primary-200 rounded-md px-1.5 py-0.5 hover:bg-primary-50 transition-colors">
                        <UserPlus className="w-3 h-3" /> ส่งคำขอ
                      </button>
                    : <span className="text-xs text-green-600">✓ ส่งแล้ว รอเจ้าของยืนยัน</span>
                  }
                </div>
            }
            <MedicalTags tags={pet?.medical_tags || []} />
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {record.clinics && <p className="text-sm text-gray-500">{record.clinics.name}</p>}
            <button onClick={openEditPet}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-700 rounded-lg px-2 py-1 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors">
              <Pencil className="w-3 h-3" /> แก้ไข
            </button>
          </div>
        </div>

        {(record.weight != null || record.next_appointment) && (
          <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            {record.weight != null && (
              <div className="flex items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300">
                <Scale className="w-4 h-4" /> {record.weight} kg
              </div>
            )}
            {record.next_appointment && (
              <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <CalendarDays className="w-4 h-4" />
                นัดหมายถัดไป: {fmtDate(record.next_appointment)}
              </div>
            )}
          </div>
        )}

        {/* Link owner modal */}
        {showLinkOwner && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">ค้นหาเจ้าของเพื่อส่งคำขอ</p>
              <button onClick={() => { setShowLinkOwner(false); setOwnerQuery(''); setOwnerResults([]) }}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={ownerQuery} onChange={e => setOwnerQuery(e.target.value)}
                className="input pl-9" placeholder="ค้นหาชื่อเจ้าของ..." autoFocus />
            </div>
            {searchingOwner && <p className="text-xs text-center text-gray-400">กำลังค้นหา...</p>}
            {ownerResults.length > 0 && (
              <div className="space-y-1.5">
                {ownerResults.map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{o.full_name}</p>
                      {o.phone && <p className="text-xs text-gray-400">{o.phone}</p>}
                    </div>
                    <button onClick={() => handleSendLinkRequest(o)} disabled={sendingLink}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                      <UserPlus className="w-3 h-3" />
                      {sendingLink ? '...' : 'ส่งคำขอ'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {ownerQuery.trim().length >= 2 && !searchingOwner && ownerResults.length === 0 && (
              <p className="text-xs text-center text-gray-400">ไม่พบเจ้าของชื่อ "{ownerQuery}"</p>
            )}
          </div>
        )}

        {/* Inline pet edit */}
        {editingPet && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">แก้ไขข้อมูลสัตว์เลี้ยง</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">ชื่อ *</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">ชนิด</label>
                <select value={editSpecies} onChange={e => { setEditSpecies(e.target.value); setEditBreed('') }} className="input">
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">สายพันธุ์</label>
                {editSpecies === 'อื่นๆ' || editSpecies === 'ปลา' ? (
                  <input value={editBreed} onChange={e => setEditBreed(e.target.value)} className="input" placeholder="ระบุสายพันธุ์" />
                ) : (
                  <SearchableSelect value={editBreed} onChange={setEditBreed} options={breedOptions} loading={loadingBreeds}
                    placeholder="ค้นหาสายพันธุ์..." freeTextPlaceholder="ระบุสายพันธุ์..." notInListLabel="ไม่มีในรายการ — กรอกเอง" />
                )}
              </div>
              <div>
                <label className="label">เพศ</label>
                <select value={editGender} onChange={e => setEditGender(e.target.value)} className="input">
                  {GENDERS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">การทำหมัน</label>
              <div className="flex gap-2">
                {[{ v: false, label: 'ยังไม่ได้ทำหมัน' }, { v: true, label: 'ทำหมันแล้ว' }].map(opt => (
                  <button key={String(opt.v)} type="button" onClick={() => setEditNeutered(opt.v)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${editNeutered === opt.v ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Medical Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editTags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
                    ⚠️ {t} <button onClick={() => setEditTags(prev => prev.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                  className="input flex-1 text-sm" placeholder="เช่น แพ้ยา Penicillin" />
                <button type="button" onClick={() => addTag(tagInput)} className="btn-secondary px-3"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPet(false)} className="flex-1 btn-secondary flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> ยกเลิก
              </button>
              <button onClick={handleSavePet} disabled={savingPet} className="flex-1 btn-primary flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {savingPet ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ประวัติการตรวจของสัตว์ตัวนี้ — กดข้ามไปดูครั้งอื่นได้ */}
      {visits.length > 1 && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-500" />
            <p className="text-sm font-semibold text-gray-500">ประวัติการตรวจของ {pet?.name} ({visits.length} ครั้ง)</p>
          </div>
          <div className="space-y-1.5">
            {visits.map((v, i) => {
              const isCurrent = v.id === record.id
              return (
                <Link key={v.id} href={`/vet/opd/${v.id}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                    isCurrent
                      ? 'bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 pointer-events-none'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                  }`}>
                  <span className={`text-xs font-medium shrink-0 w-14 text-center rounded-full py-0.5 ${
                    isCurrent ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                    ครั้งที่ {visits.length - i}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{fmtDate(v.record_date)}</p>
                    {v.dx && <p className="text-xs text-gray-400 truncate">Dx: {v.dx}</p>}
                  </div>
                  {isCurrent
                    ? <span className="text-xs text-primary-600 dark:text-primary-400 shrink-0">กำลังดูอยู่</span>
                    : <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 shrink-0" />}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* OPD fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-500">รายละเอียดการรักษา</p>
          {locked ? (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Lock className="w-3 h-3" />
              <span>ล็อกแล้ว — แก้ไขได้ถึง 03.00 น. ของวันถัดไป</span>
            </div>
          ) : (
            <button onClick={openEditOPD}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-700 rounded-lg px-2 py-1 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors">
              <Pencil className="w-3 h-3" /> แก้ไข
            </button>
          )}
        </div>

        {/* OPD inline edit form */}
        {editingOPD && !locked && (
          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">น้ำหนัก (kg)</label>
                <input type="number" step="0.01" value={editWeight} onChange={e => setEditWeight(e.target.value)} className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="label">นัดหมายถัดไป</label>
                <input type="date" value={editNextAppt} onChange={e => setEditNextAppt(e.target.value)} className="input" />
              </div>
            </div>
            {OPD_FIELDS.map(f => (
              <div key={f.key}>
                <label className="label">
                  <span className="font-bold text-primary-600">{f.label}</span>
                  <span className="text-gray-400 font-normal ml-1">— {f.title}</span>
                  <span className="text-gray-300 text-xs font-normal ml-1">({f.hint})</span>
                </label>
                <textarea rows={3} value={editFields[f.key]} onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="input resize-none" placeholder={f.hint} />
              </div>
            ))}
            {/* Photos */}
            <div>
              <label className="label">รูปภาพ (สูงสุด 2 รูป)</label>
              <div className="grid grid-cols-2 gap-3">
                {editPhotos.map((p, i) => {
                  const src = p.preview || p.url
                  return (
                    <div key={i} className="space-y-1.5">
                      {src ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                          <button type="button" onClick={() => clearEditPhoto(i)}
                            className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 hover:bg-black/70">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary-300 cursor-pointer text-gray-400">
                          <Upload className="w-5 h-5 mb-1" />
                          <span className="text-xs">เพิ่มรูป</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) pickEditPhoto(i, f); e.target.value = '' }} />
                        </label>
                      )}
                      {src && (
                        <input value={p.caption} onChange={e => setEditPhotoCaption(i, e.target.value)}
                          className="input text-xs" placeholder="คำอธิบายรูป (ถ้ามี)" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingOPD(false)} className="flex-1 btn-secondary flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> ยกเลิก
              </button>
              <button onClick={handleSaveOPD} disabled={savingOPD} className="flex-1 btn-primary flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {savingOPD ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        )}

        {!editingOPD && OPD_FIELDS.map(({ key, label, title }) => {
          const value = record[key as keyof OPDRecord]
          if (!value) return null
          return (
            <div key={key} className="card">
              <p className="text-xs mb-1.5">
                <span className="font-bold text-primary-600 dark:text-primary-400">{label}</span>
                <span className="text-gray-400"> — {title}</span>
              </p>
              <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed">{value as string}</p>
            </div>
          )
        })}
      </div>

      {/* Photos */}
      {(record.photo1_url || record.photo2_url) && (
        <div>
          <p className="label mb-2">รูปภาพ</p>
          <div className="grid grid-cols-2 gap-3">
            {[{ url: record.photo1_url, caption: record.photo1_caption }, { url: record.photo2_url, caption: record.photo2_caption }]
              .filter(p => p.url).map((p, i) => (
                <div key={i} className="space-y-1.5">
                  <a href={p.url!} target="_blank" rel="noopener noreferrer"
                    className="block relative h-44 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <Image src={p.url!} alt={p.caption || ''} fill className="object-cover hover:opacity-90 transition-opacity" />
                  </a>
                  {p.caption && <p className="text-xs text-gray-500 text-center">{p.caption}</p>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>

    <OPDPrintView record={record} vetTitle={vetTitle} />
    </>
  )
}

/* ---------- Printable A4 summary (hidden on screen) ---------- */
function OPDPrintView({ record, vetTitle }: { record: OPDRecord; vetTitle: string | null }) {
  const pet = record.pets
  const ownerName = (pet?.profiles as any)?.full_name ?? null
  const photos = [
    { url: record.photo1_url, caption: record.photo1_caption },
    { url: record.photo2_url, caption: record.photo2_caption },
  ].filter(p => p.url)

  const TEAL_TINT = '#e8f4ef'
  const TEAL_TEXT = '#0f5f4a'
  const hasPhotos = photos.length > 0

  const SideRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ fontSize: 10.5, marginBottom: 4 }}>
      <div style={{ color: TEAL_TEXT, fontSize: 9 }}>{label}</div>
      <div style={{ fontWeight: 600, color: '#111' }}>{value}</div>
    </div>
  )

  return (
    <div className="print-only" style={{ color: '#111', fontFamily: 'inherit', lineHeight: 1.3 }}>

      {/* ===== TOP 60%: sidebar (pet) + main (SOAP) ===== */}
      <div style={{ flex: hasPhotos ? '0 0 60%' : '1 1 auto', display: 'flex', gap: '5mm', minHeight: 0 }}>

        {/* Sidebar — pet info */}
        <div style={{ flex: '0 0 44mm', background: TEAL_TINT, borderRadius: 8, padding: '8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pet?.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pet.photo_url} alt={pet.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid #cdddd6' }} />
          )}
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15 }}>{pet?.name}</div>
          <div>
            <SideRow label="ชนิด / พันธุ์" value={`${pet?.species || '-'}${pet?.breed ? ` / ${pet.breed}` : ''}`} />
            <SideRow label="เพศ" value={`${pet?.gender || '-'}${pet?.neutered ? ' · ทำหมันแล้ว' : ''}`} />
            {pet?.birthdate && <SideRow label="วันเกิด" value={fmtDate(pet.birthdate)} />}
            {pet?.birthdate && <SideRow label="อายุ" value={calcAge(pet.birthdate)} />}
            {ownerName && <SideRow label="เจ้าของ" value={ownerName} />}
            {record.weight != null && <SideRow label="น้ำหนัก" value={`${record.weight} kg`} />}
          </div>
          {pet?.medical_tags?.length ? (
            <div style={{ fontSize: 9.5, color: '#b91c1c', marginTop: 'auto' }}>
              ⚠️ {pet.medical_tags.join(', ')}
            </div>
          ) : null}
        </div>

        {/* Main — header + SOAP */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 5, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>บันทึกการตรวจรักษา (OPD)</div>
              {record.clinics && <div style={{ fontSize: 11, color: '#444' }}>{record.clinics.name}</div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: '#444' }}>
              <div>วันที่ตรวจ: {fmtDate(record.record_date)}</div>
              <div>บันทึก: {fmtDatetime(record.created_at)}</div>
            </div>
          </div>

          {/* SOAP — all 8, evenly distributed to fill the zone */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {OPD_FIELDS.map(({ key, label, title }) => {
              const val = (record as any)[key] as string | null
              return (
                <div key={key} style={{ flex: 1, fontSize: 10, borderBottom: '0.5px solid #e2e2e2', padding: '2px 0', overflow: 'hidden' }}>
                  <span style={{ fontWeight: 700 }}>{label}</span>
                  <span style={{ color: '#999', fontSize: 8.5 }}> · {title}</span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{val ? `  ${val}` : ''}</span>
                </div>
              )
            })}
          </div>

          {record.next_appointment && (
            <div style={{ fontSize: 10, marginTop: 4 }}>
              <b>นัดหมายถัดไป:</b> {fmtDate(record.next_appointment)}
            </div>
          )}

          {/* ผู้ตรวจรักษา */}
          <div style={{ fontSize: 10, marginTop: 6, paddingTop: 5, borderTop: '0.5px solid #ccc', display: 'flex', justifyContent: 'space-between' }}>
            <span><b>ผู้ตรวจรักษา:</b> {record.vet?.full_name ? `${vetTitle ? vetTitle + ' ' : ''}${record.vet.full_name}` : '—'}</span>
            <span style={{ color: '#888' }}>ลงชื่อ ..............................</span>
          </div>
        </div>
      </div>

      {/* ===== BOTTOM 40%: attached photos ===== */}
      {hasPhotos && (
        <div style={{ flex: '0 0 40%', display: 'flex', gap: '5mm', paddingTop: '5mm', minHeight: 0 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* contain (not cover) so the whole photo prints — cover cropped heads/tails of portrait shots */}
              <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#f5f5f5', borderRadius: 6, border: '1px solid #ccc', overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url!} alt={p.caption || ''}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              {p.caption && <div style={{ fontSize: 9.5, color: '#555', textAlign: 'center', marginTop: 2 }}>{p.caption}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
