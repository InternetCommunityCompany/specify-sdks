export function contained(run: () => void): boolean {
  try {
    run();
    return true;
  } catch {
    return false;
  }
}
