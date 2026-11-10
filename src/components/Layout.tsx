import { Outlet, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Home, Package, PackageX, LogOut, Plus, Layers, Users, Waves, History, KeyRound,
  ChevronsLeft, ChevronsRight, Menu, X, UserCircle,
} from 'lucide-react'
import { useAuth, useRole } from '../contexts/AuthContext'
import { APP_VERSION } from '../version'
import { useFeedback } from './ui/feedback-context'
import { Notice } from './ui/StatusBadge'
import { userService } from '../services/userService'
import Logo from '/CSCI_Logo_Color_Sin_Fondo.png'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** Rutas hijas que también marcan el elemento como activo */
  match?: string[]
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const STORAGE_KEY = 'threadtrack.sidebar.collapsed'

const readCollapsed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const Layout = () => {
  const location = useLocation()
  const { user, signOut, role, isSuperadmin, displayName, fullName, refreshProfile } = useAuth()
  const feedback = useFeedback()
  const { canViewPrendas, canViewMangueras, canViewReports, canCreateGarment } = useRole()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* almacenamiento no disponible */
    }
  }, [collapsed])

  const sections: NavSection[] = [
    ...(canViewPrendas ? [{
      title: 'Prendas',
      items: [
        { path: '/', label: 'Inicio', icon: Home },
        { path: '/inventory', label: 'Inventario', icon: Package, match: ['/prenda/', '/scanner'] },
        { path: '/lote', label: 'Acciones en lote', icon: Layers },
        ...(canCreateGarment ? [{ path: '/crear-prenda', label: 'Crear prenda', icon: Plus }] : []),
        { path: '/bajas', label: 'Bajas', icon: PackageX },
      ],
    }] : []),
    ...(canViewMangueras ? [{
      title: 'Mangueras',
      items: [{ path: '/mangueras', label: 'Equipos y mangueras', icon: Waves, match: ['/mangueras/'] }],
    }] : []),
    ...((canViewReports || role === 'administrador') ? [{
      title: 'Gestión',
      items: [
        ...(canViewReports ? [{ path: '/reportes', label: 'Reportes', icon: History }] : []),
        ...(role === 'administrador' ? [{ path: '/admin/usuarios', label: 'Usuarios', icon: Users }] : []),
      ],
    }] : []),
  ]

  // Usuarios existentes sin nombre completo: lo registran una vez
  const askFullName = async () => {
    const name = await feedback.prompt({
      title: 'Registra tu nombre completo',
      message: 'Aparecerá en tus registros, firmas electrónicas y reportes. Después solo el administrador podrá cambiarlo.',
      label: 'Nombre completo',
      placeholder: 'Nombre y apellidos',
      required: true,
      confirmLabel: 'Guardar',
    })
    if (!name) return
    try {
      await userService.setMyFullName(name)
      await refreshProfile()
      feedback.success('Nombre registrado')
    } catch (err) {
      feedback.error((err as Error).message || 'No se pudo guardar el nombre')
    }
  }

  const isActive = (item: NavItem) =>
    location.pathname === item.path || (item.match ?? []).some((m) => location.pathname.startsWith(m))

  const roleLabel = isSuperadmin ? 'Superadmin' : role ? role.charAt(0).toUpperCase() + role.slice(1) : ''

  const sidebar = (isMobile: boolean) => {
    const compact = collapsed && !isMobile
    return (
      <div className="flex h-full flex-col bg-slate-900 text-slate-300">
        {/* Marca */}
        <div className={`flex items-center border-b border-white/10 ${compact ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4'}`}>
          <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 min-w-0">
            <img src={Logo} alt="ThreadTrack" className="h-8 w-auto shrink-0" />
            {!compact && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold text-white">ThreadTrack</p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Trazabilidad · v{APP_VERSION}</p>
              </div>
            )}
          </Link>
          {isMobile ? (
            <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
          ) : !compact && (
            <button onClick={() => setCollapsed(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Contraer menú">
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Usuario */}
        <div className={`border-b border-white/10 ${compact ? 'flex justify-center py-3' : 'px-4 py-3'}`}>
          {compact ? (
            <span title={`${displayName} · ${roleLabel}`}><UserCircle className="h-5 w-5 text-slate-400" /></span>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                {displayName !== user?.email && <p className="truncate text-[11px] text-slate-400">{user?.email}</p>}
                <span className="mt-0.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                  {roleLabel}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.title && !compact && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{section.title}</p>
              )}
              {section.title && compact && si > 0 && <div className="mx-3 mb-2 border-t border-white/10" />}
              {section.items.map((item) => {
                const active = isActive(item)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={compact ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`mb-0.5 flex items-center rounded-lg text-sm transition-colors ${
                      compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
                    } ${active ? 'bg-blue-600 font-medium text-white' : 'hover:bg-white/5 hover:text-white'}`}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Pie */}
        <div className="border-t border-white/10 px-2 py-2">
          <Link
            to="/cambiar-contrasena"
            title={compact ? 'Cambiar contraseña' : undefined}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center rounded-lg text-sm hover:bg-white/5 hover:text-white ${compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'}`}
          >
            <KeyRound className="h-[18px] w-[18px] shrink-0" />
            {!compact && 'Cambiar contraseña'}
          </Link>
          <button
            onClick={signOut}
            title={compact ? 'Cerrar sesión' : undefined}
            className={`flex w-full items-center rounded-lg text-sm hover:bg-white/5 hover:text-white ${compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'}`}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!compact && 'Cerrar sesión'}
          </button>
          {compact && !isMobile && (
            <button onClick={() => setCollapsed(false)} className="mt-1 flex w-full justify-center rounded-lg px-2 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white" title="Expandir menú">
              <ChevronsRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Menú lateral (escritorio) */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 md:block ${collapsed ? 'w-[72px]' : 'w-64'}`}>
        {sidebar(false)}
      </aside>

      {/* Menú lateral (móvil) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{sidebar(true)}</aside>
        </div>
      )}

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
        <img src={Logo} alt="" className="h-6 w-auto" />
        <span className="font-semibold text-gray-900">ThreadTrack</span>
      </header>

      {/* Contenido */}
      <main className={`transition-[padding] duration-200 ${collapsed ? 'md:pl-[72px]' : 'md:pl-64'}`}>
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          {user && !fullName && (
            <Notice
              tone="warning"
              title="Falta tu nombre completo"
              className="mb-5"
              action={<button onClick={askFullName} className="btn-primary shrink-0 py-1.5 text-sm">Registrar nombre</button>}
            >
              Es necesario para que tus registros y firmas electrónicas muestren tu nombre impreso.
            </Notice>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Layout
