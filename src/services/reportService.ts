import jsPDF from 'jspdf'

export async function generateReportPDF(garments: any[]) {
  try {
    const doc = new jsPDF() as any
    const marginLeft = 10
    const marginRight = 10
    const pageWidth = doc.internal.pageSize.getWidth()
    let yPos = 15

    // ========== PAGE 1: RESUMEN ==========
    
    // Title
    doc.setFontSize(18)
    doc.setFont('Helvetica', 'bold')
    doc.text('REPORTE DE INVENTARIO DE PRENDAS', pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // Date
    doc.setFontSize(10)
    doc.setFont('Helvetica', 'normal')
    doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, marginLeft, yPos)
    yPos += 10

    // Summary stats
    doc.setFontSize(12)
    doc.setFont('Helvetica', 'bold')
    doc.text('RESUMEN EJECUTIVO', marginLeft, yPos)
    yPos += 6

    const stats = {
      total: garments.length,
      disponible: garments.filter((g: any) => g.status === 'disponible').length,
      lavado: garments.filter((g: any) => g.status === 'lavado').length,
      esterilizacion: garments.filter((g: any) => g.status === 'esterilizacion').length,
      inspeccion: garments.filter((g: any) => g.status === 'inspeccion').length,
      reparacion: garments.filter((g: any) => g.status === 'reparacion').length,
      baja: garments.filter((g: any) => g.status === 'baja').length
    }

    doc.setFontSize(10)
    doc.setFont('Helvetica', 'normal')
    doc.text(`Total de Prendas: ${stats.total}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Disponibles: ${stats.disponible}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Lavado: ${stats.lavado}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Esterilización: ${stats.esterilizacion}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Inspección: ${stats.inspeccion}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Reparación: ${stats.reparacion}`, marginLeft, yPos)
    yPos += 4
    doc.text(`Baja: ${stats.baja}`, marginLeft, yPos)
    yPos += 12

    // Table of all garments
    doc.setFontSize(12)
    doc.setFont('Helvetica', 'bold')
    doc.text('LISTADO DE PRENDAS', marginLeft, yPos)
    yPos += 6

    // Table headers
    doc.setFillColor(59, 130, 246)
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    
    const colWidths = { code: 25, name: 35, client: 35, status: 30, actions: 35 }
    const headerY = yPos - 3

    doc.rect(marginLeft, headerY, colWidths.code, 5, 'F')
    doc.text('Código', marginLeft + 1, yPos)
    
    doc.rect(marginLeft + colWidths.code, headerY, colWidths.name, 5, 'F')
    doc.text('Nombre', marginLeft + colWidths.code + 1, yPos)
    
    doc.rect(marginLeft + colWidths.code + colWidths.name, headerY, colWidths.client, 5, 'F')
    doc.text('Cliente', marginLeft + colWidths.code + colWidths.name + 1, yPos)
    
    doc.rect(marginLeft + colWidths.code + colWidths.name + colWidths.client, headerY, colWidths.status, 5, 'F')
    doc.text('Estado', marginLeft + colWidths.code + colWidths.name + colWidths.client + 1, yPos)

    yPos += 6
    doc.setTextColor(0, 0, 0)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)

    // Table rows
    garments.forEach((garment: any) => {
      if (yPos > 250) {
        doc.addPage()
        yPos = 15
      }

      const code = (garment.code || '-').substring(0, 15)
      const name = (garment.name || '-').substring(0, 18)
      const client = (garment.client_name || '-').substring(0, 18)
      const status = garment.status || '-'

      doc.text(code, marginLeft + 1, yPos)
      doc.text(name, marginLeft + colWidths.code + 1, yPos)
      doc.text(client, marginLeft + colWidths.code + colWidths.name + 1, yPos)
      doc.text(status, marginLeft + colWidths.code + colWidths.name + colWidths.client + 1, yPos)
      yPos += 4
    })

    // ========== DETAIL PAGES FOR EACH GARMENT ==========
    
    garments.forEach((garment: any) => {
      doc.addPage()
      yPos = 15

      // Detail title
      doc.setFontSize(14)
      doc.setFont('Helvetica', 'bold')
      doc.text(`DETALLE: ${garment.code}`, marginLeft, yPos)
      yPos += 8

      // Basic info
      doc.setFontSize(10)
      doc.setFont('Helvetica', 'bold')
      doc.text('INFORMACIÓN BÁSICA', marginLeft, yPos)
      yPos += 5

      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Código: ${garment.code}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Nombre: ${garment.name}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Cliente: ${garment.client_name || 'N/A'}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Estado: ${garment.status}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Creado: ${new Date(garment.created_at).toLocaleDateString('es-AR')}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Actualizado: ${new Date(garment.updated_at).toLocaleDateString('es-AR')}`, marginLeft, yPos)
      yPos += 8

      // Description
      if (garment.description) {
        doc.setFont('Helvetica', 'bold')
        doc.text('DESCRIPCIÓN', marginLeft, yPos)
        yPos += 4
        doc.setFont('Helvetica', 'normal')
        const descLines = doc.splitTextToSize(garment.description, pageWidth - marginLeft - marginRight)
        doc.text(descLines, marginLeft, yPos)
        yPos += (descLines.length * 3) + 4
      }

      // Action stats
      const actions = garment.actions || []
      const lavados = actions.filter((a: any) => a.action_type === 'lavado').length
      const esterilizaciones = actions.filter((a: any) => a.action_type === 'esterilizacion').length
      const reparaciones = actions.filter((a: any) => a.action_type === 'reparacion' || (a.action_type === 'inspeccion' && a.result === 'reparacion')).length

      yPos += 2
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('CONTADORES', marginLeft, yPos)
      yPos += 5

      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Lavados: ${lavados}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Esterilizaciones: ${esterilizaciones}`, marginLeft, yPos)
      yPos += 4
      doc.text(`Reparaciones: ${reparaciones}`, marginLeft, yPos)
      yPos += 8

      // Action history table
      if (actions.length > 0) {
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('HISTORIAL DE ACCIONES', marginLeft, yPos)
        yPos += 5

        // Table headers
        doc.setFillColor(59, 130, 246)
        doc.setTextColor(255, 255, 255)
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(8)

        const actColWidths = { date: 25, type: 25, result: 25, notes: 95 }
        const actHeaderY = yPos - 3

        doc.rect(marginLeft, actHeaderY, actColWidths.date, 4, 'F')
        doc.text('Fecha', marginLeft + 1, yPos)

        doc.rect(marginLeft + actColWidths.date, actHeaderY, actColWidths.type, 4, 'F')
        doc.text('Tipo', marginLeft + actColWidths.date + 1, yPos)

        doc.rect(marginLeft + actColWidths.date + actColWidths.type, actHeaderY, actColWidths.result, 4, 'F')
        doc.text('Resultado', marginLeft + actColWidths.date + actColWidths.type + 1, yPos)

        doc.rect(marginLeft + actColWidths.date + actColWidths.type + actColWidths.result, actHeaderY, actColWidths.notes, 4, 'F')
        doc.text('Notas', marginLeft + actColWidths.date + actColWidths.type + actColWidths.result + 1, yPos)

        yPos += 4
        doc.setTextColor(0, 0, 0)
        doc.setFont('Helvetica', 'normal')
        doc.setFontSize(7)

        actions.forEach((action: any) => {
          if (yPos > 270) {
            doc.addPage()
            yPos = 15
          }

          const date = new Date(action.created_at).toLocaleDateString('es-AR')
          const type = action.action_type || '-'
          const result = action.result || '-'
          const notes = (action.notes || '-').substring(0, 30)

          doc.text(date, marginLeft + 1, yPos)
          doc.text(type, marginLeft + actColWidths.date + 1, yPos)
          doc.text(result, marginLeft + actColWidths.date + actColWidths.type + 1, yPos)
          doc.text(notes, marginLeft + actColWidths.date + actColWidths.type + actColWidths.result + 1, yPos)

          yPos += 3.5
        })
      }
    })

    const filename = `ThreadTrack_Reporte_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(filename)
  } catch (error) {
    console.error('Error en generateReportPDF:', error)
    throw error
  }
}
