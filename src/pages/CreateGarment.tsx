import { useState, useRef } from 'react'
import QRCode from 'qrcode.react'
import { Plus, Download, Copy, RefreshCw, Loader } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import { generateQRUrl } from '../lib/qrGenerator'
import type { Garment, GarmentInsert } from '../types'

const CreateGarment = () => {
  const [formData, setFormData] = useState<GarmentInsert>({
    code: '',
    name: '',
    description: '',
    client_name: '',
    client_phone: '',
    notes: '',
  })
  const [createdGarment, setCreatedGarment] = useState<Garment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!formData.name || !formData.code) {
        throw new Error('El nombre y código de la prenda son obligatorios')
      }

      const garment = await garmentService.create(formData)
      setCreatedGarment(garment)
      setFormData({
        code: '',
        name: '',
        description: '',
        client_name: '',
        client_phone: '',
        notes: '',
      })
    } catch (err: any) {
      setError(err.message || 'Error al crear la prenda')
    } finally {
      setLoading(false)
    }
  }

  const downloadQR = () => {
    if (!createdGarment || !qrRef.current) return

    const element = qrRef.current.querySelector('canvas')
    if (!element) return

    const link = document.createElement('a')
    link.href = element.toDataURL('image/png')
    link.download = `qr-${createdGarment.code}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const copyQRUrl = () => {
    if (!createdGarment) return
    const url = generateQRUrl(createdGarment.id)
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const qrUrl = createdGarment ? generateQRUrl(createdGarment.id) : ''

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <Plus className="w-8 h-8 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-800">Crear Prenda con QR</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Formulario */}
        <div>
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Información de la Prenda
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código de Prenda *
                </label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="Ej: SHIRT-001"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej: Camisa blanca talla M"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Detalles adicionales..."
                  className="input-field"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={formData.client_name}
                  onChange={handleChange}
                  placeholder="Nombre del cliente"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  name="client_phone"
                  value={formData.client_phone}
                  onChange={handleChange}
                  placeholder="Teléfono del cliente"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Notas adicionales..."
                  className="input-field"
                  rows={2}
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Crear Prenda y QR
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* QR Preview */}
        {createdGarment && (
          <div>
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                QR Generado
              </h2>

              <div className="bg-gray-50 p-6 rounded-lg flex flex-col items-center justify-center">
                <div ref={qrRef} className="mb-4">
                  <QRCode
                    value={qrUrl}
                    size={128}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center font-mono break-all mb-4">
                  {qrUrl}
                </p>
              </div>

              <div className="space-y-3 mt-4">
                <button
                  onClick={downloadQR}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Descargar QR
                </button>

                <button
                  onClick={copyQRUrl}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <Copy className="w-5 h-5" />
                  {copied ? 'Copiado!' : 'Copiar URL'}
                </button>
              </div>

              <div className="mt-6 pt-6 border-t space-y-2">
                <p className="text-sm font-semibold text-gray-700">Información de la Prenda</p>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><strong>ID:</strong> <span className="font-mono">{createdGarment.id}</span></p>
                  <p><strong>Código:</strong> {createdGarment.code}</p>
                  <p><strong>Nombre:</strong> {createdGarment.name}</p>
                  <p><strong>Estado:</strong> <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{createdGarment.status}</span></p>
                </div>
              </div>

              <button
                onClick={() => setCreatedGarment(null)}
                className="btn-outline w-full mt-4 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Crear Otra Prenda
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CreateGarment
