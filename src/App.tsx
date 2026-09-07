import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { GarmentCacheProvider } from './contexts/GarmentCacheContext'
import { HoseCacheProvider } from './contexts/HoseCacheContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Home from './pages/Home'
import Inventory from './pages/Inventory'
import Bajas from './pages/Bajas'
import Scanner from './pages/Scanner'
import CreateGarment from './pages/CreateGarment'
import GarmentDetail from './pages/GarmentDetail'
import AdminUsers from './pages/AdminUsers'
import Login from './pages/Login'
import BatchActions from './pages/BatchActions'
import HoseInventory from './pages/HoseInventory'
import HoseDetail from './pages/HoseDetail'
import CreateEquipment from './pages/CreateEquipment'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <GarmentCacheProvider>
                  <HoseCacheProvider>
                    <Layout />
                  </HoseCacheProvider>
                </GarmentCacheProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<ProtectedRoute requiredModule="prendas"><Home /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute requiredModule="prendas"><Inventory /></ProtectedRoute>} />
            <Route path="bajas" element={<ProtectedRoute requiredModule="prendas"><Bajas /></ProtectedRoute>} />
            <Route path="scanner" element={<ProtectedRoute requiredModule="prendas"><Scanner /></ProtectedRoute>} />
            <Route path="crear-prenda" element={<ProtectedRoute requiredModule="prendas"><CreateGarment /></ProtectedRoute>} />
            <Route path="lote" element={<ProtectedRoute requiredModule="prendas"><BatchActions /></ProtectedRoute>} />
            <Route path="prenda/:id" element={<ProtectedRoute requiredModule="prendas"><GarmentDetail /></ProtectedRoute>} />
            <Route path="mangueras" element={<ProtectedRoute requiredModule="mangueras"><HoseInventory /></ProtectedRoute>} />
            <Route path="mangueras/nuevo-equipo" element={<ProtectedRoute requiredModule="mangueras"><CreateEquipment /></ProtectedRoute>} />
            <Route path="mangueras/posicion/:positionId" element={<ProtectedRoute requiredModule="mangueras"><HoseDetail /></ProtectedRoute>} />
            <Route path="admin/usuarios" element={<ProtectedRoute requiredRole="administrador"><AdminUsers /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
