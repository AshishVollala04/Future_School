/**
 * Student photo saved on this device (localStorage). There is no server upload yet, so other
 * devices do not see it. Every read and write is guarded: storage can be blocked or full.
 */
const photoKey = (studentId: string) => `futureschool_student_photo:${studentId}`;

export const readStudentPhoto = (studentId: string): string | null => {
  if (!studentId) return null;
  try {
    return localStorage.getItem(photoKey(studentId));
  } catch {
    return null;
  }
};

/**
 * Shrinks a picked photo to at most `maxSide` px on its longest side and re-encodes it as JPEG.
 * A phone photo (2-5 MB) becomes roughly 30-80 KB, so several children's photos fit easily in
 * browser storage (about 5 MB per site). Rejects if the browser cannot decode the file (e.g. HEIC).
 */
export const shrinkPhoto = (file: File, maxSide = 512, quality = 0.85): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });

export const writeStudentPhoto = (studentId: string, dataUrl: string | null): boolean => {
  try {
    if (dataUrl) localStorage.setItem(photoKey(studentId), dataUrl);
    else localStorage.removeItem(photoKey(studentId));
    return true;
  } catch {
    return false;
  }
};
