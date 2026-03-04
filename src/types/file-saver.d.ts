declare module 'file-saver' {
  export function saveAs(blob: Blob | File, filename: string, options?: any): void
}
