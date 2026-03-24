import { Outlet, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Home, Package, Menu, X, AlertTriangle, LogOut, Plus, ScanBarcode, Users, UserCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { APP_VERSION } from '../version'
import Logo from '/CSCI_Logo_Color_Sin_Fondo.png'

const Layout = () => {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut, role } = useAuth()

  const navItems = [
    { path: '/', label: 'Inicio', shortLabel: 'Inicio', icon: Home },
    { path: '/inventory', label: 'Inventario', shortLabel: 'Inventario', icon: Package },
    { path: '/bajas', label: 'Bajas', shortLabel: 'Bajas', icon: AlertTriangle },
    { path: '/lote', label: 'Acciones en Lote', shortLabel: 'En Lote', icon: ScanBarcode },
    { path: '/crear-prenda', label: 'Crear Prenda', shortLabel: 'Crear', icon: Plus },
    ...(role === 'administrador' ? [{ path: '/admin/usuarios', label: 'Gestionar Usuarios', shortLabel: 'Usuarios', icon: Users }] : []),
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center space-x-2">
              <img src={Logo} alt="ThreadTrack Logo" className="h-8 w-auto" />
              <span className="text-xl font-bold">ThreadTrack</span>
              <span className="ml-2 text-xs font-semibold bg-blue-800 text-blue-100 px-2 py-1 rounded-lg">v{APP_VERSION}</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-2 lg:px-4 py-2 rounded-lg transition-colors duration-200 text-sm ${
                    isActive(item.path)
                      ? 'bg-blue-700 text-white'
                      : 'hover:bg-blue-500'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-2" />
                  {item.label}
                </Link>
              ))}
              {/* Usuario logueado */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 rounded-lg text-sm ml-2">
                <UserCircle className="w-4 h-4 flex-shrink-0 text-blue-200" />
                <div className="flex flex-col leading-tight">
                  <span className="font-medium truncate max-w-[150px] text-white text-xs">{user?.email}</span>
                  <span className="text-blue-300 text-xs capitalize">{role}</span>
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-blue-500 ml-1"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Salir
              </button>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {menuOpen && (
            <nav className="md:hidden pb-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center px-4 py-2 rounded-lg mb-1 ${
                    isActive(item.path)
                      ? 'bg-blue-700 text-white'
                      : 'hover:bg-blue-500'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-2" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="flex items-center w-full px-4 py-2 rounded-lg mt-2 hover:bg-blue-500 border-t border-blue-500 pt-3"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Cerrar Sesión ({user?.email})
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="flex justify-around">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center py-2 flex-1 min-w-0 ${
                isActive(item.path) ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <item.icon className="w-6 h-6 shrink-0" />
              <span className="text-[10px] mt-0.5 leading-tight text-center w-full truncate px-1">{item.shortLabel}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default Layout
