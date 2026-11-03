'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { placementService, PlacementCelebration } from '@/lib/services/placementService';
import { galleryService } from '@/lib/services/galleryService';
import { Award, Plus, Trash2, Eye, EyeOff, ImagePlus, AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminPlacementsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<PlacementCelebration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [publishNow, setPublishNow] = useState(true);
  const [form, setForm] = useState({
    alumni_name: '',
    company_name: '',
    designation: '',
    department: 'Computer Science',
    batch_year: '',
    message: '',
  });

  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') router.replace('/student');
  }, [authLoading, user, router]);

  const loadRecords = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setLoading(true);
    setError(null);
    try {
      setRecords(await placementService.getAdminRecords());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load placements.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photoConsent) {
      setError('Confirm that the alumnus has agreed to publish their photo and placement details.');
      return;
    }
    if (!photoFile) {
      setError('Please upload a photo of the placed alumnus.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const uploaded = await galleryService.uploadPhoto({
        title: `Placement celebration — ${form.alumni_name.trim()}`,
        description: `Placement at ${form.company_name.trim()}`,
        category: 'other',
        batch_year: form.batch_year || undefined,
        file: photoFile,
      });

      await placementService.create({
        ...form,
        photo_url: galleryService.getImageUrl(uploaded.id),
        photo_consent: true,
        is_published: publishNow,
      });

      setForm({ alumni_name: '', company_name: '', designation: '', department: 'Computer Science', batch_year: '', message: '' });
      setPhotoFile(null);
      setPhotoConsent(false);
      setSuccess(publishNow ? 'Placement celebration published on the homepage.' : 'Placement record saved as a draft.');
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save placement.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (record: PlacementCelebration) => {
    try {
      await placementService.update(record.id, { is_published: !record.is_published });
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update publishing status.');
    }
  };

  const handleDelete = async (record: PlacementCelebration) => {
    if (!window.confirm(`Delete the placement celebration for ${record.alumni_name}?`)) return;
    try {
      await placementService.remove(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete placement.');
    }
  };

  if (authLoading || !user || user.role !== 'admin') {
    return <DashboardLayout><div className="p-10 text-center text-sm text-[#6B6B6B]">Checking administrator access…</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#C56A25] mb-2">Homepage content</p>
          <h1 className="text-2xl font-black text-[#4A3832]">Placement Celebrations</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">Publish verified alumni placement stories to the public SOET Connect homepage.</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

        <form onSubmit={handleCreate} className="bg-white border border-[#E5DDD5] rounded-2xl p-5 sm:p-7 shadow-sm space-y-5">
          <div className="flex items-center gap-2"><Plus className="w-5 h-5 text-[#C56A25]" /><h2 className="font-bold text-[#4A3832]">Add placement story</h2></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Alumni full name *
              <input required minLength={2} value={form.alumni_name} onChange={(e) => setForm({ ...form, alumni_name: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" placeholder="e.g. Rahul Sharma" />
            </label>
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Company *
              <input required minLength={2} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" placeholder="e.g. Yardi Systems" />
            </label>
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Designation
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" placeholder="e.g. Software Engineer" />
            </label>
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Department
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Batch year
              <input value={form.batch_year} onChange={(e) => setForm({ ...form, batch_year: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" placeholder="2026" />
            </label>
            <label className="text-xs font-semibold text-[#5D5048] space-y-1.5">Short congratulations note
              <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBF9F6] px-3 py-2.5 text-sm" placeholder="Wishing you success in your new journey!" />
            </label>
          </div>

          <div className="rounded-xl border border-dashed border-[#D6C7B9] bg-[#FBF9F6] p-4">
            <label className="block text-xs font-semibold text-[#5D5048] mb-2">Alumni photograph * (JPG, PNG or WebP; max 8 MB)</label>
            <input type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="block w-full text-xs text-[#6B6B6B] file:mr-3 file:rounded-lg file:border-0 file:bg-[#F28C38] file:px-3 file:py-2 file:text-white" />
            {photoFile && <p className="text-xs text-[#6B6B6B] mt-2 flex items-center gap-1"><ImagePlus className="w-3.5 h-3.5" />{photoFile.name}</p>}
            <p className="text-[11px] text-[#83766D] mt-2">The photo is also submitted to the public alumni gallery using the existing gallery upload flow.</p>
          </div>

          <label className="flex items-start gap-2 text-xs text-[#5D5048]">
            <input type="checkbox" required checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} className="mt-0.5 accent-[#F28C38]" />
            I confirm the alumnus has given permission to display their photograph, name and placement details publicly.
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#5D5048]">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="accent-[#F28C38]" />
            Publish immediately on the public homepage
          </label>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#F28C38] hover:bg-[#E07D2E] disabled:opacity-50 px-5 py-2.5 text-sm font-bold text-white">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              {saving ? 'Saving placement…' : 'Save placement story'}
            </button>
          </div>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-bold text-[#4A3832]">All placement records</h2><button onClick={loadRecords} className="text-xs font-bold text-[#A75A24]">Refresh</button></div>
          {loading ? <div className="p-8 text-center text-sm text-[#6B6B6B]">Loading placement records…</div> : records.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD5] p-8 text-center text-sm text-[#83766D]">No placement records have been added yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {records.map((record) => (
                <article key={record.id} className="bg-white rounded-2xl border border-[#E5DDD5] p-4 flex gap-4">
                  <div className="w-20 h-20 shrink-0 rounded-xl bg-[#F3E6DA] overflow-hidden">
                    {record.photo_url ? <img src={record.photo_url} alt={record.alumni_name} className="w-full h-full object-cover" /> : <Award className="w-8 h-8 m-6 text-[#B77A4C]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[#4A3832] truncate">{record.alumni_name}</h3>
                    <p className="text-sm text-[#A75A24] font-semibold">{record.company_name}</p>
                    <p className="text-xs text-[#8C8178] mt-1">{record.designation || 'Placement'}{record.batch_year ? ` · ${record.batch_year}` : ''}</p>
                    <span className={`inline-flex mt-2 rounded-full px-2 py-1 text-[10px] font-bold ${record.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{record.is_published ? 'Published' : 'Draft'}</span>
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={() => handleTogglePublish(record)} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#A75A24]">
                        {record.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{record.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button onClick={() => handleDelete(record)} className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
