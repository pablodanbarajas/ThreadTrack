import { supabase } from '../lib/supabase'
import type { Document, DocumentInsert } from '../types'

export const documentService = {
  // Obtener documentos de una prenda
  async getByGarmentId(garmentId: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('garment_id', garmentId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Crear documento
  async create(document: DocumentInsert): Promise<Document> {
    const { data, error } = await supabase
      .from('documents')
      .insert(document)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Eliminar documento
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Obtener documento por ID
  async getById(id: string): Promise<Document | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },
}
