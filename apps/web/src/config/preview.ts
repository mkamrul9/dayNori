export const isCorePreview = process.env.NEXT_PUBLIC_DAYNORI_CORE_PREVIEW === 'true';

/** One-line banner for mobile PWA; details expand on demand. */
export const corePreviewSummary = 'Testing preview — some features are off.';

export const corePreviewDetails: readonly string[] = [
  'File uploads, audio attachments, and reminder delivery are unavailable here.',
  'The first request may take about a minute while the free server wakes up.',
  'Use sample or your own notes, tasks, routines, and journal entries.',
  'This is not the public store release.',
];

/** Legacy single-paragraph notice for Feedback components that need a string. */
export const corePreviewNotice = `${corePreviewSummary} ${corePreviewDetails.join(' ')}`;
