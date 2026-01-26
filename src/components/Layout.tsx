import { Outlet, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Home, Package, Menu, X, Shirt, AlertTriangle, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const Layout = () => {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut } = useAuth()

  const navItems = [
    { path: '/', label: 'Inicio', icon: Home },
    { path: '/inventory', label: 'Inventario', icon: Package },
    { path: '/bajas', label: 'Bajas', icon: AlertTriangle },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center space-x-2">
              <Shirt className="w-7 h-7" />
              <span className="text-xl font-bold">ThreadTrack</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors duration-200 ${
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
                className="flex items-center px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-blue-500 ml-4"
                title={user?.email}
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
              className={`flex flex-col items-center py-3 px-4 ${
                isActive(item.path) ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default Layout
