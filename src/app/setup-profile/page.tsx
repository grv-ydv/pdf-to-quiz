'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { User, Camera, Phone, Calendar, BookOpen, ArrowRight } from 'lucide-react';

export default function SetupProfilePage() {
    const { user, refreshProfile } = useAuth();
    const router = useRouter();
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [dob, setDob] = useState('');
    const [exam, setExam] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [loading, setLoading] = useState(false);

    function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !name.trim()) return;

        setLoading(true);
        try {
            let photoURL = '';
            if (photoFile) {
                const filePath = `avatars/${user.id}/${Date.now()}_${photoFile.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, photoFile, { upsert: true });

                if (!uploadError) {
                    const { data: urlData } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(filePath);
                    photoURL = urlData.publicUrl;
                }
            }

            await supabase
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email || '',
                    display_name: name.trim(),
                    photo_url: photoURL,
                    mobile: mobile.trim() || null,
                    dob: dob || null,
                    exam: exam.trim() || null,
                    profile_completed: true,
                });

            await refreshProfile();
            router.push('/dashboard');
        } catch (err) {
            console.error('Profile setup error:', err);
        }
        setLoading(false);
    }

    return (
        <div className="page-center" style={{ background: 'var(--bg-primary)' }}>
            <div className="fade-in" style={{ width: '100%', maxWidth: '440px' }}>
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>
                        Set up your profile
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        Just the basics — you can update this later
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Profile Photo */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <label style={{ position: 'relative', cursor: 'pointer' }}>
                            <div style={{
                                width: '88px', height: '88px', borderRadius: '50%',
                                background: photoPreview ? `url(${photoPreview}) center/cover` : 'var(--bg-elevated)',
                                border: '2px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden',
                            }}>
                                {!photoPreview && <Camera size={28} color="var(--text-muted)" />}
                            </div>
                            <div style={{
                                position: 'absolute', bottom: '0', right: '0',
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid white',
                            }}>
                                <Camera size={12} color="#fff" />
                            </div>
                            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
                        </label>
                    </div>

                    {/* Name — Required */}
                    <div>
                        <label className="label">Full Name *</label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="input" type="text" placeholder="Your name"
                                value={name} onChange={e => setName(e.target.value)} required
                                style={{ paddingLeft: '38px' }} />
                        </div>
                    </div>

                    {/* Mobile — Optional */}
                    <div>
                        <label className="label">Mobile Number <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                        <div style={{ position: 'relative' }}>
                            <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="input" type="tel" placeholder="+91 99999 99999"
                                value={mobile} onChange={e => setMobile(e.target.value)}
                                style={{ paddingLeft: '38px' }} />
                        </div>
                    </div>

                    {/* DOB — Optional */}
                    <div>
                        <label className="label">Date of Birth <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                        <div style={{ position: 'relative' }}>
                            <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="input" type="date"
                                value={dob} onChange={e => setDob(e.target.value)}
                                style={{ paddingLeft: '38px' }} />
                        </div>
                    </div>

                    {/* Exam Preparing For — Optional */}
                    <div>
                        <label className="label">Exam Preparing For <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                        <div style={{ position: 'relative' }}>
                            <BookOpen size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="input" type="text" placeholder="e.g. JEE, NEET, UPSC..."
                                value={exam} onChange={e => setExam(e.target.value)}
                                style={{ paddingLeft: '38px' }} />
                        </div>
                    </div>

                    <button className="btn btn-primary btn-lg" type="submit" disabled={loading || !name.trim()}
                        style={{ width: '100%', marginTop: '8px' }}>
                        {loading ? 'Saving...' : 'Continue'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>
            </div>
        </div>
    );
}
