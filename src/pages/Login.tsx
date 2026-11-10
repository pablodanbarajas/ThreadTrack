import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Notice } from '../components/ui/StatusBadge'
import { Loader2, Mail, Lock, Eye, EyeOff, QrCode, ShieldCheck, FileClock } from 'lucide-react'
import Logo from '/CSCI_Logo_Color_Sin_Fondo.png'

const highlights = [
  { icon: QrCode, title: 'Trazabilidad por QR', text: 'Cada prenda y manguera con su historial completo.' },
  { icon: ShieldCheck, title: 'Firma electrónica', text: 'Acciones críticas firmadas con nombre y significado.' },
  { icon: FileClock, title: 'Registro de auditoría', text: 'Quién, qué, cuándo y por qué de cada cambio.' },
]

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, user } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || '/'

  // Si ya está autenticado, redirigir a la página de origen o inicio
  if (user) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await signIn(email, password)

      if (error) {
        setError(error.message || 'Credenciales inválidas')
        setLoading(false)
      }
      // Si no hay error, el AuthContext actualizará el user y redirigirá automáticamente
    } catch {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Panel de marca */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-white p-2 shadow-lg">
            <img src={Logo} alt="" className="h-10 w-auto" />
          </div>
          <span className="text-2xl font-bold tracking-tight">ThreadTrack</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            Control y trazabilidad de prendas y mangueras
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Registros íntegros, atribuibles y listos para auditoría.
          </p>
          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300 ring-1 ring-inset ring-white/15">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-slate-500">© 2026 ThreadTrack · Grupo CSCI</p>
      </aside>

      {/* Formulario */}
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10 sm:px-8 lg:rounded-l-3xl lg:bg-slate-100">
        <div className="w-full max-w-lg">
          {/* Encabezado móvil */}
          <div className="mb-8 flex flex-col items-center gap-3 text-white lg:hidden">
            <div className="rounded-xl bg-white p-2 shadow-lg">
              <img src={Logo} alt="" className="h-12 w-auto" />
            </div>
            <span className="text-2xl font-bold">ThreadTrack</span>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5 sm:p-10">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Iniciar sesión</h1>
            <p className="mt-1 text-gray-500">Ingresa con tu cuenta asignada.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && <Notice tone="error">{error}</Notice>}

              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field py-3 pl-11 text-base"
                    placeholder="correo@empresa.com"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field py-3 pl-11 pr-12 text-base"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  'Iniciar sesión'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              ¿Olvidaste tu contraseña? Pide al administrador de tu empresa que la restablezca.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400 lg:hidden">© 2026 ThreadTrack · Grupo CSCI</p>
        </div>
      </main>
    </div>
  )
}

export default Login
