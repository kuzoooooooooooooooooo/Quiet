export const attachmentLimit = 25 * 1024 * 1024;
export function fileType(file: { title: string; fileType?: string }): string {
  const type = file.fileType || file.title.split('.').at(-1) || '';
  return /^[a-z0-9]{1,12}$/i.test(type) && (file.fileType || file.title.includes('.'))
    ? type.toLowerCase().replace(/^pttx$/, 'pptx')
    : 'file';
}
