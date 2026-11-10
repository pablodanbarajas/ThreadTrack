// Placeholders de carga con la forma del contenido final
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx('animate-pulse rounded-md bg-gray-200/80', className)} />
)

/** Fila de tarjetas de indicadores (KPIs) */
export const SkeletonStats = ({ count = 4 }: { count?: number }) => (
  <div className={cx('grid gap-3', count >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3')}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-12" />
      </div>
    ))}
  </div>
)

/** Lista de tarjetas (inventario, usuarios, equipos) */
export const SkeletonList = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
      </div>
    ))}
  </div>
)

/** Bloque de panel con título y líneas */
export const SkeletonPanel = ({ lines = 4, className }: { lines?: number; className?: string }) => (
  <div className={cx('rounded-xl border border-gray-200 bg-white p-5', className)}>
    <Skeleton className="h-5 w-40" />
    <div className="mt-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-3', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  </div>
)

/** Encabezado de página (título + acciones) */
export const SkeletonHeader = () => (
  <div className="mb-6 flex items-center justify-between gap-4">
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-64" />
    </div>
    <Skeleton className="hidden h-9 w-32 rounded-lg sm:block" />
  </div>
)
