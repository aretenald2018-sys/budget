export function createProductPreviewService({ previewAdapter }) {
  if (typeof previewAdapter?.build !== 'function') throw new Error('product preview adapter required');
  return {
    async preview(rawUrl) {
      return previewAdapter.build(rawUrl);
    },
  };
}
