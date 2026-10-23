import { supabase } from '@/lib/supabase';

export async function cleanupAttachment(bucket: 'documents' | 'receipts', path: string | null) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  } catch {
    // The database change already succeeded. Never make the user resubmit it.
    console.warn('Attachment cleanup is pending; retry from storage administration.');
  }
}

/** Authenticate every download rather than issuing a transferable signed URL.
 * Downloading also avoids executing an uploaded HTML/SVG in our blob origin. */
export async function downloadDocument(path: string) {
  const { data, error } = await supabase.storage.from('documents').download(path);
  if (error || !data)
    throw new Error('Could not download the document. Check your access and try again.');
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = path.split('/').pop() || 'document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
