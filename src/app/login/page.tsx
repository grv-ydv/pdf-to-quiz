'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const { login, loginWithGoogle } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            router.push('/dashboard');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            setError(message);
        }
        setLoading(false);
    }

    async function handleGoogle() {
        setError('');
        try {
            await loginWithGoogle();
            // Google OAuth redirects, so the AuthContext handles navigation
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Google sign-in failed';
            setError(message);
        }
    }

    return (
        <div className="page-center" style={{ minHeight: '100vh' }}>
            <div className="fade-in" style={{ width: '100%', maxWidth: '400px', padding: '0 20px' }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <div style={{
                        width: '56px', height: '56px', borderRadius: 'var(--radius)',
                        background: 'var(--accent)', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '24px', margin: '0 auto 16px',
                    }}>📝</div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>Welcome back</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                        Sign in to continue to PDF Quiz
                    </p>
                </div>

                {/* Google Login */}
                <button className="btn btn-secondary" onClick={handleGoogle}
                    style={{ width: '100%', marginBottom: '20px', justifyContent: 'center', gap: '10px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </button>

                {/* Divider */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
                    color: 'var(--text-muted)', fontSize: '13px',
                }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    or
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>

                {/* Email Login Form */}
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label className="label"><Mail size={13} /> Email</label>
                        <input className="input" type="email" placeholder="you@example.com"
                            value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label className="label"><Lock size={13} /> Password</label>
                        <div style={{ position: 'relative' }}>
                            <input className="input" type={showPassword ? 'text' : 'password'}
                                placeholder="Enter your password"
                                value={password} onChange={e => setPassword(e.target.value)} required
                                style={{ paddingRight: '42px' }} />
                            <button type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', padding: '4px',
                                }}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {error && <p className="error-text">{error}</p>}

                    <button className="btn btn-primary" type="submit" disabled={loading}
                        style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                        {loading ? 'Signing in...' : <><LogIn size={16} /> Sign In</>}
                    </button>
                </form>

                {/* Footer */}
                <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-muted)' }}>
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}
