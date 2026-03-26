export class ManifestInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestInspectionError';
  }
}
