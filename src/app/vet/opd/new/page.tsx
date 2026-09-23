'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Search, Plus, X, Upload, Hospital, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { compressImage } from '@/lib/compressImage'
import LoadingScreen from '@/components/LoadingScreen'
import SearchableSelect, { SelectOption } from '@/components/SearchableSelect'

const SPECIES = ['สุนัข', 'แมว', 'กระต่าย', 'นก', 'ปลา', 'อื่นๆ']
const GENDERS = ['เพศผู้', 'เพศเมีย', 'ไม่ระบุ']
const EMOJI: Record<string, string> = { สุนัข: '🐕', แมว: '🐈', กระต่าย: '🐇', นก: '🐦', ปลา: '🐟', อื่นๆ: '🐾' }

interface Clinic { id: string; name: string; type: string }
interface PetResult { id: string; name: string; species: string; breed: string | null; photo_url: string | null; owner_name: string | null; tags: string[] }

function MedicalTags({ tags }: { tags: string[] }) {
  if (!tags?.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(t => (
        <span key={t} className="text-xs bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">⚠️ {t}</span>
      ))}
    </div>
  )
}

const OPD_FIELDS = [
  { key: 'cc',      label: 'CC',      title: 'Chief Complaint',        hint: 'อาการหลักที่นำมาพบ' },
  { key: 'hx',      label: 'Hx',      title: 'History Taking',         hint: 'ประวัติการเลี้ยง อาหาร วัคซีน' },
  { key: 'pe',      label: 'PE',      title: 'Physical Examination',   hint: 'ผลการตรวจร่างกาย' },
  { key: 'diff_dx', label: 'Diff Dx', title: 'Differential Diagnosis', hint: 'การวินิจฉัยแยกโรค' },
  { key: 'dx',      label: 'Dx',      title: 'Tentative Diagnosis',    hint: 'การวินิจฉัยโรค' },
  { key: 'tx',      label: 'Tx',      title: 'Treatment',              hint: 'การรักษา หัตถการ' },
  { key: 'rx',      label: 'Rx',      title: 'Prescription',           hint: 'ยาที่สั่ง ขนาด วิธีใช้' },
  { key: 'ce',      label: 'CE',      title: 'Client Education',       hint: 'คำแนะนำสำหรับเจ้าของ' },
] as const

type OPDKey = typeof OPD_FIELDS[number]['key']

