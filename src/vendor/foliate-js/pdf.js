// Simple Reader: PDF is out of scope, so the upstream pdf.js (and vendor/pdfjs) is not vendored.
export const makePDF = () => {
    throw new Error('PDF is not supported')
}
