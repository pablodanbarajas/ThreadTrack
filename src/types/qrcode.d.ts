declare module 'qrcode' {
  export interface QRCodeToCanvasOptions {
    width?: number
    margin?: number
    color?: {
      dark?: string
      light?: string
    }
  }

  export const toCanvas: (
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToCanvasOptions,
    callback?: (error: Error | null) => void
  ) => Promise<void>

  export const toDataURL: (
    text: string,
    options?: QRCodeToCanvasOptions
  ) => Promise<string>
}