export default function NewOPDPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'clinic' | 'pet' | 'form'>('clinic')

  // Clinic
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [clinicQuery, setClinicQuery] = useState('')
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)

  // Pet
  const [petQuery, setPetQuery] = useState('')
  const [petResults, setPetResults] = useState<PetResult[]>([])
  const [petSearching, setPetSearching] = useState(false)
  const [selectedPet, setSelectedPet] = useState<PetResult | null>(null)
  const [showCreatePet, setShowCreatePet] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSpecies, setNewSpecies] = useState('สุนัข')
  const [newBreed, setNewBreed] = useState('')
  const [breedOptions, setBreedOptions] = useState<SelectOption[]>([])
  const [loadingBreeds, setLoadingBreeds] = useState(false)
  const [newGender, setNewGender] = useState('ไม่ระบุ')
  const [newNeutered, setNewNeutered] = useState(false)
  const [newTags, setNewTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [creatingPet, setCreatingPet] = useState(false)

  useEffect(() => {
    if (newSpecies === 'อื่นๆ' || newSpecies === 'ปลา') { setBreedOptions([]); setNewBreed(''); return }
    setLoadingBreeds(true)
    setNewBreed('')
    supabase.from('pet_breeds').select('id, name, name_en').eq('species', newSpecies).order('name')
      .then(({ data }) => {
        setBreedOptions((data || []).map((b: any) => ({ value: b.name, label: b.name_en ? `${b.name} / ${b.name_en}` : b.name })))
        setLoadingBreeds(false)
      })
  }, [newSpecies])

  const addNewTag = (val: string) => {
    const t = val.trim()
    if (t && !newTags.includes(t)) setNewTags(prev => [...prev, t])
    setNewTagInput('')
  }

  // OPD
  const today = new Date().toISOString().split('T')[0]
  const [recordDate, setRecordDate] = useState(today)
  const [weight, setWeight] = useState('')
  const [lastWeight, setLastWeight] = useState<number | null>(null)
  const [fields, setFields] = useState<Record<OPDKey, string>>({
    cc: '', hx: '', pe: '', diff_dx: '', dx: '', tx: '', rx: '', ce: '',
  })
  const [nextAppt, setNextAppt] = useState('')

  // Photos
  const [photo1, setPhoto1] = useState<{ file: File; preview: string; caption: string } | null>(null)
  const [photo2, setPhoto2] = useState<{ file: File; preview: string; caption: string } | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('clinics')
        .select('id, name, type')
        .eq('status', 'approved')
        .order('name')
      const list = (data as Clinic[]) || []
      setClinics(list)
      if (list.length === 1) { setSelectedClinic(list[0]); setStep('pet') }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (petQuery.trim().length < 2) { setPetResults([]); setPetSearching(false); return }
    setPetSearching(true)
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('pets')
        .select('id, name, species, breed, photo_url, owner_id, medical_tags, profiles!owner_id(full_name)')
        .ilike('name', `%${petQuery.trim()}%`)
        .limit(10)
      setPetResults((data || []).map((p: any) => ({
        id: p.id, name: p.name, species: p.species, breed: p.breed,
        photo_url: p.photo_url ?? null,
        owner_name: p.profiles?.full_name ?? null,
        tags: p.medical_tags || [],
      })))
      setPetSearching(false)
    }, 350)
  }, [petQuery])

  useEffect(() => {
    if (!selectedPet) return
    supabase
      .from('opd_records')
      .select('weight')
      .eq('pet_id', selectedPet.id)
      .not('weight', 'is', null)
      .order('record_date', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastWeight((data?.[0] as any)?.weight ?? null))
  }, [selectedPet])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, num: 1 | 2) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    const setter = num === 1 ? setPhoto1 : setPhoto2
    setter({ file, preview, caption: '' })
    e.target.value = ''
  }

  const uploadPhoto = async (original: File) => {
    // phone photos are 2–5 MB; 1600px @ ≤500 KB still prints sharp on A4
    const file = await compressImage(original, { maxWidthPx: 1600, qualityJpeg: 0.8, maxSizeKB: 500 })
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('opd-photos').upload(path, file)
    if (error) { toast.error('อัพโหลดรูปไม่สำเร็จ: ' + error.message); return null }
    return supabase.storage.from('opd-photos').getPublicUrl(data.path).data.publicUrl
  }

  const handleCreatePet = async () => {
    if (!newName.trim()) { toast.error('กรุณาใส่ชื่อสัตว์เลี้ยง'); return }
    setCreatingPet(true)
    const { data, error } = await supabase
      .from('pets')
      .insert({ name: newName.trim(), species: newSpecies, breed: newBreed.trim() || null, gender: newGender, neutered: newNeutered, medical_tags: newTags, owner_id: null })
      .select('id, name, species, breed')
      .single()
    setCreatingPet(false)
    if (error) { toast.error('สร้างไม่สำเร็จ: ' + error.message); return }
    setSelectedPet({ id: data.id, name: data.name, species: data.species, breed: data.breed, photo_url: null, owner_name: null, tags: newTags })
    setNewTags([]); setNewTagInput(''); setNewNeutered(false)
    setShowCreatePet(false)
    setStep('form')
    toast.success('สร้างสัตว์เลี้ยงแล้ว')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPet || !selectedClinic) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let photo1_url = null, photo2_url = null
    if (photo1) photo1_url = await uploadPhoto(photo1.file)
    if (photo2) photo2_url = await uploadPhoto(photo2.file)

    const { data, error } = await supabase.from('opd_records').insert({
      pet_id: selectedPet.id, vet_id: user.id, clinic_id: selectedClinic.id,
      record_date: recordDate,
      weight: weight ? parseFloat(weight) : null,
      ...Object.fromEntries(OPD_FIELDS.map(f => [f.key, fields[f.key] || null])),
      next_appointment: nextAppt || null,
      photo1_url, photo1_caption: photo1?.caption || null,
      photo2_url, photo2_caption: photo2?.caption || null,
    }).select('id').single()

    setSaving(false)
    if (error) { toast.error('บันทึกไม่สำเร็จ: ' + error.message); return }
    toast.success('บันทึก OPD แล้ว')
    router.push(`/vet/opd/${data.id}`)
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/vet/opd" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary-600" /> บันทึก OPD
        </h1>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 text-sm">
        {(['clinic', 'pet', 'form'] as const).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">›</span>}
            <span className={step === s ? 'font-semibold text-primary-600' : step > s ? 'text-gray-400 line-through' : 'text-gray-400'}>
              {i + 1}. {s === 'clinic' ? 'เลือกคลินิก' : s === 'pet' ? 'เลือกสัตว์เลี้ยง' : 'บันทึก OPD'}
            </span>
          </span>
        ))}
      </div>

      {/* ── Step 1: Clinic ── */}
      {step === 'clinic' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={clinicQuery}
              onChange={e => setClinicQuery(e.target.value)}
              placeholder="ค้นหาคลินิก / โรงพยาบาล..."
              className="input pl-9 w-full"
              autoFocus
            />
          </div>
          {clinics.filter(c => c.name.toLowerCase().includes(clinicQuery.toLowerCase())).length === 0 ? (
            <div className="card text-center py-12">
              <Hospital className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">{clinicQuery ? 'ไม่พบคลินิกที่ค้นหา' : 'ยังไม่มีคลินิกในระบบ'}</p>
            </div>
          ) : clinics.filter(c => c.name.toLowerCase().includes(clinicQuery.toLowerCase())).map(c => (
            <button key={c.id} onClick={() => { setSelectedClinic(c); setStep('pet') }}
              className="card w-full text-left flex items-center gap-3 hover:shadow-md transition-shadow">
              <Hospital className="w-5 h-5 text-primary-600 shrink-0" />
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-gray-400">{c.type === 'hospital' ? 'โรงพยาบาลสัตว์' : 'คลินิก'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Step 2: Pet ── */}
      {step === 'pet' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button onClick={() => setStep('clinic')} className="hover:text-primary-600">← เปลี่ยนคลินิก</button>
            <span>·</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{selectedClinic?.name}</span>
          </div>

          {!showCreatePet ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={petQuery} onChange={e => setPetQuery(e.target.value)}
                  placeholder="ค้นหาชื่อสัตว์เลี้ยงในระบบ..." className="input pl-9" autoFocus />
              </div>

              {petSearching && <p className="text-sm text-center text-gray-400">กำลังค้นหา...</p>}

              {petResults.length > 0 && (
                <div className="space-y-2">
                  {petResults.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPet(p); setStep('form') }}
                      className="card w-full text-left flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        {p.photo_url
                          ? <Image src={p.photo_url} alt={p.name} width={48} height={48} className="w-full h-full object-cover" />
                          : <span className="text-2xl">{EMOJI[p.species] || '🐾'}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm text-gray-500">{p.species}{p.breed ? ` · ${p.breed}` : ''}</p>
                        {p.owner_name
                          ? <p className="text-xs text-gray-400">เจ้าของ: {p.owner_name}</p>
                          : <p className="text-xs text-amber-500">ยังไม่มีเจ้าของในระบบ</p>}
                        <MedicalTags tags={p.tags} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {petQuery.trim().length >= 2 && !petSearching && petResults.length === 0 && (
                <p className="text-sm text-center text-gray-400">ไม่พบ "{petQuery}"</p>
              )}

              <button onClick={() => setShowCreatePet(true)}
                className="btn-secondary w-full flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> สร้างสัตว์เลี้ยงใหม่ (ไม่มีในระบบ)
              </button>
            </>
          ) : (
            <div className="card space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold">สร้างสัตว์เลี้ยงใหม่</h3>
                <button onClick={() => setShowCreatePet(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="label">ชื่อสัตว์เลี้ยง *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} className="input" placeholder="ชื่อสัตว์เลี้ยง" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ชนิด</label>
                  <select value={newSpecies} onChange={e => setNewSpecies(e.target.value)} className="input">
                    {SPECIES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">เพศ</label>
                  <select value={newGender} onChange={e => setNewGender(e.target.value)} className="input">
                    {GENDERS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">สายพันธุ์</label>
                {newSpecies === 'อื่นๆ' || newSpecies === 'ปลา' ? (
                  <input value={newBreed} onChange={e => setNewBreed(e.target.value)} className="input" placeholder="ระบุสายพันธุ์ (ถ้ามี)" />
                ) : (
                  <SearchableSelect
                    value={newBreed}
                    onChange={setNewBreed}
                    options={breedOptions}
                    loading={loadingBreeds}
                    placeholder="ค้นหาสายพันธุ์..."
                    freeTextPlaceholder="ระบุสายพันธุ์..."
                    notInListLabel="ไม่มีในรายการ — กรอกเอง"
                  />
                )}
              </div>
              <div>
                <label className="label">การทำหมัน</label>
                <div className="flex gap-2">
                  {[{ v: false, label: 'ยังไม่ได้ทำหมัน' }, { v: true, label: 'ทำหมันแล้ว' }].map(opt => (
                    <button key={String(opt.v)} type="button" onClick={() => setNewNeutered(opt.v)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors
                        ${newNeutered === opt.v
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <span className="text-red-500">⚠️</span> ข้อควรระวัง / สิ่งที่แพ้ / โรคประจำตัว
                </label>
                {newTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {newTags.map(t => (
                      <span key={t} className="flex items-center gap-1 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs px-2.5 py-1 rounded-full font-medium">
                        {t}
                        <button type="button" onClick={() => setNewTags(prev => prev.filter(x => x !== t))} className="text-red-400 hover:text-red-600 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(newTagInput) } }}
                    className="input flex-1 text-sm" placeholder="เช่น แพ้ penicillin, เบาหวาน..." />
                  <button type="button" onClick={() => addNewTag(newTagInput)} className="btn-secondary px-4 text-sm shrink-0">เพิ่ม</button>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 rounded-lg p-2.5">
                ⚠️ สัตว์เลี้ยงที่สร้างโดยหมอจะยังไม่ผูกกับเจ้าของ — เจ้าของสามารถขอเชื่อมภายหลังได้
              </p>
              <button onClick={handleCreatePet} disabled={creatingPet} className="btn-primary w-full">
                {creatingPet ? 'กำลังสร้าง...' : 'สร้างและเลือก'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: OPD Form ── */}
      {step === 'form' && selectedPet && selectedClinic && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Summary */}
          <div className="card bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{EMOJI[selectedPet.species] || '🐾'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-primary-800 dark:text-primary-200">{selectedPet.name}</p>
                <p className="text-xs text-primary-600 dark:text-primary-400">
                  {selectedPet.species}{selectedPet.breed ? ` · ${selectedPet.breed}` : ''}
                  {selectedPet.owner_name ? ` · เจ้าของ: ${selectedPet.owner_name}` : ' · ยังไม่มีเจ้าของ'}
                </p>
                <MedicalTags tags={selectedPet.tags || []} />
              </div>
              <div className="text-right text-xs text-primary-600 dark:text-primary-400">
                <p>{selectedClinic.name}</p>
                <button type="button" onClick={() => { setSelectedPet(null); setStep('pet') }}
                  className="underline hover:text-primary-800 dark:hover:text-primary-200">เปลี่ยน</button>
              </div>
            </div>
          </div>

          {/* Date + Weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">วันที่ตรวจ</label>
              <input type="date" value={recordDate} readOnly
                className="input bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="label flex items-baseline gap-1">
                น้ำหนัก (kg)
                {lastWeight !== null && (
                  <span className="text-xs text-gray-400 font-normal">(ครั้งก่อน: {lastWeight} kg)</span>
                )}
              </label>
              <input type="number" step="0.01" min="0" max="999"
                value={weight} onChange={e => setWeight(e.target.value)}
                className="input" placeholder="0.0" />
            </div>
          </div>

          {/* OPD Text Fields */}
          {OPD_FIELDS.map(({ key, label, title, hint }) => (
            <div key={key}>
              <label className="label">
                <span className="font-semibold text-primary-700 dark:text-primary-400">{label}</span>
                <span className="text-gray-500 font-normal"> — {title}</span>
              </label>
              <textarea
                value={fields[key]}
                onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                rows={3} placeholder={hint + '...'}
                className="input resize-y min-h-[4.5rem]"
              />
            </div>
          ))}

          {/* Photos */}
          <div>
            <label className="label">รูปภาพ (สูงสุด 2 รูป)</label>
            <div className="grid grid-cols-2 gap-3">
              {([1, 2] as const).map(num => {
                const photo = num === 1 ? photo1 : photo2
                const setPhoto = num === 1 ? setPhoto1 : setPhoto2
                return (
                  <div key={num} className="space-y-2">
                    <label className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer h-36 transition-colors overflow-hidden
                      ${photo ? 'border-primary-300' : 'border-gray-200 hover:border-primary-300 dark:border-gray-700 dark:hover:border-primary-600'}`}>
                      {photo ? (
                        <>
                          <Image src={photo.preview} alt="" fill className="object-cover" />
                          <button type="button" onClick={e => { e.preventDefault(); setPhoto(null) }}
                            className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center z-10 shadow">
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-gray-300" />
                          <span className="text-xs text-gray-400 mt-1">อัพโหลดรูป</span>
                        </>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoChange(e, num)} />
                    </label>
                    {photo && (
                      <input value={photo.caption}
                        onChange={e => setPhoto({ ...photo, caption: e.target.value })}
                        className="input text-sm" placeholder="Caption (ถ้ามี)" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Next Appointment */}
          <div>
            <label className="label">นัดหมายครั้งถัดไป</label>
            <input type="date" value={nextAppt} onChange={e => setNextAppt(e.target.value)}
              className="input" min={today} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
            {saving ? 'กำลังบันทึก...' : 'บันทึก OPD'}
          </button>
        </form>
      )}
    </div>
  )
}
