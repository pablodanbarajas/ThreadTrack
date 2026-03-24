import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
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
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="bajas" element={<Bajas />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="crear-prenda" element={<CreateGarment />} />
            <Route path="lote" element={<BatchActions />} />
            <Route path="prenda/:id" element={<GarmentDetail />} />
            <Route path="admin/usuarios" element={<ProtectedRoute requiredRole="administrador"><AdminUsers /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
